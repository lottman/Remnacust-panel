import { Injectable, Logger } from '@nestjs/common';
import { Command, CommandBus, QueryBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AxiosService } from '@common/axios/axios.service';
import { HostPolicyService } from '@common/host-policy/host-policy.service';
import {
    hostPolicyRetryKey,
    syncHostPolicyForStart,
} from '@common/host-policy/sync-host-policy-for-start';
import { RawCacheService } from '@common/raw-cache';
import { ok } from '@common/types';
import { formatExecutionTime, getTime } from '@common/utils/get-elapsed-time';
import { nodeReconciliationEnrollment } from '@common/utils/node-reconciliation';
import { nodeSupportsPlugins } from '@common/utils/node-version';
import { CACHE_KEYS, CACHE_KEYS_TTL, EVENTS } from '@libs/contracts/constants';

import { NodeEvent } from '@integration-modules/notifications/interfaces';

import { GetResolvedIntegrationsQuery } from '@modules/node-integrations/queries/get-resolved-integrations';
import { mergeNodeIntegrations } from '@modules/node-integrations/utils';
import { GetPluginByUuidQuery } from '@modules/node-plugins/queries/get-plugin-by-uuid';
import { RecordPortPlanResultCommand } from '@modules/nodes/commands/record-port-plan-result';
import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';
import { PortPlanPreparationError } from '@modules/nodes/profile-port-plan';
import { GetDeviceStateRevisionQuery } from '@modules/nodes/queries/get-device-state-revision';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';
import {
    GetPreparedNodePortsQuery,
    PreparedNodePorts,
} from '@modules/nodes/queries/get-prepared-node-ports';
import { GetPreparedConfigWithUsersQuery } from '@modules/users/queries/get-prepared-config-with-users';

import { NODES_JOB_NAMES } from './constants/nodes-job-name.constant';
import { NodesQueuesService } from './nodes-queues.service';
import {
    PortPlanLeaseService,
    PortPlanLease,
    PortPlanLeaseLostError,
} from './port-plan-lease.service';

@Injectable()
export class NodeConfigurationService {
    private readonly logger = new Logger(NodeConfigurationService.name);

    constructor(
        private readonly axios: AxiosService,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly queryBus: QueryBus,
        private readonly eventEmitter: EventEmitter2,
        private readonly commandBus: CommandBus,
        private readonly rawCacheService: RawCacheService,
        private readonly hostPolicies: HostPolicyService,
        private readonly leases: PortPlanLeaseService,
    ) {}

