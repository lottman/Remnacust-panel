import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AxiosService } from '@common/axios/axios.service';
import { HostPolicyService } from '@common/host-policy/host-policy.service';
import { hostPolicyRetryKey, syncHostPolicyForStart } from '@common/host-policy/sync-host-policy-for-start';
import { RawCacheService } from '@common/raw-cache';
import { formatExecutionTime, getTime } from '@common/utils/get-elapsed-time';
import { nodeSupportsPlugins } from '@common/utils/node-version';
import { CACHE_KEYS, CACHE_KEYS_TTL, EVENTS } from '@libs/contracts/constants';

import { NodeEvent } from '@integration-modules/notifications/interfaces';

import { GetResolvedIntegrationsQuery } from '@modules/node-integrations/queries/get-resolved-integrations';
import { mergeNodeIntegrations } from '@modules/node-integrations/utils';
import { GetPluginByUuidQuery } from '@modules/node-plugins/queries/get-plugin-by-uuid';
import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';
import { GetPreparedConfigWithUsersQuery } from '@modules/users/queries/get-prepared-config-with-users';

import { QUEUES_NAMES } from '@queue/queue.enum';

import { NODES_JOB_NAMES } from '../constants/nodes-job-name.constant';
import { NodesQueuesService } from '../nodes-queues.service';

@Processor(QUEUES_NAMES.NODES.START, {
    concurrency: 40,
})
export class StartNodeProcessor extends WorkerHost {
    private readonly logger = new Logger(StartNodeProcessor.name);

    constructor(
        private readonly axios: AxiosService,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly queryBus: QueryBus,
        private readonly eventEmitter: EventEmitter2,
        private readonly commandBus: CommandBus,
        private readonly rawCacheService: RawCacheService,
        private readonly hostPolicies: HostPolicyService,
    ) {
        super();
    }

