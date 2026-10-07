import { Job } from 'bullmq';
import pMap from 'p-map';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Scope } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios/axios.service';
import { HostPolicyService } from '@common/host-policy/host-policy.service';
import { hostPolicyRetryKey, syncHostPolicyForStart } from '@common/host-policy/sync-host-policy-for-start';
import { RawCacheService } from '@common/raw-cache';
import { nodeSupportsPlugins } from '@common/utils/node-version';
import { CACHE_KEYS, CACHE_KEYS_TTL } from '@libs/contracts/constants';

import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';
import { GetResolvedIntegrationsQuery } from '@modules/node-integrations/queries/get-resolved-integrations';
import { mergeNodeIntegrations } from '@modules/node-integrations/utils';
import { NodePluginEntity } from '@modules/node-plugins/entities';
import { GetAllPluginsQuery } from '@modules/node-plugins/queries/get-all-plugins';
import { NodesEntity } from '@modules/nodes';
import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';
import { FindNodesByCriteriaQuery } from '@modules/nodes/queries/find-nodes-by-criteria';
import { GetPreparedConfigWithUsersQuery } from '@modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.query';

import { NodesQueuesService } from '@queue/_nodes';

import { QUEUES_NAMES } from '../../queue.enum';
import { NODES_JOB_NAMES } from '../constants';

