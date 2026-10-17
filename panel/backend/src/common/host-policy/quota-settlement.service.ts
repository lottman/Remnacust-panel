import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { Injectable, Logger } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TxKyselyService } from '@common/database';
import { RawCacheService } from '@common/raw-cache';

import { observeQuotaCheckpoint } from './quota-journal-checkpoint';

const integerBytes = z
    .string()
    .regex(/^(0|[1-9][0-9]{0,18})$/)
    .refine((value) => /^[0-9]+$/.test(value) && BigInt(value) <= 9223372036854775807n);
const reportSchema = z
    .object({
        instance: z.uuid(),
        sequence: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        policyRevision: integerBytes.refine((value) => value !== '0'),
        entries: z
            .array(
                z
                    .object({
                        id: z.uuid(),
                        group: z.string().min(1).max(200),
                        owner: z.string().regex(/^[1-9][0-9]{0,18}$/),
                        expiresAt: z.int().positive().max(Number.MAX_SAFE_INTEGER),
                        ceiling: integerBytes,
                        reserved: integerBytes,
                        closed: z.boolean().optional(),
                        prepared: z.boolean().optional(),
                        activated: z.boolean().optional(),
                        scale: z
                            .union([z.literal(0), z.literal(100), z.literal(1_000_000_000)])
                            .optional(),
                    })
                    .strict(),
            )
            .max(500),
        missingIds: z.array(z.uuid()).max(500),
        nextAfter: z.null(),
    })
    .strict();

type PendingGrant = {
    id: string;
    instance: string;
    group: string;
    owner: string;
    ceiling: string;
    expiresAt: Date;
};

@Injectable()
export class QuotaSettlementService {
    private readonly logger = new Logger(QuotaSettlementService.name);
    constructor(
        private readonly db: TxKyselyService,
        private readonly axios: AxiosService,
        private readonly cache: RawCacheService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
    ) {}

    async syncNode(
        node: INodeConnectionOpts & { uuid: string },
        scope?: { kind: 'USER' | 'HOST' | 'TAG'; key: string; owner: string },
    ): Promise<number> {
        // Never keep a caller's SQL transaction open across the node request.
        return this.transactions.withoutTransaction(async () => {
            const cursorKey = `xera:quota:settlement:${node.uuid}${
                scope
                    ? ':' +
                      createHash('sha256')
                          .update(JSON.stringify([scope.kind, scope.key, scope.owner]))
                          .digest('hex')
                    : ''
            }`;
            const savedCursor = await this.cache.get<string>(cursorKey);
            const cursor = z.uuid().safeParse(savedCursor);
            const pending = await sql<PendingGrant>`
                SELECT g.id::text AS id,g.instance_uuid::text AS instance,
                  CASE WHEN g.kind='HOST' THEN 'host:' WHEN g.kind='USER' THEN 'user:' ELSE 'tag:' END||g.key AS "group",
                  g.user_id::text AS owner,g.ceiling_bytes::text AS ceiling,p.expires_at AS "expiresAt"
                FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
                WHERE g.node_uuid=${node.uuid}::uuid AND g.closed_usage_bytes IS NULL AND p.expires_at>now()
                  ${scope ? sql`AND g.kind=${scope.kind} AND g.key=${scope.key} AND g.user_id=${scope.owner}::bigint AND g.retired_at IS NOT NULL` : sql``}
                  AND NOT EXISTS(SELECT 1 FROM xera_quota_node_modes m WHERE m.node_uuid=g.node_uuid AND m.instance_uuid IS DISTINCT FROM g.instance_uuid)
                  ${cursor.success ? sql`AND g.id>${cursor.data}::uuid` : sql``}
                ORDER BY g.id LIMIT 500
            `.execute(this.db.kysely);
            if (!pending.rows.length) {
                if (cursor.success) await this.cache.del(cursorKey);
                return 0;
            }
            const result = await this.axios.hostQuotaState<unknown>(node, {
                ids: pending.rows.map((row) => row.id),
            });
            if (!result.isOk)
                throw new Error(`Node ${node.uuid}: quota journal acknowledgement unavailable`);
            const parsed = reportSchema.safeParse(result.response);
            if (!parsed.success)
                throw new Error(`Node ${node.uuid}: invalid quota journal acknowledgement`);
            const report = parsed.data;
            const expected = new Map(pending.rows.map((row) => [row.id, row]));
            const seen = new Set<string>();
            // Validate the whole response before committing any settlement.
            for (const entry of report.entries) {
                const grant = expected.get(entry.id);
                if (
                    !grant ||
                    seen.has(entry.id) ||
                    report.instance !== grant.instance ||
                    entry.group !== grant.group ||
                    entry.owner !== grant.owner ||
                    entry.expiresAt !== grant.expiresAt.getTime() ||
                    BigInt(entry.ceiling) > BigInt(grant.ceiling) ||
                    BigInt(entry.reserved) > BigInt(entry.ceiling)
                )
                    throw new Error(`Node ${node.uuid}: quota journal binding mismatch`);
                seen.add(entry.id);
            }
            for (const id of report.missingIds) {
                if (!expected.has(id) || seen.has(id))
                    throw new Error(`Node ${node.uuid}: inconsistent missing quota entries`);
                seen.add(id);
            }
            if (seen.size !== expected.size)
                throw new Error(`Node ${node.uuid}: incomplete quota journal acknowledgement`);
            await observeQuotaCheckpoint(
                this.db,
                node.uuid,
                report.instance,
                report.sequence,
                report.policyRevision,
            );
            let settled = 0;
            for (const entry of report.entries) {
                if (!entry.closed) continue;
                // Missing and active entries never release a single byte. A
                // lower applied ceiling may be an undelivered panel top-up;
                // irreversible closure also invalidates that later top-up.
                await sql`SELECT xera_settle_quota_reserve(${entry.id}::uuid,${node.uuid}::uuid,
                    ${report.instance}::uuid,${entry.group},${entry.owner}::bigint,
                    ${entry.ceiling}::bigint,${new Date(entry.expiresAt)}::timestamptz,
                    ${entry.reserved}::bigint,${report.policyRevision}::bigint)`.execute(
                    this.db.kysely,
                );
                settled++;
            }
            await this.cache.set(cursorKey, pending.rows.at(-1)!.id, 86400);
            return settled;
        });
    }

    async syncConnected(): Promise<void> {
        const nodes = await sql<INodeConnectionOpts & { uuid: string }>`
            SELECT n.uuid,n.address,n.port,n.proxy_url AS "proxyUrl" FROM nodes n
            WHERE NOT n.is_disabled AND n.is_connected AND EXISTS(
              SELECT 1 FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
              WHERE g.node_uuid=n.uuid AND g.closed_usage_bytes IS NULL AND p.expires_at>now()
            ) ORDER BY n.uuid
        `.execute(this.db.kysely);
        for (let i = 0; i < nodes.rows.length; i += 8) {
            const results = await Promise.allSettled(
                nodes.rows.slice(i, i + 8).map((node) => this.syncNode(node)),
            );
            for (const result of results)
                if (result.status === 'rejected') this.logger.error(String(result.reason));
        }
    }
}
