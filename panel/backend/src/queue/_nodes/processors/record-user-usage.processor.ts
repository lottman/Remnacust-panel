import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { DurableUsageService, UsageEffects } from '@common/host-policy/durable-usage.service';
import { LegacyUsageService } from '@common/host-policy/legacy-usage.service';
import { UsageEffectsService } from '@common/host-policy/usage-effects.service';
import { RawCacheService } from '@common/raw-cache';
import { CACHE_KEYS, CACHE_KEYS_TTL } from '@libs/contracts/constants';

import { QUEUES_NAMES } from '@queue/queue.enum';

import { NODES_JOB_NAMES } from '../constants/nodes-job-name.constant';
import { IRecordUserUsagePayload } from '../interfaces';

@Processor(QUEUES_NAMES.NODES.RECORD_USER_USAGE, {
    concurrency: 20,
})
export class RecordUserUsageQueueProcessor extends WorkerHost {
    private readonly logger = new Logger(RecordUserUsageQueueProcessor.name);

    constructor(
        private readonly legacyUsage: LegacyUsageService,
        private readonly usageEffects: UsageEffectsService,
        private readonly rawCacheService: RawCacheService,
        private readonly durableUsage: DurableUsageService,
    ) {
        super();
    }

    async process(job: Job<IRecordUserUsagePayload>) {
        try {
            const { nodeUuid, connectionOpts, consumptionMultiplier, nodeId } = job.data;

            const node = {
                nodeUuid,
                nodeId: BigInt(nodeId),
                opts: {
                    address: connectionOpts.address,
                    port: connectionOpts.port,
                    proxyUrl: connectionOpts.proxyUrl,
                },
                multiplier: consumptionMultiplier,
            };
            const effects = (receipt: string, value: UsageEffects) =>
                this.usageEffects.apply(nodeUuid, node.nodeId, receipt, value);
            // Replay an already captured legacy response before the native stream.
            // The legacy service refuses new destructive reads in managed mode.
            const legacy = await this.legacyUsage.collect(node, effects);
            const collected = legacy ?? (await this.durableUsage.collect(node, effects));
            if (!collected) throw new Error('Usage mode changed during collection; retry');
            await this.rawCacheService.set(
                `xera:host-policy:stats:${nodeUuid}`,
                { ...collected, durable: legacy === null },
                90,
            );
        } catch (error) {
            this.logger.error(
                `Error handling "${NODES_JOB_NAMES.RECORD_USER_USAGE}" job: ${error}`,
            );
            await this.rawCacheService.set(
                CACHE_KEYS.NODE_USERS_ONLINE(job.data.nodeUuid),
                0,
                CACHE_KEYS_TTL.NODE_USERS_ONLINE,
            );
            throw error;
        }
    }
}