@Processor(
    {
        name: QUEUES_NAMES.NODES.START_ALL_BY_PROFILE,
        scope: Scope.REQUEST,
    },
    {
        concurrency: 5,
    },
)
export class StartAllNodesByProfileQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(StartAllNodesByProfileQueueProcessor.name);
    private readonly CONCURRENCY: number;

    constructor(
        private readonly axios: AxiosService,
        private readonly hostPolicies: HostPolicyService,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly queryBus: QueryBus,
        private readonly commandBus: CommandBus,
        private readonly rawCacheService: RawCacheService,
    ) {
        super();
        this.CONCURRENCY = 20;
    }

    async process(job: Job) {
        switch (job.name) {
            case NODES_JOB_NAMES.START_ALL_BY_PROFILE:
                return await this.handleStartAllNodesByProfile(job.data);
            default:
                this.logger.warn(`Job "${job.name}" is not handled.`);
                break;
        }
    }

    private async handleStartAllNodesByProfile(payload: {
        profileUuid: string;
        emitter: string;
        force?: boolean;
    }) {
        try {
            await this.nodesQueuesService.queues.startNode.pause();
            await this.nodesQueuesService.queues.startAllNodes.pause();
            const findNodesByCriteriaResult = await this.queryBus.execute(
                new FindNodesByCriteriaQuery({
                    isDisabled: false,
                    activeConfigProfileUuid: payload.profileUuid,
                }),
            );

            if (!findNodesByCriteriaResult.isOk) {
                return;
            }

            const { response: nodes } = findNodesByCriteriaResult;

            const activeInboundsOnNodes = new Map<string, ConfigProfileInboundEntity>();
            const activeNodeTags = new Map<string, string[]>();

            for (const node of nodes) {
                await this.rawCacheService.delMany([
                    CACHE_KEYS.NODE_SYSTEM_STATS(node.uuid),
                    CACHE_KEYS.NODE_USERS_ONLINE(node.uuid),
                    CACHE_KEYS.NODE_XRAY_UPTIME(node.uuid),
                ]);

                if (node.activeInbounds.length === 0) {
                    this.logger.warn(
                        `No active inbounds found for node ${node.uuid} with profile ${payload.profileUuid}, disabling and clearing profile from node...`,
                    );

                    await this.commandBus.execute(
                        new UpdateNodeCommand({
                            uuid: node.uuid,
                            isDisabled: true,
                            activeConfigProfileUuid: null,
                            isConnecting: false,
                            isConnected: false,
                            lastStatusMessage: null,
                            lastStatusChange: new Date(),
                        }),
                    );

                    await this.nodesQueuesService.stopNode({
                        nodeUuid: node.uuid,
                        isNeedToBeDeleted: false,
                    });

                    continue;
                }

                this.logger.log(
                    `Node ${node.uuid} has ${node.activeInbounds.length} active inbounds.`,
                );

                for (const inbound of node.activeInbounds) {
                    if (activeInboundsOnNodes.has(inbound.tag)) {
                        continue;
                    } else {
                        activeInboundsOnNodes.set(inbound.tag, inbound);
                    }
                }

                activeNodeTags.set(
                    node.uuid,
                    node.activeInbounds.map((inbound) => inbound.tag),
                );
            }

            if (activeInboundsOnNodes.size === 0) {
                return;
            }

            const pluginsResult = await this.queryBus.execute(new GetAllPluginsQuery(true));

            if (!pluginsResult.isOk) {
                this.logger.error(`Failed to get all plugins: ${pluginsResult.message}`);
                return;
            }

            const pluginsMap = new Map<string, NodePluginEntity>(
                pluginsResult.response.map((plugin) => [plugin.uuid, plugin]),
            );

            const integrationsResult = await this.queryBus.execute(
                new GetResolvedIntegrationsQuery([
                    ...new Set(nodes.flatMap((node) => node.integrationUuids)),
                ]),
            );

            if (!integrationsResult.isOk) {
                this.logger.error(`Failed to resolve integrations: ${integrationsResult.message}`);
                return;
            }

            const startTime = Date.now();

            const config = await this.queryBus.execute(
                new GetPreparedConfigWithUsersQuery(
                    payload.profileUuid,
                    Array.from(activeInboundsOnNodes.values()),
                ),
            );

            this.logger.log(`Generated config for nodes by Profile in ${Date.now() - startTime}ms`);

            if (!config.isOk) {
                throw new Error('Failed to get config');
            }

            const startNode = async (node: NodesEntity) => {
                const tags = activeNodeTags.get(node.uuid);

                if (!tags) {
                    throw new Error('Failed to get active node inbounds tags');
                }
                const activeNodeInboundsTags = new Set(tags);
                await this.commandBus.execute(new UpdateNodeCommand({
                    uuid: node.uuid,
                    isConnecting: true,
                }));

                const nodeIntegrations = mergeNodeIntegrations(
                    node.integrationUuids
                        .map((uuid) => integrationsResult.response.get(uuid))
                        .filter((integration) => integration !== undefined),
                );

                let pluginsSupported = true;
                const xrayStatusResponse = await this.axios.getNodeHealth({
                    address: node.address,
                    port: node.port,
                    proxyUrl: node.proxyUrl,
                });

                if (!xrayStatusResponse.isOk) {
                    await this.commandBus.execute(
                        new UpdateNodeCommand({
                            uuid: node.uuid,
                            lastStatusMessage: xrayStatusResponse.message ?? null,
                            lastStatusChange: new Date(),
                            isConnected: false,
                            isConnecting: false,
                        }),
                    );

                    this.logger.error(
                        `Pre-check failed. Node: ${node.uuid} – ${node.address}:${node.port}, error: ${xrayStatusResponse.message}`,
                    );

                    return;
                }

                if (!nodeSupportsPlugins(xrayStatusResponse.response.nodeVersion)) {
                    pluginsSupported = false;

                    this.logger.warn(
                        `Node ${node.uuid} does not expose the plugins API; starting Xray with its supported API`,
                    );
                }

                if (pluginsSupported) {
                    let plugin: {
                        uuid: string;
                        config: Record<string, unknown>;
                        name: string;
                    } | null = null;

                    if (node.activePluginUuid) {
                        const nodePlugin = pluginsMap.get(node.activePluginUuid);

                        if (!nodePlugin) {
                            this.logger.error(`Node plugin not found: ${node.activePluginUuid}`);
                            throw new Error('Assigned node plugin is unavailable. Check the assigned plugin and retry.');
                        }

                        plugin = {
                            uuid: nodePlugin.uuid,
                            config: nodePlugin.pluginConfig as Record<string, unknown>,
                            name: nodePlugin.name,
                        };
                    }

                    const syncNodePluginsResponse = await this.axios.syncNodePlugins(
                        {
                            plugin,
                        },
                        {
                            address: node.address,
                            port: node.port,
                            proxyUrl: node.proxyUrl,
                        },
                    );

                    if (!syncNodePluginsResponse.isOk) {
                        await this.commandBus.execute(
                            new UpdateNodeCommand({
                                uuid: node.uuid,
                                isConnecting: false,
                                isConnected: false,
                                lastStatusMessage: `Failed to sync node plugins: ${syncNodePluginsResponse.message}`,
                                lastStatusChange: new Date(),
                            }),
                        );

                        this.logger.error(
                            `Failed to sync node plugins: ${syncNodePluginsResponse.message}`,
                        );
                        return;
                    }
                }

                const filteredInboundsHashes = config.response.hashesPayload.inbounds.filter(
                    (inbound) => activeNodeInboundsTags.has(inbound.tag),
                );

                const policy = await syncHostPolicyForStart(node, this.hostPolicies, this.axios, this.rawCacheService);
                if (!policy.ready) {
                    await this.commandBus.execute(new UpdateNodeCommand({
                        uuid: node.uuid,
                        isConnected: policy.running,
                        isConnecting: false,
                        lastStatusChange: new Date(),
                        lastStatusMessage: policy.message,
                    }));
                    this.logger.warn(`Node ${node.uuid}: host policy pending; running=${policy.running}`);
                    return;
                }

                const startXrayResponse = await this.axios.startXray(
                    {
                        xrayConfig: {
                            ...config.response.config,
                            inbounds: config.response.config.inbounds!.filter(
                                (inbound) =>
                                    activeNodeInboundsTags.has(inbound.tag!) ||
                                    this.isUnsecureInbound(inbound.protocol),
                            ),
                        } as unknown as Record<string, unknown>,
                        internals: {
                            hashes: {
                                emptyConfig: config.response.hashesPayload.emptyConfig,
                                inbounds: filteredInboundsHashes,
                            },
                            forceRestart: payload.force ?? false,
                            metadata: {
                                uuid: node.uuid,
                                name: node.name,
                                countryCode: node.countryCode,
                                id: Number(node.id),
                                tags: node.tags,
                            },
                            integrations: nodeIntegrations,
                        },
                    },
                    {
                        address: node.address,
                        port: node.port,
                        proxyUrl: node.proxyUrl,
                    },
                );

                switch (startXrayResponse.isOk) {
                    case false:
                        await this.commandBus.execute(
                            new UpdateNodeCommand({
                                uuid: node.uuid,
                                lastStatusMessage: startXrayResponse.message ?? null,
                                lastStatusChange: new Date(),
                                isConnected: false,
                                isConnecting: false,
                            }),
                        );

                        return;
                    case true:
                        const nodeResponse = startXrayResponse.response;
                        if (nodeResponse.isStarted && !nodeResponse.error) {
                            await this.rawCacheService.delMany([hostPolicyRetryKey(node.uuid)]);
                        }

                        await this.rawCacheService.setMany([
                            {
                                key: CACHE_KEYS.NODE_SYSTEM_STATS(node.uuid),
                                value: nodeResponse.system?.stats ?? null,
                                ttlSeconds: CACHE_KEYS_TTL.NODE_SYSTEM_STATS,
                            },
                            {
                                key: CACHE_KEYS.NODE_SYSTEM_INFO(node.uuid),
                                value: nodeResponse.system?.info ?? null,
                            },
                            {
                                key: CACHE_KEYS.NODE_VERSIONS(node.uuid),
                                value:
                                    nodeResponse.nodeInformation.version && nodeResponse.version
                                        ? {
                                              xray: nodeResponse.version,
                                              node: nodeResponse.nodeInformation.version,
                                          }
                                        : null,
                            },
                        ]);

                        await this.commandBus.execute(
                            new UpdateNodeCommand({
                                uuid: node.uuid,
                                isConnected: nodeResponse.isStarted,
                                lastStatusMessage: nodeResponse.error ?? null,
                                lastStatusChange: new Date(),
                                isConnecting: false,
                            }),
                        );

                        return;
                }
            };

            const mapper = async (node: NodesEntity) => {
                try {
                    await startNode(node);
                } catch (error) {
                    await this.commandBus.execute(new UpdateNodeCommand({
                        uuid: node.uuid,
                        isConnecting: false,
                        lastStatusMessage: 'Node start failed. Check the configuration, assigned plugin and connection.',
                        lastStatusChange: new Date(),
                    }));
                    this.logger.error(`Failed to start node ${node.uuid}: ${error}`);
                }
            };
            await pMap(nodes.filter((node) => activeNodeTags.has(node.uuid)), mapper, {
                concurrency: this.CONCURRENCY,
            });

            this.logger.log(
                `Started all nodes with profile ${payload.profileUuid} in ${Date.now() - startTime}ms`,
            );
        } catch (error) {
            this.logger.error(
                `Error handling "${NODES_JOB_NAMES.START_ALL_BY_PROFILE}" job: ${error}`,
            );
        } finally {
            const resumed = await Promise.allSettled([
                this.nodesQueuesService.queues.startNode.resume(),
                this.nodesQueuesService.queues.startAllNodes.resume(),
            ]);
            for (const result of resumed) {
                if (result.status === 'rejected') this.logger.error(`Failed to resume node queue: ${result.reason}`);
            }
        }
    }

    private isUnsecureInbound(protocol: string): boolean {
        return ['dokodemo-door', 'http', 'mixed', 'tun', 'tunnel', 'wireguard'].includes(protocol);
    }
}
