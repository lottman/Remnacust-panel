import { ERRORS } from '@contract/constants';
import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AxiosService, INodeConnectionOpts } from '@common/axios';
import { INodeSystemStatsResponse } from '@common/axios/axios.interfaces';
import { nodeBindingTrafficKey, parseProfileTraffic } from '@common/axios/profile-traffic.schema';
import { hostPolicyRetryKey } from '@common/host-policy/sync-host-policy-for-start';
import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS, CACHE_KEYS_TTL, EVENTS } from '@libs/contracts/constants';

import { NodeEvent } from '@integration-modules/notifications/interfaces';

import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';
import { NodeHealthLogService } from '@modules/nodes/node-health-log.service';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';

import { NodesQueuesService } from '@queue/_nodes';
import { QUEUES_NAMES } from '@queue/queue.enum';

import { NODES_JOB_NAMES } from '../constants/nodes-job-name.constant';
import { INodeHealthCheckPayload } from '../interfaces';

@Processor(QUEUES_NAMES.NODES.HEALTH_CHECK, {
    concurrency: 40,
})
export class NodeHealthCheckQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(NodeHealthCheckQueueProcessor.name);

    constructor(
        private readonly commandBus: CommandBus,
        private readonly eventEmitter: EventEmitter2,
        private readonly axios: AxiosService,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly rawCacheService: RawCacheService,
        private readonly healthLog: NodeHealthLogService,
        private readonly queryBus: QueryBus,
    ) {
        super();
    }
    async process(job: Job<INodeHealthCheckPayload>) {
        try {
            const { nodeUuid, isConnected, connectionOpts: queuedConnectionOpts } = job.data;
            const connectionOpts = { ...queuedConnectionOpts, uuid: nodeUuid };
            const observedAt = job.timestamp ?? Date.now();
            let controlRevision = job.data.controlRevision;
            let configurationPending = job.data.lastStatusMessage === '[NODE_UPDATE_PENDING]';
            if (!controlRevision) {
                const current = await this.queryBus.execute(new GetNodeByUuidQuery(nodeUuid));
                if (!current.isOk) return;
                controlRevision = current.response.controlRevision;
                configurationPending ||=
                    current.response.lastStatusMessage === '[NODE_UPDATE_PENDING]';
            }

            const attemptsLimit = 2;
            let attempts = 0;

            let message = '';

            while (attempts < attemptsLimit) {
                const statResult = await this.axios.getSystemStats(connectionOpts);
                if (!statResult.isOk && statResult.code === 'NODE_ROUTE_BUSY') return;
                if (!statResult.isOk && statResult.code === 'NODE_ROUTE_DISABLED') {
                    const updated = await this.commandBus.execute(
                        new UpdateNodeCommand(
                            {
                                uuid: nodeUuid,
                                isConnected: false,
                                isConnecting: false,
                                lastStatusMessage: '[NODE_CONTROL_DISABLED]',
                                ...(isConnected ? { lastStatusChange: new Date() } : {}),
                            },
                            controlRevision,
                        ),
                    );
                    if (!updated.isOk && updated.code === 'A266') return;
                    await this.clearLiveTelemetry(nodeUuid);
                    return;
                }
                if (
                    !statResult.isOk &&
                    (statResult.code === ERRORS.NODE_ERROR_500_WITH_MSG.code ||
                        statResult.code === 'NODE_HTTP_503')
                ) {
                    const health = await this.axios.getNodeHealth(connectionOpts);
                    if (!health.isOk && health.code === 'NODE_ROUTE_BUSY') return;
                    if (health.isOk && health.response.isAlive === true) {
                        const coreStopped = health.response.xrayInternalStatusCached === false;
                        if (coreStopped) {
                            const updated = await this.commandBus.execute(
                                new UpdateNodeCommand(
                                    {
                                        uuid: nodeUuid,
                                        isConnected: false,
                                        lastStatusMessage: '[NODE_CORE_NOT_READY]',
                                        ...(isConnected ? { lastStatusChange: new Date() } : {}),
                                    },
                                    controlRevision,
                                ),
                            );
                            if (!updated.isOk && updated.code === 'A266') return;
                            await this.clearLiveTelemetry(nodeUuid);
                            if (!updated.isOk) return;
                        }
                        await this.recordHealth({
                            nodeUuid,
                            status: 'retry',
                            message:
                                statResult.message ?? 'Node telemetry is temporarily unavailable',
                        });
                        if (coreStopped) {
                            await this.reportIncident(
                                nodeUuid,
                                false,
                                isConnected,
                                observedAt,
                                controlRevision,
                            );
                            await this.startNodeIfRetryDue(nodeUuid);
                        }
                        return;
                    }
                }

                switch (statResult.isOk) {
                    case true:
                        return await this.handleConnectedNode(
                            connectionOpts,
                            nodeUuid,
                            isConnected,
                            statResult.response,
                            observedAt,
                            configurationPending,
                            controlRevision,
                        );
                    case false:
                        message = statResult.message ?? 'Unknown error';
                        attempts++;
                        await this.recordHealth({
                            nodeUuid,
                            status: 'retry',
                            attempt: attempts,
                            message,
                        });

                        this.logger.warn(
                            `Node ${nodeUuid}, ${connectionOpts.address}:${connectionOpts.port} – health check attempt ${attempts} of ${attemptsLimit}, message: ${message}`,
                        );

                        continue;
                    default:
                        message = 'Unknown error';
                        this.logger.error(
                            `Node ${nodeUuid}, ${connectionOpts.address}:${connectionOpts.port} – health check attempt ${attempts} of ${attemptsLimit}, message: ${message}`,
                        );

                        attempts++;
                        continue;
                }
            }

            return await this.handleDisconnectedNode(
                nodeUuid,
                isConnected,
                message,
                observedAt,
                controlRevision,
            );
        } catch (error) {
            await this.recordHealth({
                nodeUuid: job.data.nodeUuid,
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
            });
            this.logger.error(
                `Error handling "${NODES_JOB_NAMES.NODE_HEALTH_CHECK}" job: ${error}`,
            );
            return;
        }
    }

    private async handleConnectedNode(
        connectionOpts: INodeConnectionOpts,
        nodeUuid: string,
        isConnected: boolean,
        stats: INodeSystemStatsResponse,
        observedAt: number,
        configurationPending = false,
        controlRevision?: string,
    ) {
        if (stats.xrayInfo === null) {
            const updated = await this.commandBus.execute(
                new UpdateNodeCommand(
                    {
                        uuid: nodeUuid,
                        isConnected: false,
                        lastStatusChange: new Date(),
                        lastStatusMessage: '[NODE_CORE_NOT_READY]',
                    },
                    controlRevision,
                ),
            );
            if (!updated.isOk && updated.code === 'A266') return;
            await this.clearLiveTelemetry(nodeUuid);
            await this.recordHealth({
                nodeUuid,
                status: 'xray_missing',
                message: 'Node answered without Xray information',
            });
            this.logger.error(`Node ${nodeUuid} – xrayInfo is null`);

            if (!updated.isOk) return;
            await this.reportIncident(nodeUuid, false, isConnected, observedAt, controlRevision);
            await this.startNodeIfRetryDue(nodeUuid);

            return;
        }

        await this.rawCacheService.setMany([
            {
                key: CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(nodeUuid),
                value: {
                    controlRevision: controlRevision ?? null,
                    stats: stats.system?.stats ?? null,
                    xrayUptime: stats.xrayInfo.uptime,
                },
                ttlSeconds: CACHE_KEYS_TTL.NODE_XRAY_UPTIME,
            },
            {
                key: nodeBindingTrafficKey(nodeUuid),
                value: parseProfileTraffic(stats.bindingTraffic),
                ttlSeconds: Math.min(CACHE_KEYS_TTL.NODE_SYSTEM_STATS, 120),
            },
            {
                key: CACHE_KEYS.NODE_SYSTEM_STATS(nodeUuid),
                value: stats.system?.stats ?? null,
                ttlSeconds: CACHE_KEYS_TTL.NODE_SYSTEM_STATS,
            },
            {
                key: CACHE_KEYS.NODE_XRAY_UPTIME(nodeUuid),
                value: stats.xrayInfo.uptime,
                ttlSeconds: CACHE_KEYS_TTL.NODE_XRAY_UPTIME,
            },
        ]);

        await this.healthLog.record({
            nodeUuid,
            status: 'ok',
            metrics: {
                memoryUsed: stats.system?.stats.memoryUsed ?? null,
                memoryTotal: stats.system
                    ? stats.system.stats.memoryUsed + stats.system.stats.memoryFree
                    : null,
                cpuCount: null,
                load1: stats.system?.stats.loadAvg[0] ?? null,
                load5: stats.system?.stats.loadAvg[1] ?? null,
                load15: stats.system?.stats.loadAvg[2] ?? null,
                xrayUptime: stats.xrayInfo.uptime,
            },
        });

        const reports = stats.plugins?.torrentBlocker?.reportsCount;
        if (reports !== undefined && reports > 0) {
            await this.nodesQueuesService.collectReports({
                nodeUuid,
                connectionOpts,
            });

            this.logger.log(`Node ${nodeUuid} has ${reports} reports, collecting reports...`);
        }

        const retryAt = await this.rawCacheService.get<number>(hostPolicyRetryKey(nodeUuid));
        const retryDue =
            typeof retryAt !== 'number' || !Number.isFinite(retryAt) || retryAt <= Date.now();

        if (!isConnected) {
            const nodeUpdatedResponse = await this.commandBus.execute(
                new UpdateNodeCommand(
                    {
                        uuid: nodeUuid,
                        isConnected: true,
                    },
                    controlRevision,
                ),
            );

            if (!nodeUpdatedResponse.isOk) {
                return;
            }

            if (retryDue) {
                await this.nodesQueuesService.startNode({ nodeUuid });
            }
        } else {
            if (
                (typeof retryAt === 'number' &&
                    Number.isFinite(retryAt) &&
                    retryAt <= Date.now()) ||
                ((stats.userStateSynchronized === false || configurationPending) && retryDue)
            ) {
                await this.nodesQueuesService.startNode({ nodeUuid });
            }
        }

        await this.reportIncident(nodeUuid, true, isConnected, observedAt, controlRevision);
        return;
    }

    private async startNodeIfRetryDue(nodeUuid: string): Promise<void> {
        const retryAt = await this.rawCacheService.get<number>(hostPolicyRetryKey(nodeUuid));
        if (typeof retryAt !== 'number' || !Number.isFinite(retryAt) || retryAt <= Date.now())
            await this.nodesQueuesService.startNode({ nodeUuid });
    }

    private async clearLiveTelemetry(nodeUuid: string, includeSystemInfo = false): Promise<void> {
        try {
            await this.rawCacheService.delMany([
                ...(includeSystemInfo ? [CACHE_KEYS.NODE_SYSTEM_INFO(nodeUuid)] : []),
                CACHE_KEYS.NODE_SYSTEM_STATS(nodeUuid),
                CACHE_KEYS.NODE_XRAY_UPTIME(nodeUuid),
                CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
                CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(nodeUuid),
                nodeBindingTrafficKey(nodeUuid),
            ]);
        } catch {
            this.logger.warn(`Could not clear stale telemetry for node ${nodeUuid}`);
        }
    }

    private async recordHealth(
        input: Parameters<NodeHealthLogService['record']>[0],
    ): Promise<void> {
        try {
            await this.healthLog.record(input);
        } catch {
            this.logger.warn(`Could not record node health for node ${input.nodeUuid}`);
        }
    }

    private async reportIncident(
        uuid: string,
        healthy: boolean,
        previouslyConnected: boolean,
        observedAt: number,
        controlRevision?: string,
    ) {
        try {
            const node = await this.queryBus.execute(new GetNodeByUuidQuery(uuid));
            if (!node.isOk || node.response.isDisabled) return;
            if (controlRevision !== undefined && node.response.controlRevision !== controlRevision)
                return;
            const [retryAt, maintenance, operation] = await Promise.all([
                this.rawCacheService.get<number>(hostPolicyRetryKey(uuid)),
                this.rawCacheService.get<number>(`remnacust:node-alert-mute:${uuid}`),
                this.rawCacheService.getString(`remnacust:node-operation:${uuid}`),
            ]);
            const muted =
                !!operation ||
                (typeof retryAt === 'number' && retryAt > Date.now()) ||
                (typeof maintenance === 'number' && maintenance > Date.now());
            const transition = await this.rawCacheService.observeNodeIncident(
                uuid,
                observedAt,
                healthy,
                muted,
                previouslyConnected,
            );
            if (!transition) return;
            const event =
                transition === 1 ? EVENTS.NODE.CONNECTION_LOST : EVENTS.NODE.CONNECTION_RESTORED;
            await this.eventEmitter.emitAsync(event, new NodeEvent(node.response, event));
            await this.rawCacheService.acknowledgeNodeIncident(uuid, observedAt, transition);
        } catch {
            // A notification transport/cache failure must not change node health.
            this.logger.warn(`Could not confirm notification state for node ${uuid}`);
        }
    }

    private async handleDisconnectedNode(
        nodeUuid: string,
        isConnected: boolean,
        message: string | undefined,
        observedAt: number,
        controlRevision?: string,
    ) {
        const newNodeEntity = await this.commandBus.execute(
            new UpdateNodeCommand(
                {
                    uuid: nodeUuid,
                    isConnected: false,
                    lastStatusChange: new Date(),
                    lastStatusMessage: message,
                },
                controlRevision,
            ),
        );
        if (!newNodeEntity.isOk && newNodeEntity.code === 'A266') return;
        await this.clearLiveTelemetry(nodeUuid, true);
        await this.recordHealth({ nodeUuid, status: 'unreachable', attempt: 2, message });

        if (!newNodeEntity.isOk) {
            return;
        }

        await this.reportIncident(nodeUuid, false, isConnected, observedAt, controlRevision);
        await this.startNodeIfRetryDue(nodeUuid);

        this.logger.warn(
            `Lost connection to Node ${nodeUuid}, ${newNodeEntity.response.address}:${newNodeEntity.response.port}, message: ${message}`,
        );

        return;
    }
}
