import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { z } from 'zod';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

import { USERS_JOB_NAMES } from '@queue/_users/constants/users-job-name.constant';
import { UsersQueuesService } from '@queue/_users/users-queues.service';

import { LegacyBillingService, LegacyBillingSourceError } from './legacy-billing.service';
import { LegacyRecoveryError, legacyQueueCapture } from './legacy-recovery-plan';

@Injectable()
export class LegacyQueueRecoveryService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly queues: UsersQueuesService,
        private readonly billing: LegacyBillingService,
    ) {}

    private async pending(generation: string) {
        const result = await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton
            AND generation=${generation}::uuid AND reconciled_at IS NULL`.execute(this.db.kysely);
        if (!result.rows.length) throw new LegacyRecoveryError('NOT_PENDING');
    }

    private bounded<T>(operation: Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new LegacyRecoveryError('QUEUE_UNAVAILABLE')),
                3000,
            );
            operation.then(
                (value) => {
                    clearTimeout(timer);
                    resolve(value);
                },
                () => {
                    clearTimeout(timer);
                    reject(new LegacyRecoveryError('QUEUE_UNAVAILABLE'));
                },
            );
        });
    }

    async capture(input: z.infer<typeof legacyQueueCapture>) {
        if (this.transactions.isTransactionActive())
            throw new Error('Queue recovery requires standalone commits');
        await this.pending(input.generation);
        const queue = this.queues.queues.updateUsersUsage;
        const jobs = await this.bounded(
            queue.getJobs(['failed'], input.offset, input.offset + 19, true),
        );
        const entries: {
            receipt: string | null;
            state: 'CAPTURED' | 'RETRY_SCHEDULED' | 'RETRY_REQUIRED' | 'INVALID_SOURCE';
        }[] = [];
        for (let offset = 0; offset < jobs.length; offset += 4) {
            const batch = await Promise.all(
                jobs.slice(offset, offset + 4).map(async (job) => {
                    await this.pending(input.generation);
                    if (job.name !== USERS_JOB_NAMES.UPDATE_USERS_USAGE)
                        return { receipt: null, state: 'INVALID_SOURCE' as const };
                    let receipt: string;
                    try {
                        // Reuse the worker's exact queue identity, timestamp and
                        // canonical payload. This never bills or acknowledges data.
                        receipt = await this.billing.prepare(job);
                    } catch (error) {
                        if (
                            error instanceof z.ZodError ||
                            error instanceof LegacyBillingSourceError
                        )
                            return { receipt: null, state: 'INVALID_SOURCE' as const };
                        throw error;
                    }
                    const decided = await sql`SELECT 1 FROM xera_legacy_quota_recovery_decisions
                    WHERE receipt=${receipt}`.execute(this.db.kysely);
                    if (!decided.rows.length) return { receipt, state: 'CAPTURED' as const };
                    await this.pending(input.generation);
                    try {
                        // Bull checks the failed state and lock atomically. A retry
                        // retains identity and is revalidated by the normal worker.
                        await this.bounded(job.retry('failed'));
                        return { receipt, state: 'RETRY_SCHEDULED' as const };
                    } catch {
                        return { receipt, state: 'RETRY_REQUIRED' as const };
                    }
                }),
            );
            entries.push(...batch);
        }
        await this.pending(input.generation);
        // Queue ranks can move as workers finish. This is a bounded discovery
        // page, never a proof of an empty queue or permission to resume traffic.
        return { entries, nextOffset: jobs.length === 20 ? input.offset + 20 : null };
    }
}
