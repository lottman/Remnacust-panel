import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { INodeConnectionOpts } from '@common/axios/axios.interfaces';
import { TxKyselyService } from '@common/database';

import { decodeUsageArchive, USAGE_JOURNAL_MAX_BYTES, UsageArchiveMetadata } from './usage-archive';

const compress = promisify(gzip),
    expand = promisify(gunzip);
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
export class QuotaReceiptRecoveryError extends Error {
    constructor(
        readonly code:
            | 'NOT_PENDING'
            | 'BUSY'
            | 'NODE_MISSING'
            | 'SOURCE_MISSING'
            | 'SOURCE_CORRUPT',
    ) {
        super(code);
    }
}

@Injectable()
export class QuotaReceiptRecoveryService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly axios: AxiosService,
    ) {}

    async capture(node: string, generation: string, actor: string) {
        if (this.transactions.isTransactionActive())
            throw new Error('Receipt capture requires standalone transactions');
        const requestId = randomUUID();
        const opts = await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            const pending =
                await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL FOR UPDATE`.execute(
                    this.db.kysely,
                );
            if (!pending.rows.length) throw new QuotaReceiptRecoveryError('NOT_PENDING');
            const nodes = await sql<
                INodeConnectionOpts & { id: string }
            >`SELECT id::text,address,port,proxy_url AS "proxyUrl" FROM nodes WHERE uuid=${node}::uuid`.execute(
                this.db.kysely,
            );
            const opts = nodes.rows[0];
            if (!opts) throw new QuotaReceiptRecoveryError('NODE_MISSING');
            const metadata = hash(
                Buffer.from(JSON.stringify([opts.id, opts.address, opts.port, opts.proxyUrl])),
            );
            await sql`INSERT INTO xera_quota_receipt_requests(request_id,node_uuid,generation,actor_uuid,metadata_digest)
                VALUES(${requestId}::uuid,${node}::uuid,${generation}::uuid,${actor}::uuid,${metadata})`.execute(
                this.db.kysely,
            );
            const lease =
                await sql`INSERT INTO xera_quota_receipt_capture_leases(generation,request_id) VALUES(${generation}::uuid,${requestId}::uuid)
                ON CONFLICT(generation) DO UPDATE SET request_id=excluded.request_id,started_at=clock_timestamp()
                WHERE xera_quota_receipt_capture_leases.started_at<clock_timestamp()-interval '90 seconds' RETURNING request_id`.execute(
                    this.db.kysely,
                );
            if (!lease.rows.length) throw new QuotaReceiptRecoveryError('BUSY');
            return opts;
        });
        let snapshot: Awaited<ReturnType<typeof decodeUsageArchive>> | null = null;
        let reason: 'NODE_UNAVAILABLE' | 'INVALID_RESPONSE' = 'NODE_UNAVAILABLE';
        // This endpoint only reads an existing file. Never sample, bill, reset,
        // release a fence or ACK a receipt while collecting recovery evidence.
        try {
            const result = await this.axios.usageArchive<unknown>(opts, { generation, requestId });
            if (result.isOk) {
                reason = 'INVALID_RESPONSE';
                snapshot = await decodeUsageArchive(result.response, { generation, requestId });
            }
        } catch {
            /* Preserve a bounded unavailable observation, never a transport exception. */
        }
        const original = snapshot?.original ?? null;
        const encoded = original === null ? null : await compress(original, { level: 1 });
        const state = snapshot?.state ?? 'UNAVAILABLE';
        await this.transactions.withTransaction({ timeout: 30000 }, async () => {
            if (original !== null && encoded) {
                await sql`INSERT INTO xera_quota_recovery_artifacts(digest,kind,raw_bytes,compressed_sha256,compressed)
                    VALUES(${snapshot!.sourceDigest},'USAGE_JOURNAL',${original.length},${hash(encoded)},${encoded}) ON CONFLICT(digest) DO NOTHING`.execute(
                    this.db.kysely,
                );
            }
            // A later restore generation cannot relabel this original request.
            // Keeping old evidence is safe; it grants no credit and sends no ACK.
            await sql`INSERT INTO xera_quota_receipt_captures(request_id,node_uuid,state,source_digest,source_bytes,captured_at,payload_digest,metadata,reason)
                VALUES(${requestId}::uuid,${node}::uuid,${state},${snapshot?.sourceDigest ?? null},${original?.length ?? null},
                    ${snapshot?.capturedAt ?? null}::bigint,${snapshot?.payloadDigest ?? null},${snapshot?.metadata ? JSON.stringify(snapshot.metadata) : null}::jsonb,
                    ${state === 'PRESENT' ? null : state === 'ABSENT' ? 'SOURCE_ABSENT' : state === 'INVALID' ? 'INVALID_JOURNAL' : reason})`.execute(
                this.db.kysely,
            );
            await sql`DELETE FROM xera_quota_receipt_capture_leases WHERE generation=${generation}::uuid AND request_id=${requestId}::uuid`.execute(
                this.db.kysely,
            );
        });
        return { requestId, state };
    }

    async history(node: string, after?: string) {
        let cursor: { at: string; id: string } | null = null;
        if (after) {
            cursor =
                (
                    await sql<{
                        at: string;
                        id: string;
                    }>`SELECT requested_at::text AS at,request_id::text AS id FROM xera_quota_receipt_requests
                WHERE request_id=${after}::uuid AND node_uuid=${node}::uuid`.execute(this.db.kysely)
                ).rows[0] ?? null;
            if (!cursor) throw new QuotaReceiptRecoveryError('SOURCE_MISSING');
        }
        const rows = await sql<{
            requestId: string;
            generation: string;
            actorUuid: string;
            createdAt: Date;
            state: 'PRESENT' | 'ABSENT' | 'INVALID' | 'UNAVAILABLE' | 'CAPTURING' | 'INTERRUPTED';
            sourceBytes: number | null;
            capturedAt: string | null;
            digest: string | null;
            metadata: UsageArchiveMetadata | null;
            reason: string | null;
        }>`
            SELECT r.request_id::text AS "requestId",r.generation::text,r.actor_uuid::text AS "actorUuid",r.requested_at AS "createdAt",
                COALESCE(c.state,CASE WHEN l.started_at>clock_timestamp()-interval '90 seconds' THEN 'CAPTURING' ELSE 'INTERRUPTED' END) AS state,
                c.source_bytes AS "sourceBytes",c.captured_at::text AS "capturedAt",c.source_digest AS digest,c.metadata,c.reason
            FROM xera_quota_receipt_requests r LEFT JOIN xera_quota_receipt_captures c USING(request_id,node_uuid)
            LEFT JOIN xera_quota_receipt_capture_leases l ON l.request_id=r.request_id
            WHERE r.node_uuid=${node}::uuid ${cursor ? sql`AND (r.requested_at,r.request_id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql``}
            ORDER BY r.requested_at DESC,r.request_id DESC LIMIT 21`.execute(this.db.kysely);
        return {
            entries: rows.rows.slice(0, 20),
            nextAfter: rows.rows.length > 20 ? rows.rows[19].requestId : null,
        };
    }

    async download(node: string, request: string) {
        const result = await sql<{
            compressed: Uint8Array;
            compressedDigest: string;
            digest: string;
            bytes: number;
        }>`
            SELECT a.compressed,a.compressed_sha256 AS "compressedDigest",a.digest,a.raw_bytes AS bytes FROM xera_quota_receipt_captures c
            JOIN xera_quota_recovery_artifacts a ON a.digest=c.source_digest AND a.kind='USAGE_JOURNAL'
            WHERE c.node_uuid=${node}::uuid AND c.request_id=${request}::uuid`.execute(
            this.db.kysely,
        );
        const row = result.rows[0];
        if (!row) throw new QuotaReceiptRecoveryError('SOURCE_MISSING');
        const data = Buffer.from(row.compressed);
        try {
            if (hash(data) !== row.compressedDigest) throw new Error('Archive integrity differs');
            const original = await expand(data, { maxOutputLength: USAGE_JOURNAL_MAX_BYTES });
            if (original.length !== row.bytes || hash(original) !== row.digest)
                throw new Error('Source integrity differs');
        } catch {
            throw new QuotaReceiptRecoveryError('SOURCE_CORRUPT');
        }
        return { data, filename: `usage-${request}-${row.digest.slice(0, 12)}.journal.gz` };
    }
}