    async process(job: Job<{ nodeUuid: string; force?: boolean }>) {
        let confirmedRunning = false;
        let startRequested = false;
        try {
            const { nodeUuid, force } = job.data;

            const nodeCheckup = await this.queryBus.execute(new GetNodeByUuidQuery(nodeUuid));

            if (!nodeCheckup.isOk) {
                this.logger.error(`Node ${nodeUuid} not found`);
                return;
            }

            const { response: node } = nodeCheckup;

            if (node.isConnecting) {
                return;
            }

            await this.rawCacheService.delMany([
                CACHE_KEYS.NODE_SYSTEM_STATS(nodeUuid),
                CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
                CACHE_KEYS.NODE_XRAY_UPTIME(nodeUuid),
            ]);

            if (node.activeInbounds.length === 0 || !node.activeConfigProfileUuid) {
                this.logger.warn(
                    `Node ${nodeUuid} has no active config profile or inbounds, disabling and clearing profile from node...`,
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

                return;
            }

            await this.commandBus.execute(
                new UpdateNodeCommand({
                    uuid: node.uuid,
                    isConnecting: true,
                }),
            );

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
            confirmedRunning = xrayStatusResponse.response.isAlive === true &&
                xrayStatusResponse.response.xrayInternalStatusCached === true;

            if (nodeSupportsPlugins(xrayStatusResponse.response.nodeVersion)) {
                let plugin: {
                    uuid: string;
                    config: Record<string, unknown>;
                    name: string;
                } | null = null;

                if (node.activePluginUuid) {
                    const getNodePluginResult = await this.queryBus.execute(
                        new GetPluginByUuidQuery(node.activePluginUuid),
                    );

                    if (!getNodePluginResult.isOk) {
                        this.logger.error(
                            `Failed to get node plugin: ${getNodePluginResult.message}`,
                        );
                        throw new Error('Assigned node plugin is unavailable. Check the assigned plugin and retry.');
                    }
                    const { response: nodePlugin } = getNodePluginResult;
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
            } else if (node.activePluginUuid) {
                this.logger.warn(
                    `Node ${node.uuid} does not support plugins; starting Xray without the assigned plugin`,
                );
            }

            const startTime = getTime();
            const config = await this.queryBus.execute(
                new GetPreparedConfigWithUsersQuery(
                    node.activeConfigProfileUuid,
                    node.activeInbounds,
                ),
            );

            this.logger.log(`Generated config for node in ${formatExecutionTime(startTime)}`);

            if (!config.isOk) {
                throw new Error('Failed to get config for node');
            }

            const integrationsResult = await this.queryBus.execute(
                new GetResolvedIntegrationsQuery(node.integrationUuids),
            );

            if (!integrationsResult.isOk) {
                throw new Error('Failed to resolve integrations for node');
            }

            const nodeIntegrations = mergeNodeIntegrations(
                node.integrationUuids
                    .map((uuid) => integrationsResult.response.get(uuid))
                    .filter((integration) => integration !== undefined),
            );

            const reqStartTime = getTime();

            const policy = await syncHostPolicyForStart(node, this.hostPolicies, this.axios, this.rawCacheService);
            if (!policy.ready) {
                await this.commandBus.execute(new UpdateNodeCommand({
                    uuid: node.uuid,
                    isConnected: policy.running,
                    isConnecting: false,
                    lastStatusMessage: policy.message,
                    lastStatusChange: new Date(),
                }));
                this.logger.warn(`Node ${node.uuid}: host policy pending; running=${policy.running}`);
                return;
            }

            startRequested = true;
            const startNodeResult = await this.axios.startXray(
                {
                    xrayConfig: config.response.config as unknown as Record<string, unknown>,
                    internals: {
                        hashes: config.response.hashesPayload,
                        forceRestart: force ?? false,
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

            this.logger.log(`Started node in ${formatExecutionTime(reqStartTime)}`);

            if (!startNodeResult.isOk) {
                await this.commandBus.execute(
                    new UpdateNodeCommand({
                        uuid: node.uuid,
                        lastStatusMessage: startNodeResult.message ?? null,
                        lastStatusChange: new Date(),
                        isConnected: false,
                        isConnecting: false,
                    }),
                );

                return;
            }

            const nodeResponse = startNodeResult.response;
            if (nodeResponse.isStarted && !nodeResponse.error) {
                await this.rawCacheService.delMany([hostPolicyRetryKey(node.uuid)]);
            }

            await this.rawCacheService.setMany([
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
                {
                    key: CACHE_KEYS.NODE_SYSTEM_STATS(node.uuid),
                    value: nodeResponse.system?.stats ?? null,
                    ttlSeconds: CACHE_KEYS_TTL.NODE_SYSTEM_STATS,
                },
            ]);

            const updateNodeResult = await this.commandBus.execute(
                new UpdateNodeCommand({
                    uuid: node.uuid,
                    isConnected: nodeResponse.isStarted,
                    lastStatusMessage: nodeResponse.error ?? null,
                    lastStatusChange: new Date(),
                    isConnecting: false,
                }),
            );

            if (!updateNodeResult.isOk) {
                this.logger.error(`Failed to update node ${node.uuid}`);
                return;
            }

            if (!node.isConnected && nodeResponse.isStarted) {
                this.eventEmitter.emit(
                    EVENTS.NODE.CONNECTION_RESTORED,
                    new NodeEvent(updateNodeResult.response, EVENTS.NODE.CONNECTION_RESTORED),
                );
            }

            return;
        } catch (error) {
            await this.commandBus.execute(
                new UpdateNodeCommand({
                    uuid: job.data.nodeUuid,
                    isConnecting: false,
                    isConnected: confirmedRunning && !startRequested,
                    lastStatusMessage:
                        error instanceof Error ? error.message.slice(0, 1000) : 'Node start failed',
                    lastStatusChange: new Date(),
                }),
            );
            this.logger.error(`Error handling "${NODES_JOB_NAMES.START_NODE}" job: ${error}`);
        }
    }
}
