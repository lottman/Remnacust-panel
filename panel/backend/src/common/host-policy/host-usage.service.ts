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

type PendingUsage = {
    day: string;
    records: { userId: string; hostUuid: string; bytes: string }[];
};
const RECEIPTS_PER_TRANSACTION = 8;

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
        await this.stage(nodeId, users);
        await this.drain(nodeId);
    }

    async drain(nodeId: bigint): Promise<void> {
        this.requireStandalone();
        const key = `xera:host-usage:pending:${nodeId}`;
        for (;;) {
            await this.assertBillingAllowed();
            let pending = await this.pending(key);
            if (!pending.length) {
                await this.transactions.withTransaction({ timeout: 30000 }, async () => {
                    await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${nodeId.toString()},20261016))`.execute(
                        this.db.kysely,
                    );
                    await this.assertBillingAllowed();
                });
                pending = await this.pending(key);
                if (!pending.length) return;
            }
            const receipts = await this.transactions.withTransaction(
                { timeout: 30000 },
                async () => {
                    await sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${nodeId.toString()},20261016))`.execute(
                        this.db.kysely,
                    );
                    return this.applyPending(nodeId, pending);
                },
            );
            await this.acknowledge(key, receipts);
        }
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
            const staged = await this.stage(nodeId, result.response.users);
            const receipts = await this.applyPending(nodeId, staged.pending);
            return { result, requestedAt, key: staged.key, receipts };
        });
        // Never delete a Redis receipt inside the SQL transaction. A commit
        // failure must leave the sample available for an idempotent replay.
        if (collected.key) {
            await this.acknowledge(collected.key, collected.receipts);
            await this.drain(nodeId);
        }
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
        const pending: [string, PendingUsage][] = [];
        if (records.size) {
            const receipt = randomUUID();
            const batch = {
                day: new Date().toISOString().slice(0, 10),
                records: [...records.values()].map((r) => ({ ...r, bytes: r.bytes.toString() })),
            };
            await this.cache.hsetJson(key, receipt, batch);
            pending.push([receipt, batch]);
        }
        return { key, pending };
    }

    private async pending(key: string): Promise<[string, PendingUsage][]> {
        let cursor = '0';
        do {
            const pipe = this.cache.createPipeline();
            pipe.hscan(key, cursor, 'COUNT', RECEIPTS_PER_TRANSACTION);
            const result = await pipe.exec();
            if (!result || result.length !== 1 || result[0][0])
                throw new Error('Cannot read pending host usage samples');
            const page = result[0][1] as [string, string[]];
            cursor = page[0];
            const pending = new Map<string, PendingUsage>();
            for (
                let index = 0;
                index < page[1].length && pending.size < RECEIPTS_PER_TRANSACTION;
                index += 2
            )
                pending.set(page[1][index], JSON.parse(page[1][index + 1]) as PendingUsage);
            if (pending.size) return [...pending];
        } while (cursor !== '0');
        return [];
    }

    private async applyPending(nodeId: bigint, pending: [string, PendingUsage][]) {
        await this.assertBillingAllowed();
        for (const [receipt, batch] of pending) {
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
                    SELECT sample.user_id,h.uuid,${nodeId},sum(sample.bytes)::bigint,${batch.day}::date
                    FROM (VALUES ${sql.join(values)}) AS sample(user_id,host_uuid,bytes)
                    LEFT JOIN xera_autoselect_routes route ON route.uuid=sample.host_uuid
                    JOIN users u ON u.id=sample.user_id JOIN hosts h ON h.uuid=COALESCE(route.owner_host_uuid,sample.host_uuid)
                    GROUP BY sample.user_id,h.uuid
                    ON CONFLICT(user_id,host_uuid,node_id,created_at) DO UPDATE SET
                    total_bytes=xera_host_quota_usage.total_bytes+excluded.total_bytes`.execute(tx);
            }
        }
        return pending.map(([receipt]) => receipt);
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
