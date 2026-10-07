import { HostUsageService } from '@common/host-policy/host-usage.service';
import { Job } from 'bullmq';
import ems from 'enhanced-ms';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';

import { GetUsersStatsCommand } from '@remnawave/node-contract';

import { AxiosService } from '@common/axios';
import { TypedConfigService } from '@common/config/app-config';
import { RawCacheService } from '@common/raw-cache';
import { multiplyConsumption } from '@common/utils/nano';
import { usageOwner } from '@common/utils/device-identity';
import {
    CACHE_KEYS,
    CACHE_KEYS_TTL,
    INTERNAL_CACHE_KEYS,
    INTERNAL_CACHE_KEYS_TTL,
} from '@libs/contracts/constants';

import { UsersQueuesService } from '@queue/_users';
import { PushFromRedisQueueService } from '@queue/push-from-redis/push-from-redis.service';
import { QUEUES_NAMES } from '@queue/queue.enum';

import { NODES_JOB_NAMES } from '../constants/nodes-job-name.constant';
import { IRecordUserUsagePayload } from '../interfaces';

@Processor(QUEUES_NAMES.NODES.RECORD_USER_USAGE, {
    concurrency: 20,
})
export class RecordUserUsageQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(RecordUserUsageQueueProcessor.name);
    private readonly ignoreBelowBytes: bigint;

    constructor(
        private readonly hostUsage:HostUsageService,
        private readonly commandBus: CommandBus,
        private readonly axios: AxiosService,
        private readonly configService: TypedConfigService,
        private readonly usersQueuesService: UsersQueuesService,
        private readonly pushFromRedisQueueService: PushFromRedisQueueService,
        private readonly rawCacheService: RawCacheService,
    ) {
        super();

        this.ignoreBelowBytes = this.configService.getOrThrow('USER_USAGE_IGNORE_BELOW_BYTES');
    }

    async process(job: Job<IRecordUserUsagePayload>) {
        try {
            const { nodeUuid, connectionOpts, consumptionMultiplier, nodeId } = job.data;

            const queryResult = await this.axios.getUsersStats(
                {
                    reset: true,
                },
                {
                    address: connectionOpts.address,
                    port: connectionOpts.port,
                    proxyUrl: connectionOpts.proxyUrl,
                },
            );

            switch (queryResult.isOk) {
                case true:

                    return await this.handleOk(
                        nodeUuid,
                        BigInt(nodeId),
                        queryResult.response,
                        consumptionMultiplier,
                    );
                case false:
                    await this.rawCacheService.set(
                        CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
                        0,
                        CACHE_KEYS_TTL.NODE_USERS_ONLINE,
                    );

                    this.logger.error(
                        `Failed to get users stats, node: ${nodeUuid} – ${connectionOpts.address}:${connectionOpts.port}, error: ${JSON.stringify(
                            queryResult,
                        )}`,
                    );

                    return;
            }
        } catch (error) {
            this.logger.error(
                `Error handling "${NODES_JOB_NAMES.RECORD_USER_USAGE}" job: ${error}`,
            );
            return;
        }
    }

    private async handleOk(
        nodeUuid: string,
        nodeId: bigint,
        response: GetUsersStatsCommand.Response['response'],
        consumptionMultiplier: string,
    ) {
        const start = performance.now();

        try {
            await this.hostUsage.record(nodeId,response.users);
            await this.rawCacheService.set(`xera:host-policy:stats:${nodeUuid}`, true, 90);
            if (response.users.length === 0) {
                await this.rawCacheService.set(
                    CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
                    0,
                    CACHE_KEYS_TTL.NODE_USERS_ONLINE,
                );

                return;
            }

            const userUsageList: { u: string; b: string; n: string }[] = [];
            const usageByOwner = new Map<string, bigint>();

            const nodeRedisKey = INTERNAL_CACHE_KEYS.NODE_USER_USAGE(nodeId);

            const pipeline = this.rawCacheService.createPipeline();

            for (const user of response.users) {
                const ownerId = usageOwner(user.username);
                if (ownerId === null) continue;
                const totalBytes = BigInt(user.downlink) + BigInt(user.uplink);
                if (user.downlink < 0 || user.uplink < 0 || totalBytes <= 0n) continue;
                usageByOwner.set(ownerId, (usageByOwner.get(ownerId) ?? 0n) + totalBytes);
            }

            // Personal keys are separate Xray identities, not separate subscribers.
            // Aggregate before counting online users and before applying billing thresholds.
            for (const [ownerId, totalBytes] of usageByOwner) {
                pipeline.hincrby(nodeRedisKey, ownerId, totalBytes.toString());
                if (totalBytes < this.ignoreBelowBytes) continue;

                userUsageList.push({
                    u: ownerId,
                    b: multiplyConsumption(consumptionMultiplier, totalBytes).toString(),
                    n: nodeUuid,
                });
            }

            pipeline.expire(nodeRedisKey, INTERNAL_CACHE_KEYS_TTL.NODE_USER_USAGE);

            await pipeline.exec();

            await this.rawCacheService.set(
                CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
                usageByOwner.size,
                CACHE_KEYS_TTL.NODE_USERS_ONLINE,
            );

            await this.usersQueuesService.updateUserUsage(userUsageList);

            await this.pushFromRedisQueueService.recordUserUsageDelayed({
                redisKey: nodeRedisKey,
            });

            return;
        } catch (error) {
            this.logger.error(
                `Error handling "${NODES_JOB_NAMES.RECORD_USER_USAGE}" job: ${error}`,
            );
            return { isOk: false };
        } finally {
            const elapsedTime = performance.now() - start;
            if (elapsedTime > 2_000) {
                this.logger.warn(
                    `[${nodeUuid}] took ${ems(elapsedTime, {
                        extends: 'short',
                        includeMs: true,
                    })}`,
                );
            }
        }
    }
}