    async apply(payload: { nodeUuid: string; force?: boolean }) {
        let confirmedRunning = false;
        let startRequested = false;
        let portPlan: PreparedNodePorts | null = null;
        let lease: PortPlanLease | null = null;
        let accepted = false;
        const executeCommand = <R>(command: Command<R>): Promise<R> =>
            lease
                ? lease.commit(() => this.commandBus.execute(command))
                : this.commandBus.execute(command);
        try {
            const { nodeUuid, force } = payload;

            const nodeCheckup = await this.queryBus.execute(new GetNodeByUuidQuery(nodeUuid));

            if (!nodeCheckup.isOk) {
                this.logger.error(`Node ${nodeUuid} not found`);
                return;
            }

            const { response: node } = nodeCheckup;

            if (node.isDisabled) return;
            const claimed = await this.leases.acquire(node.uuid);
            if (claimed === 'busy') return;
            lease = claimed;
            if (!lease && node.isConnecting) return;
            accepted = true;

            await this.rawCacheService.delMany([
                CACHE_KEYS.NODE_SYSTEM_STATS(nodeUuid),
                CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
                CACHE_KEYS.NODE_XRAY_UPTIME(nodeUuid),
            ]);

            if (!lease && (node.activeInbounds.length === 0 || !node.activeConfigProfileUuid)) {
                this.logger.warn(
                    `Node ${nodeUuid} has no active config profile or inbounds, disabling and clearing profile from node...`,
                );

                await executeCommand(
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

            await executeCommand(
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
                if (lease) throw new Error('Node health check failed; delivery will retry');
                await executeCommand(
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
            confirmedRunning =
                xrayStatusResponse.response.isAlive === true &&
                xrayStatusResponse.response.xrayInternalStatusCached === true;

            if (lease) {
                if (
                    !xrayStatusResponse.response.isAlive ||
                    xrayStatusResponse.response.portPlanDeliverySupported !== true ||
                    typeof xrayStatusResponse.response.portPlanDeliveryEpoch !== 'string'
                )
                    throw new Error('Update the node before applying an owned port-plan delivery');
                await lease.assert(xrayStatusResponse.response.portPlanDeliveryEpoch);
            }

            // Read the reconciliation clock before preparing any configuration.
            // A save during preparation must remain newer than our enrollment.
            const deviceRevision = await this.queryBus.execute(new GetDeviceStateRevisionQuery());
            portPlan = await this.queryBus.execute(
                new GetPreparedNodePortsQuery(
                    node.uuid,
                    xrayStatusResponse.response.profileGraphDeliverySupported === true,
                ),
            );
            if (!!portPlan !== !!lease) throw new PortPlanLeaseLostError();
            if (
                portPlan &&
                (portPlan.portPlanEnabled !== false
                    ? xrayStatusResponse.response.nativePortPlansSupported !== true
                    : xrayStatusResponse.response.portPlanStateSupported !== true &&
                      xrayStatusResponse.response.nativePortPlansSupported !== true)
            )
                throw new Error('Update the node and Xray Core before applying a native port plan');

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
                        throw new Error(
                            'Assigned node plugin is unavailable. Check the assigned plugin and retry.',
                        );
                    }
                    const { response: nodePlugin } = getNodePluginResult;
                    plugin = {
                        uuid: nodePlugin.uuid,
                        config: nodePlugin.pluginConfig as Record<string, unknown>,
                        name: nodePlugin.name,
                    };
                }

                await lease?.assert();
                const syncNodePluginsResponse = await this.axios.syncNodePlugins(
                    {
                        plugin,
                        ...(lease && portPlan
                            ? {
                                  portPlanDelivery: {
                                      revision: portPlan.portPlanRevision,
                                      enabled: portPlan.portPlanEnabled !== false,
                                      delivery: lease.delivery,
                                  },
                              }
                            : {}),
                    },
                    {
                        address: node.address,
                        port: node.port,
                        proxyUrl: node.proxyUrl,
                    },
                );

                await lease?.assert();
                if (
                    lease &&
                    (!syncNodePluginsResponse.isOk || !syncNodePluginsResponse.response.accepted)
                )
                    throw new Error('Node plugin preparation was not accepted');
                if (!syncNodePluginsResponse.isOk) {
                    await executeCommand(
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
            if (!node.activeConfigProfileUuid)
                throw new Error('No active configuration profile is assigned');
            const config = portPlan
                ? ok(portPlan)
                : await this.queryBus.execute(
                      new GetPreparedConfigWithUsersQuery(
                          node.activeConfigProfileUuid,
                          node.activeInbounds,
                      ),
                  );

            this.logger.log(`Generated config for node in ${formatExecutionTime(startTime)}`);

            if (!config.isOk) {
                throw new Error(config.message ?? 'Failed to get config for node');
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

            await lease?.assert();
            const policy = await syncHostPolicyForStart(
                node,
                this.hostPolicies,
                this.axios,
                this.rawCacheService,
            );
            await lease?.assert();
            if (!policy.ready) {
                if (lease) {
                    confirmedRunning = policy.running;
                    throw new Error(policy.message);
                }
                await executeCommand(
                    new UpdateNodeCommand({
                        uuid: node.uuid,
                        isConnected: policy.running,
                        isConnecting: false,
                        lastStatusMessage: policy.message,
                        lastStatusChange: new Date(),
                    }),
                );
                this.logger.warn(
                    `Node ${node.uuid}: host policy pending; running=${policy.running}`,
                );
                return;
            }

            await lease?.assert();
            startRequested = true;
            const startNodeResult = await this.axios.startXray(
                {
                    xrayConfig: {
                        ...(config.response.config as unknown as Record<string, unknown>),
                        ...(portPlan?.profileGraphs
                            ? { remnacustProfileGraphs: portPlan.profileGraphs }
                            : {}),
                    },
                    internals: {
                        reconciliation: nodeReconciliationEnrollment(node.uuid, deviceRevision),
                        hashes: config.response.hashesPayload,
                        forceRestart: force ?? false,
                        ...(portPlan
                            ? {
                                  portPlan: {
                                      revision: portPlan.portPlanRevision,
                                      enabled: portPlan.portPlanEnabled !== false,
                                      ...(lease ? { delivery: lease.delivery } : {}),
                                  },
                              }
                            : {}),
                        ...(portPlan && portPlan.portPlanEnabled !== false && !force
                            ? { requireLiveApply: true }
                            : {}),
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

            await lease?.assert();
            this.logger.log(`Started node in ${formatExecutionTime(reqStartTime)}`);

            if (!startNodeResult.isOk) {
                if (portPlan)
                    await executeCommand(
                        new RecordPortPlanResultCommand(
                            node.uuid,
                            portPlan.portPlanRevision,
                            false,
                        ),
                    );
                await executeCommand(
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
            confirmedRunning = nodeResponse.isStarted;
            startRequested = false;
            if (portPlan)
                await executeCommand(
                    new RecordPortPlanResultCommand(
                        node.uuid,
                        portPlan.portPlanRevision,
                        nodeResponse.isStarted && !nodeResponse.error,
                    ),
                );
            if (nodeResponse.isStarted && !nodeResponse.error) {
                await this.rawCacheService.delMany([hostPolicyRetryKey(node.uuid)]);
            }

            const telemetry = [
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
            ];
            if (lease)
                await this.rawCacheService.setManyFenced(
                    `remnacust:node-delivery-cache:${node.uuid}`,
                    lease.epoch,
                    telemetry,
                );
            else await this.rawCacheService.setMany(telemetry);

            const updateNodeResult = await executeCommand(
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
            if (!accepted || error instanceof PortPlanLeaseLostError) {
                this.logger.warn(`Node ${payload.nodeUuid}: delivery did not retain ownership`);
                return;
            }
            const failedRevision =
                portPlan?.portPlanRevision ??
                (error instanceof PortPlanPreparationError
                    ? error.portPlanRevision
                    : lease?.revision);
            if (failedRevision) {
                try {
                    await executeCommand(
                        new RecordPortPlanResultCommand(payload.nodeUuid, failedRevision, false),
                    );
                } catch (recordError) {
                    this.logger.error(
                        `Could not record port-plan failure for node ${payload.nodeUuid}: ${recordError}`,
                    );
                }
            }
            try {
                await executeCommand(
                    new UpdateNodeCommand({
                        uuid: payload.nodeUuid,
                        isConnecting: false,
                        isConnected: confirmedRunning && !startRequested,
                        lastStatusMessage:
                            error instanceof Error
                                ? error.message.slice(0, 1000)
                                : 'Node start failed',
                        lastStatusChange: new Date(),
                    }),
                );
            } catch {
                this.logger.warn(`Node ${payload.nodeUuid}: failure result could not be committed`);
            }
            this.logger.error(`Error handling "${NODES_JOB_NAMES.START_NODE}" job: ${error}`);
        } finally {
            if (lease)
                await lease
                    .close()
                    .catch(() =>
                        this.logger.warn(`Node ${payload.nodeUuid}: delivery lease will expire`),
                    );
        }
    }
}
