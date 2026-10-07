import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AxiosService, INodeConnectionOpts } from '@common/axios';
import { INodeSystemStatsResponse } from '@common/axios/axios.interfaces';
import { hostPolicyRetryKey } from '@common/host-policy/sync-host-policy-for-start';
import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS, CACHE_KEYS_TTL, EVENTS } from '@libs/contracts/constants';

import { NodeEvent } from '@integration-modules/notifications/interfaces';

import { UpdateNodeCommand } from '@modules/nodes/commands/update-node';
import { NodeHealthLogService } from '@modules/nodes/node-health-log.service';

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
    ) {
        super();
    }
    async process(job: Job<INodeHealthCheckPayload>) {
        try {
            const { nodeUuid, isConnected, connectionOpts } = job.data;

            const attemptsLimit = 2;
            let attempts = 0;

            let message = '';

            while (attempts < attemptsLimit) {
                const statResult = await this.axios.getSystemStats(connectionOpts);

                switch (statResult.isOk) {
                    case true:
                        return await this.handleConnectedNode(
                            connectionOpts,
                            nodeUuid,
                            isConnected,
                            statResult.response,
                        );
                    case false:
                        message = statResult.message ?? 'Unknown error';
                        attempts++;
                        await this.healthLog.record({
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

            return await this.handleDisconnectedNode(nodeUuid, isConnected, message);
        } catch (error) {
            await this.healthLog.record({
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
    ) {
        if (stats.xrayInfo === null) {
            await this.healthLog.record({
                nodeUuid,
                status: 'xray_missing',
                message: 'Node answered without Xray information',
            });
            this.logger.error(`Node ${nodeUuid} – xrayInfo is null`);

            await this.commandBus.execute(
                new UpdateNodeCommand({
                    uuid: nodeUuid,
                    isConnected: false,
                    lastStatusChange: new Date(),
                    lastStatusMessage: 'Required info is missing. Outdated version?',
                }),
            );

            return;
        }

        await this.rawCacheService.setMany([
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
        const retryDue = typeof retryAt !== 'number' || !Number.isFinite(retryAt) || retryAt <= Date.now();

        if (!isConnected) {
            const nodeUpdatedResponse = await this.commandBus.execute(
                new UpdateNodeCommand({
                    uuid: nodeUuid,
                    isConnected: true,
                }),
            );

            if (!nodeUpdatedResponse.isOk) {
                return;
            }

            if (retryDue) {
                await this.nodesQueuesService.startNode({ nodeUuid });
            }

            this.eventEmitter.emit(
                EVENTS.NODE.CONNECTION_RESTORED,
                new NodeEvent(nodeUpdatedResponse.response, EVENTS.NODE.CONNECTION_RESTORED),
            );
        } else {
            if (typeof retryAt === 'number' && Number.isFinite(retryAt) && retryAt <= Date.now()) {
                await this.nodesQueuesService.startNode({ nodeUuid });
            }
        }

        return;
    }

    private async handleDisconnectedNode(
        nodeUuid: string,
        isConnected: boolean,
        message: string | undefined,
    ) {
        await this.healthLog.record({ nodeUuid, status: 'unreachable', attempt: 2, message });
        await this.rawCacheService.delMany([
            CACHE_KEYS.NODE_SYSTEM_INFO(nodeUuid),
            CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
            CACHE_KEYS.NODE_XRAY_UPTIME(nodeUuid),
        ]);

        const retryAt = await this.rawCacheService.get<number>(hostPolicyRetryKey(nodeUuid));
        const policyPending = typeof retryAt === 'number' && Number.isFinite(retryAt);
        const newNodeEntity = await this.commandBus.execute(
            new UpdateNodeCommand({
                uuid: nodeUuid,
                isConnected: false,
                lastStatusChange: new Date(),
                // Keep the upgrade/policy notice; the actual health error is in the health log.
                ...(policyPending ? {} : { lastStatusMessage: message }),
            }),
        );

        if (!newNodeEntity.isOk) {
            return;
        }

        if (!policyPending || retryAt <= Date.now()) {
            await this.nodesQueuesService.startNode({ nodeUuid });
        }

        if (isConnected) {
            this.eventEmitter.emit(
                EVENTS.NODE.CONNECTION_LOST,
                new NodeEvent(newNodeEntity.response, EVENTS.NODE.CONNECTION_LOST),
            );
        }

        this.logger.warn(
            `Lost connection to Node ${nodeUuid}, ${newNodeEntity.response.address}:${newNodeEntity.response.port}, message: ${message}`,
        );

        return;
    }
}
