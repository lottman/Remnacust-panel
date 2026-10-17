import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';
import { EVENTS } from '@libs/contracts/constants';

import { BulkUpdateUserUsedTrafficBuilder } from '@modules/users/builders/bulk-update-user-used-traffic';

import { UsersQueuesService } from '@queue/_users/users-queues.service';

const integer = z
    .string()
    .refine(
        (value) => /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n,
    );
const payloadSchema = z
    .array(
        z.object({ u: integer.refine((value) => value !== '0'), b: integer, n: z.uuid() }).strict(),
    )
    .max(1500);
const digestOf = (payload: unknown) =>
    createHash('sha256').update(JSON.stringify(payload)).digest('hex');

export class LegacyBillingSourceError extends Error {}

@Injectable()
export class LegacyBillingService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly queues: UsersQueuesService,
    ) {}

    private standalone() {
        if (this.transactions.isTransactionActive())
            throw new Error('Legacy usage jobs require standalone commits');
    }

    private async assertBillingAllowed() {
        await sql`SELECT 1 FROM xera_assert_quota_restore_reconciled()`.execute(this.db.kysely);
    }

    async prepare(job: {
        id?: string;
        timestamp: number;
        queueName: string;
        prefix?: string;
        data: unknown;
    }): Promise<string> {
        this.standalone();
        if (!job.id || !Number.isSafeInteger(job.timestamp) || job.timestamp < 0)
            throw new LegacyBillingSourceError('Legacy usage job has no stable identity');
        const payload = payloadSchema.parse(job.data);
        if (new Set(payload.map((row) => row.u)).size !== payload.length)
            throw new LegacyBillingSourceError('Legacy usage job contains duplicate owner rows');
        const digest = digestOf(payload),
            receipt = digestOf([job.prefix ?? 'bull', job.queueName, job.id, job.timestamp]);
        const resolved = await sql<{
            digest: string;
        }>`SELECT source_digest AS digest FROM xera_legacy_quota_recovery_decisions WHERE receipt=${receipt}`.execute(
            this.db.kysely,
        );
        if (resolved.rows[0]) {
            if (resolved.rows[0].digest !== digest)
                throw new LegacyBillingSourceError('Legacy usage job changed after recovery');
            return receipt;
        }
        // This commit outlives Redis job retention and a failed billing transaction.
        await sql`INSERT INTO xera_legacy_usage_jobs(receipt,digest,payload)
            VALUES(${receipt},${digest},${JSON.stringify(payload)}::jsonb) ON CONFLICT DO NOTHING`.execute(
            this.db.kysely,
        );
        const existing = await sql<{
            digest: string;
        }>`SELECT digest FROM xera_legacy_usage_jobs WHERE receipt=${receipt}`.execute(
            this.db.kysely,
        );
        if (existing.rows[0]?.digest !== digest)
            throw new LegacyBillingSourceError('Legacy usage job changed after billing');
        return receipt;
    }

    protected async bill(payload: z.infer<typeof payloadSchema>): Promise<{ id: bigint }[]> {
        return this.transactions.tx.$queryRaw<{ id: bigint }[]>(
            new BulkUpdateUserUsedTrafficBuilder(payload).query,
        );
    }

    async settle(receipt: string): Promise<number> {
        this.standalone();
        if (!/^[a-f0-9]{64}$/.test(receipt)) throw new Error('Invalid legacy billing receipt');
        const committed = await this.transactions.withTransaction({ timeout: 30000 }, async () => {
            await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${receipt},20261017))`.execute(
                this.db.kysely,
            );
            const resolved = await sql<{
                count: number;
            }>`SELECT jsonb_array_length(plan_text::jsonb->'source'->'payload') AS count
                FROM xera_legacy_quota_recovery_decisions WHERE receipt=${receipt}`.execute(
                this.db.kysely,
            );
            if (resolved.rows[0])
                return { users: null, count: resolved.rows[0].count, resolved: true };
            // An immutable administrative decision already settled this receipt.
            // Completing that old queue job changes neither money nor events;
            // every unresolved job still meets the restore barrier below.
            await this.assertBillingAllowed();
            const result = await sql<{
                digest: string;
                payload: unknown;
                applied: boolean;
                users: string[] | null;
            }>`
                SELECT digest,payload,applied,pending_users AS users FROM xera_legacy_usage_jobs WHERE receipt=${receipt} FOR UPDATE`.execute(
                this.db.kysely,
            );
            const row = result.rows[0];
            if (!row) throw new Error('Legacy billing intent is missing');
            const payload = payloadSchema.parse(row.payload);
            if (
                digestOf(payload) !== row.digest ||
                new Set(payload.map((item) => item.u)).size !== payload.length
            )
                throw new Error('Legacy billing payload requires recovery');
            let users = row.users;
            if (!row.applied) {
                users = (await this.bill(payload)).map((user) => user.id.toString());
                await sql`UPDATE xera_legacy_usage_jobs SET applied=true,pending_users=${JSON.stringify(users)}::jsonb
                    WHERE receipt=${receipt}`.execute(this.db.kysely);
            }
            return { users, count: payload.length, resolved: false };
        });
        if (committed.resolved) return committed.count;
        await this.assertBillingAllowed();
        if (committed.users?.length)
            await this.queues.fireUserEventBulk(
                {
                    users: committed.users.map((id) => ({ id: BigInt(id) })),
                    userEvent: EVENTS.USER.FIRST_CONNECTED,
                },
                `${receipt}-1`,
            );
        await this.transactions.withTransaction({ timeout: 30000 }, async () => {
            await this.assertBillingAllowed();
            await sql`UPDATE xera_legacy_usage_jobs SET pending_users=NULL WHERE receipt=${receipt}`.execute(
                this.db.kysely,
            );
        });
        return committed.count;
    }

    async replayPending(limit = 100): Promise<number> {
        this.standalone();
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
            throw new Error('Invalid legacy replay batch');
        await this.assertBillingAllowed();
        const rows = await sql<{ receipt: string }>`SELECT receipt FROM xera_legacy_usage_jobs
            WHERE NOT applied OR pending_users IS NOT NULL ORDER BY committed_at,receipt LIMIT ${limit}`.execute(
            this.db.kysely,
        );
        for (const row of rows.rows) await this.settle(row.receipt);
        return rows.rows.length;
    }
}
