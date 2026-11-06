import { Job } from 'bullmq';
import pMap from 'p-map';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Scope } from '@nestjs/common';
import { Command, CommandBus, QueryBus } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios/axios.service';
import { HostPolicyService } from '@common/host-policy/host-policy.service';
import {
    hostPolicyRetryKey,
    syncHostPolicyForStart,
} from '@common/host-policy/sync-host-policy-for-start';
import { RawCacheService } from '@common/raw-cache';
import { nodeReconciliationEnrollment } from '@common/utils/node-reconciliation';
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
import { nodesUsingProfile } from '@modules/nodes/queries/find-nodes-by-criteria/find-nodes-by-criteria.query';
import { GetDeviceStateRevisionQuery } from '@modules/nodes/queries/get-device-state-revision';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';
import { GetPortPlanNodeUuidsQuery } from '@modules/nodes/queries/get-port-plan-node-uuids';
import { GetPreparedConfigWithUsersQuery } from '@modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.query';

import { NodesQueuesService } from '@queue/_nodes';

import { QUEUES_NAMES } from '../../queue.enum';
import { NODES_JOB_NAMES } from '../constants';
import { NodeConfigurationService } from '../node-configuration.service';
import {
    NodeDeliveryBusyError,
    NodeDeliveryLostError,
    PortPlanLeaseService,
} from '../port-plan-lease.service';

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
        private readonly configurations: NodeConfigurationService,
        private readonly deliveries: PortPlanLeaseService,
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
            const findNodesByCriteriaResult = await this.queryBus.execute(
                new FindNodesByCriteriaQuery(nodesUsingProfile(payload.profileUuid)),
            );

            if (!findNodesByCriteriaResult.isOk) {
                return;
            }

            const { response: nodes } = findNodesByCriteriaResult;

            return await this.hostPolicies.withCompatibilitySnapshot(
                nodes.map((node) => node.uuid),
                async () => {
                    // Port-managed nodes need their complete per-node plan. A shared
                    // profile payload would remove the other profiles' listeners.
                    const managedIds = new Set(
                        await this.queryBus.execute(
                            new GetPortPlanNodeUuidsQuery(nodes.map((node) => node.uuid)),
                        ),
                    );
                    await pMap(
                        nodes.filter((node) => managedIds.has(node.uuid)),
                        async (node) => {
                            try {
                                await this.configurations.apply({
                                    nodeUuid: node.uuid,
                                    force: payload.force,
                                });
                            } catch (error) {
                                if (
                                    error instanceof NodeDeliveryBusyError ||
                                    error instanceof NodeDeliveryLostError
                                ) {
                                    await this.nodesQueuesService.startNode({
                                        nodeUuid: node.uuid,
                                        force: payload.force,
                                    });
                                } else throw error;
                            }
                        },
                        { concurrency: this.CONCURRENCY },
                    );
                    const legacyNodes = nodes.filter(
                        (node) =>
                            !managedIds.has(node.uuid) &&
                            node.activeConfigProfileUuid === payload.profileUuid,
                    );

                    const eligibleNodes = new Set<string>();
                    await pMap(
                        legacyNodes,
                        async (node) => {
                            if (!node.activeInbounds.length) return;
                            const policy = await syncHostPolicyForStart(
                                node,
                                this.hostPolicies,
                                this.axios,
                                this.rawCacheService,
                            );
                            if (!policy.ready) {
                                try {
                                    await this.deliveries.withLifecycle(
                                        node.uuid,
                                        async (assert) => {
                                            await assert();
                                            await this.deliveries.commitLifecycleStatus(node, () =>
                                                this.commandBus.execute(
                                                    new UpdateNodeCommand({
                                                        uuid: node.uuid,
                                                        isConnected: policy.running,
                                                        isConnecting: false,
                                                        lastStatusChange: new Date(),
                                                        lastStatusMessage: policy.message,
                                                    }),
                                                ),
                                            );
                                        },
                                    );
                                } catch (error) {
                                    if (
                                        error instanceof NodeDeliveryBusyError ||
                                        error instanceof NodeDeliveryLostError
                                    )
                                        await this.nodesQueuesService.startNode({
                                            nodeUuid: node.uuid,
                                            force: payload.force,
                                        });
                                    else throw error;
                                }
                                this.logger.warn(
                                    `Node ${node.uuid}: host policy pending; running=${policy.running}`,
                                );
                                return;
                            }

                            eligibleNodes.add(node.uuid);
                        },
                        { concurrency: 3 },
                    );

                    const activeInboundsOnNodes = new Map<string, ConfigProfileInboundEntity>();
                    const activeNodeTags = new Map<string, string[]>();

                    for (const node of legacyNodes) {
                        if (node.activeInbounds.length && !eligibleNodes.has(node.uuid)) continue;
                        await this.rawCacheService.delMany([
                            CACHE_KEYS.NODE_SYSTEM_STATS(node.uuid),
                            CACHE_KEYS.NODE_USERS_ONLINE(node.uuid),
                            CACHE_KEYS.NODE_XRAY_UPTIME(node.uuid),
                        ]);

                        if (node.activeInbounds.length === 0) {
                            await this.nodesQueuesService.startNode({
                                nodeUuid: node.uuid,
                                force: payload.force,
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
                            ...new Set(legacyNodes.flatMap((node) => node.integrationUuids)),
                        ]),
                    );

                    if (!integrationsResult.isOk) {
                        this.logger.error(
                            `Failed to resolve integrations: ${integrationsResult.message}`,
                        );
                        return;
                    }

                    const startTime = Date.now();
                    const deviceRevision = await this.queryBus.execute(
                        new GetDeviceStateRevisionQuery(),
                    );

                    const config = await this.queryBus.execute(
                        new GetPreparedConfigWithUsersQuery(
                            payload.profileUuid,
                            Array.from(activeInboundsOnNodes.values()),
                        ),
                    );

                    this.logger.log(
                        `Generated config for nodes by Profile in ${Date.now() - startTime}ms`,
                    );

                    if (!config.isOk) {
                        throw new Error(config.message ?? 'Failed to get config');
                    }

                    const startNode = async (
                        node: NodesEntity,
                        assertOwnership: () => Promise<void>,
                    ) => {
                        const executeNodeCommand = async <R>(command: Command<R>): Promise<R> => {
                            await assertOwnership();
                            const result = await this.deliveries.commitLifecycleStatus(node, () =>
                                this.commandBus.execute(command),
                            );
                            if (result === undefined)
                                throw new NodeDeliveryLostError(
                                    'Node desired state changed during bulk delivery',
                                );
                            return result;
                        };
                        const tags = activeNodeTags.get(node.uuid);

                        if (!tags) {
                            throw new Error('Failed to get active node inbounds tags');
                        }
                        const activeNodeInboundsTags = new Set(tags);
                        await executeNodeCommand(
                            new UpdateNodeCommand({
                                uuid: node.uuid,
                                isConnecting: true,
                            }),
                        );

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
                            await executeNodeCommand(
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
                                    this.logger.error(
                                        `Node plugin not found: ${node.activePluginUuid}`,
                                    );
                                    throw new Error(
                                        'Assigned node plugin is unavailable. Check the assigned plugin and retry.',
                                    );
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
                                await executeNodeCommand(
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

                        const filteredInboundsHashes =
                            config.response.hashesPayload.inbounds.filter((inbound) =>
                                activeNodeInboundsTags.has(inbound.tag),
                            );

                        await assertOwnership();
                        const latest = await this.queryBus.execute(
                            new GetNodeByUuidQuery(node.uuid),
                        );
                        if (
                            !latest.isOk ||
                            latest.response.isDisabled ||
                            latest.response.activeConfigProfileUuid !==
                                node.activeConfigProfileUuid ||
                            latest.response.address !== node.address ||
                            latest.response.port !== node.port ||
                            latest.response.proxyUrl !== node.proxyUrl
                        )
                            throw new NodeDeliveryLostError(
                                'Node desired state changed before bulk delivery',
                            );
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
                                    reconciliation: nodeReconciliationEnrollment(
                                        node.uuid,
                                        deviceRevision,
                                    ),
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
                                await executeNodeCommand(
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
                                    await this.rawCacheService.delMany([
                                        hostPolicyRetryKey(node.uuid),
                                    ]);
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
                                            nodeResponse.nodeInformation.version &&
                                            nodeResponse.version
                                                ? {
                                                      xray: nodeResponse.version,
                                                      node: nodeResponse.nodeInformation.version,
                                                  }
                                                : null,
                                    },
                                ]);

                                await executeNodeCommand(
                                    new UpdateNodeCommand({
                                        uuid: node.uuid,
                                        isConnected: nodeResponse.isStarted,
                                        lastStatusMessage:
                                            nodeResponse.error ??
                                            (await this.rawCacheService.get<string>(
                                                `remnacust:node-compatibility:${node.uuid}`,
                                            )) ??
                                            null,
                                        lastStatusChange: new Date(),
                                        isConnecting: false,
                                    }),
                                );

                                return;
                        }
                    };

                    const mapper = async (node: NodesEntity) => {
                        try {
                            await this.deliveries.withLifecycle(node.uuid, async (assert) => {
                                const current = await this.queryBus.execute(
                                    new GetNodeByUuidQuery(node.uuid),
                                );
                                if (!current.isOk || current.response.isDisabled) return;
                                if (
                                    current.response.activeConfigProfileUuid !==
                                        node.activeConfigProfileUuid ||
                                    current.response.address !== node.address ||
                                    current.response.port !== node.port ||
                                    current.response.proxyUrl !== node.proxyUrl
                                )
                                    throw new NodeDeliveryLostError(
                                        'Node profile or endpoint changed before bulk delivery',
                                    );
                                try {
                                    await startNode(node, assert);
                                } catch (error) {
                                    if (error instanceof NodeDeliveryLostError) throw error;
                                    await assert();
                                    await this.deliveries.commitLifecycleStatus(node, () =>
                                        this.commandBus.execute(
                                            new UpdateNodeCommand({
                                                uuid: node.uuid,
                                                isConnecting: false,
                                                lastStatusMessage:
                                                    'Node start failed. Check the configuration, assigned plugin and connection.',
                                                lastStatusChange: new Date(),
                                            }),
                                        ),
                                    );
                                    throw error;
                                }
                            });
                        } catch (error) {
                            if (
                                error instanceof NodeDeliveryBusyError ||
                                error instanceof NodeDeliveryLostError
                            ) {
                                await this.nodesQueuesService.startNode({
                                    nodeUuid: node.uuid,
                                    force: payload.force,
                                });
                                return;
                            }
                            this.logger.error(`Failed to start node ${node.uuid}: ${error}`);
                        }
                    };
                    await pMap(
                        legacyNodes.filter((node) => activeNodeTags.has(node.uuid)),
                        mapper,
                        {
                            concurrency: this.CONCURRENCY,
                        },
                    );

                    this.logger.log(
                        `Started all nodes with profile ${payload.profileUuid} in ${Date.now() - startTime}ms`,
                    );
                },
                true,
            );
        } catch (error) {
            this.logger.error(
                `Error handling "${NODES_JOB_NAMES.START_ALL_BY_PROFILE}" job: ${error}`,
            );
        }
    }

    private isUnsecureInbound(protocol: string): boolean {
        return ['dokodemo-door', 'http', 'mixed', 'tun', 'tunnel', 'wireguard'].includes(protocol);
    }
}
