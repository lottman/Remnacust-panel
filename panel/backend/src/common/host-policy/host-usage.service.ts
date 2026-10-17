import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { GetUsersStatsCommand } from '@remnawave/node-contract';

import { TxKyselyService } from '@common/database';
import { RawCacheService } from '@common/raw-cache';
import { TResult } from '@common/types';
import { parseHostIdentity } from '@common/utils/host-identity';

@Injectable()
export class HostUsageService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly cache: RawCacheService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
    ) {}
    async record(
        nodeId: bigint,
        users: { username: string; uplink: number; downlink: number }[],
    ): Promise<void> {
        this.requireStandalone();
        await this.assertBillingAllowed();
        const key = await this.stage(nodeId, users);
        const receipts = await this.transactions.withTransaction({ timeout: 30000 }, () =>
            this.applyPending(nodeId, key),
        );
        await this.acknowledge(key, receipts);
    }

    async drain(nodeId: bigint): Promise<void> {
        this.requireStandalone();
        const key = `xera:host-usage:pending:${nodeId}`;
        const receipts = await this.transactions.withTransaction({ timeout: 30000 }, async () => {
            await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${nodeId.toString()},20261016))`.execute(
                this.db.kysely,
            );
            return this.applyPending(nodeId, key);
        });
        await this.acknowledge(key, receipts);
    }

    async collect(
        nodeId: bigint,
        read: () => Promise<TResult<GetUsersStatsCommand.Response['response']>>,
        beforeRead?: () => Promise<void>,
    ) {
        this.requireStandalone();
        const collected = await this.transactions.withTransaction({ timeout: 30000 }, async () => {
            await this.assertBillingAllowed();
            // BullMQ can retry a stalled job on another worker. Serialize the
            // destructive counter read through SQL, not just a queue job ID.
            await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${nodeId.toString()},20261016))`.execute(
                this.db.kysely,
            );
            await beforeRead?.();
            await this.assertBillingAllowed();
            const clock = await sql<{
                requestedAt: string;
            }>`SELECT floor(extract(epoch FROM clock_timestamp())*1000)::text AS "requestedAt"`.execute(
                this.db.kysely,
            );
            const requestedAt = Number(clock.rows[0].requestedAt);
            const result = await read();
            if (!result.isOk) return { result, requestedAt, key: '', receipts: [] as string[] };
            const key = await this.stage(nodeId, result.response.users);
            const receipts = await this.applyPending(nodeId, key);
            return { result, requestedAt, key, receipts };
        });
        // Never delete a Redis receipt inside the SQL transaction. A commit
        // failure must leave the sample available for an idempotent replay.
        if (collected.key) await this.acknowledge(collected.key, collected.receipts);
        return { result: collected.result, requestedAt: collected.requestedAt };
    }

    private requireStandalone() {
        if (this.transactions.isTransactionActive())
            throw new Error('Host usage collection must commit before acknowledging its receipts');
    }

    private async assertBillingAllowed() {
        await sql`SELECT 1 FROM xera_assert_quota_restore_reconciled()`.execute(this.db.kysely);
    }

    private async stage(
        nodeId: bigint,
        users: { username: string; uplink: number; downlink: number }[],
    ) {
        const records = new Map<string, { userId: string; hostUuid: string; bytes: bigint }>();
        for (const user of users) {
            const identity = parseHostIdentity(user.username);
            if (
                !identity ||
                !Number.isSafeInteger(user.uplink) ||
                !Number.isSafeInteger(user.downlink) ||
                user.uplink < 0 ||
                user.downlink < 0
            )
                continue;
            const key = identity.userId + ':' + identity.hostUuid;
            const previous = records.get(key);
            records.set(key, {
                ...identity,
                bytes: (previous?.bytes ?? 0n) + BigInt(user.uplink) + BigInt(user.downlink),
            });
        }
        const key = `xera:host-usage:pending:${nodeId}`;
        if (records.size)
            await this.cache.hsetJson(key, randomUUID(), {
                day: new Date().toISOString().slice(0, 10),
                records: [...records.values()].map((r) => ({ ...r, bytes: r.bytes.toString() })),
            });
        return key;
    }

    private async applyPending(nodeId: bigint, key: string) {
        await this.assertBillingAllowed();
        const pending =
            (await this.cache.hgetallParsed<
                Record<
                    string,
                    { day: string; records: { userId: string; hostUuid: string; bytes: string }[] }
                >
            >(key)) ?? {};
        for (const [receipt, batch] of Object.entries(pending)) {
            const tx = this.db.kysely;
            const accepted = await sql<{
                id: string;
            }>`INSERT INTO xera_host_usage_receipts(id,node_id) VALUES(${receipt}::uuid,${nodeId}) ON CONFLICT DO NOTHING RETURNING id`.execute(
                tx,
            );
            if (!accepted.rows.length) continue;
            const nonempty = batch.records.filter((record) => BigInt(record.bytes) > 0n);
            for (let offset = 0; offset < nonempty.length; offset += 500) {
                // One raw byte is assigned to one host. Group membership never multiplies billing.
                const values = nonempty
                    .slice(offset, offset + 500)
                    .map(
                        (record) =>
                            sql`(${record.userId}::bigint,${record.hostUuid}::uuid,${record.bytes}::bigint)`,
                    );
                await sql`INSERT INTO xera_host_quota_usage(user_id,host_uuid,node_id,total_bytes,created_at)
                    SELECT sample.user_id,sample.host_uuid,${nodeId},sample.bytes,${batch.day}::date
                    FROM (VALUES ${sql.join(values)}) AS sample(user_id,host_uuid,bytes)
                    JOIN users u ON u.id=sample.user_id JOIN hosts h ON h.uuid=sample.host_uuid
                    ON CONFLICT(user_id,host_uuid,node_id,created_at) DO UPDATE SET
                    total_bytes=xera_host_quota_usage.total_bytes+excluded.total_bytes`.execute(tx);
            }
        }
        return Object.keys(pending);
    }

    private async acknowledge(key: string, receipts: string[]) {
        for (const receipt of receipts) {
            await this.assertBillingAllowed();
            const pipe = this.cache.createPipeline();
            pipe.hdel(key, receipt);
            const result = await pipe.exec();
            if (!result || result.some(([error]) => error))
                throw new Error('Cannot acknowledge host usage sample');
        }
    }
}
