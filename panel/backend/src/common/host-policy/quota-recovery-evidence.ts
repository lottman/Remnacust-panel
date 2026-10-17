import type { RecoveryReport } from './quota-recovery-report';
import type { RecoverySnapshot } from './quota-recovery-snapshot';

import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

import type { TxKyselyService } from '@common/database';

const compress = promisify(gzip);
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const MAX_BYTES = 32 * 1024 * 1024;
export type EvidenceSection = 'STATE' | 'GRANTS' | 'WATERMARKS' | 'EXPOSURES' | 'IDENTITIES';

// Created and finalized in the caller's one repeatable-read transaction. Failed
// comparisons, commits and superseded requests cannot leave a partial archive.
export class QuotaRecoveryEvidenceWriter {
    private readonly root = createHash('sha256');
    private parts = 0;
    private rows = 0n;
    constructor(
        private readonly db: TxKyselyService,
        private readonly request: {
            generation: string;
            requestId: string;
            node: string;
            actor: string;
            metadataDigest: string;
        },
        private readonly snapshot: RecoverySnapshot,
        private readonly inTransaction: () => boolean,
    ) {}

    private async artifact(
        kind: 'NODE_JOURNAL' | 'SQL_CHUNK',
        digest: string,
        bytes: number,
        compressed: Buffer,
    ) {
        await sql`INSERT INTO xera_quota_recovery_artifacts(digest,kind,raw_bytes,compressed_sha256,compressed)
            VALUES(${digest},${kind},${bytes},${hash(compressed)},${compressed}) ON CONFLICT(digest) DO NOTHING`.execute(
            this.db.kysely,
        );
        const found =
            await sql`SELECT 1 FROM xera_quota_recovery_artifacts WHERE digest=${digest} AND kind=${kind} AND raw_bytes=${bytes}`.execute(
                this.db.kysely,
            );
        if (!found.rows.length) throw new Error('Recovery artifact identity mismatch');
    }

    async append(section: EvidenceSection, rows: string[]) {
        if (!this.inTransaction())
            throw new Error('Recovery evidence requires an active transaction');
        if (rows.length === 0) return;
        if (rows.length > 500 || this.parts >= 100000)
            throw new Error('Recovery evidence capacity exceeded');
        // SQL returns JSON text; concatenating it keeps BIGINTs exact. Parsing
        // through ordinary JavaScript JSON would round the original evidence.
        const raw = Buffer.from(
            `{"version":"remnacust-quota-sql-v1","section":"${section}","rows":[${rows.join(',')}]}`,
        );
        if (raw.length > MAX_BYTES) throw new Error('Recovery evidence capacity exceeded');
        const digest = hash(raw),
            compressed = await compress(raw, { level: 1 });
        await this.artifact('SQL_CHUNK', digest, raw.length, compressed);
        await sql`INSERT INTO xera_quota_recovery_evidence_parts(request_id,ordinal,section,digest,row_count)
            VALUES(${this.request.requestId}::uuid,${this.parts},${section},${digest},${rows.length})`.execute(
            this.db.kysely,
        );
        this.root.update(`${section}:${this.parts}:${digest}:${rows.length}\n`);
        this.parts++;
        this.rows += BigInt(rows.length);
    }

    async finish(report: RecoveryReport) {
        if (!this.inTransaction())
            throw new Error('Recovery evidence requires an active transaction');
        const snapshot = this.snapshot,
            request = this.request;
        if (!this.parts) throw new Error('Empty recovery evidence');
        if (snapshot.requestId !== request.requestId || snapshot.generation !== request.generation)
            throw new Error('Recovery evidence request mismatch');
        await this.artifact('NODE_JOURNAL', snapshot.digest, snapshot.bytes, snapshot.encoded);
        const metadata = {
            instance: snapshot.instance,
            sequence: String(snapshot.sequence),
            checkpoint: String(snapshot.checkpoint),
            retiredBefore: snapshot.retiredBefore,
            policyRevision: snapshot.policyRevision,
            coreProcessId: snapshot.coreProcessId,
            capturedAt: snapshot.capturedAt,
            entries: snapshot.entries.length,
        };
        await sql`INSERT INTO xera_quota_recovery_evidence(request_id,generation,node_uuid,actor_uuid,journal_digest,metadata_digest,sql_digest,sql_parts,sql_rows,journal_metadata,report)
            VALUES(${request.requestId}::uuid,${request.generation}::uuid,${request.node}::uuid,${request.actor}::uuid,${snapshot.digest},${request.metadataDigest},
                ${this.root.digest('hex')},${this.parts},${this.rows.toString()}::bigint,${JSON.stringify(metadata)}::jsonb,${JSON.stringify(report)}::jsonb)`.execute(
            this.db.kysely,
        );
    }
}
