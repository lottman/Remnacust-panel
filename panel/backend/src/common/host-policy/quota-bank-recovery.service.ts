import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

import { QuotaBankError } from './quota-bank-model';
import {
    readRecoveryBank,
    RECOVERY_BANK_TABLES,
    RECOVERY_BANK_VERSION,
    RecoveryBankCapacityError,
} from './quota-recovery-bank';

const compress = promisify(gzip),
    expand = promisify(gunzip);
const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const maxBytes = 32 * 1024 * 1024;
type Bank = {
    requestId: string;
    generation: string;
    actorUuid: string;
    version: string;
    catalogText: string;
    sourceDigest: string;
    partCount: number;
    rowCount: string;
    createdAt: Date;
};
type Part = { ordinal: number; section: string; digest: string; rows: number };

@Injectable()
export class QuotaBankRecoveryService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
    ) {}

    private standalone() {
        if (this.transactions.isTransactionActive())
            throw new Error('Bank recovery requires standalone transactions');
    }
    private async pending(generation: string) {
        const result =
            await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL FOR SHARE`.execute(
                this.db.kysely,
            );
        if (!result.rows.length) throw new QuotaBankError('NOT_PENDING');
    }
    private async bank(request: string) {
        const result =
            await sql<Bank>`SELECT request_id AS "requestId",generation,actor_uuid AS "actorUuid",version,catalog_text AS "catalogText",
            source_digest AS "sourceDigest",part_count AS "partCount",row_count::text AS "rowCount",created_at AS "createdAt"
            FROM xera_quota_recovery_banks WHERE request_id=${request}::uuid`.execute(
                this.db.kysely,
            );
        return result.rows[0];
    }
    private view(bank: Bank) {
        return {
            requestId: bank.requestId,
            generation: bank.generation,
            actorUuid: bank.actorUuid,
            version: bank.version,
            sourceDigest: bank.sourceDigest,
            partCount: bank.partCount,
            rowCount: bank.rowCount,
            createdAt: bank.createdAt,
        };
    }
    private async artifact(digest: string) {
        const result = await sql<{
            data: Buffer;
            compressedDigest: string;
            bytes: number;
        }>`SELECT compressed AS data,compressed_sha256 AS "compressedDigest",raw_bytes AS bytes
            FROM xera_quota_recovery_artifacts WHERE digest=${digest} AND kind='SQL_CHUNK'`.execute(
            this.db.kysely,
        );
        const artifact = result.rows[0];
        if (!artifact || artifact.bytes < 1 || artifact.bytes > maxBytes)
            throw new QuotaBankError('CORRUPT');
        const data = Buffer.from(artifact.data);
        if (hash(data) !== artifact.compressedDigest) throw new QuotaBankError('CORRUPT');
        try {
            const raw = await expand(data, { maxOutputLength: maxBytes });
            if (raw.length !== artifact.bytes || hash(raw) !== digest)
                throw new QuotaBankError('CORRUPT');
        } catch {
            throw new QuotaBankError('CORRUPT');
        }
        return data;
    }
    private async pages(generation: string, consume: (part: Part, raw: Buffer) => Promise<void>) {
        const catalog = JSON.stringify(RECOVERY_BANK_TABLES),
            root = createHash('sha256').update(RECOVERY_BANK_VERSION + '\n' + catalog + '\n');
        let ordinal = 0,
            rows = 0n;
        try {
            for await (const page of readRecoveryBank(this.db, generation, () =>
                this.transactions.isTransactionActive(),
            )) {
                const raw = Buffer.from(
                    `{"version":"${RECOVERY_BANK_VERSION}","section":"${page.section}","rows":[${page.rows.join(',')}]}`,
                );
                if (ordinal >= 100000 || raw.length > maxBytes)
                    throw new QuotaBankError('CAPACITY');
                const part = {
                    ordinal,
                    section: page.section,
                    digest: hash(raw),
                    rows: page.rows.length,
                };
                await consume(part, raw);
                root.update(`${part.section}:${ordinal}:${part.digest}:${part.rows}\n`);
                rows += BigInt(part.rows);
                ordinal++;
            }
        } catch (error) {
            if (error instanceof RecoveryBankCapacityError) throw new QuotaBankError('CAPACITY');
            throw error;
        }
        return {
            catalog,
            sourceDigest: root.digest('hex'),
            partCount: ordinal,
            rowCount: rows.toString(),
        };
    }
    async capture(generation: string, request: string, actor: string) {
        this.standalone();
        const existing = await this.bank(request);
        if (existing) return this.retry(existing, generation, actor);
        try {
            return await this.transactions.withTransaction(
                { isolationLevel: 'RepeatableRead', timeout: 60000 },
                () => this.captureInTransaction(generation, request, actor),
            );
        } catch (error) {
            // A concurrent request may commit while this snapshot loses a
            // serialization/unique-key race. Only that exact request can win.
            const committed = await this.bank(request);
            if (committed) return this.retry(committed, generation, actor);
            throw error;
        }
    }
    async captureInTransaction(generation: string, request: string, actor: string) {
        if (!this.transactions.isTransactionActive())
            throw new Error('Bank capture requires an active transaction');
        const existing = await this.bank(request);
        if (existing) return this.retry(existing, generation, actor);
        await this.pending(generation);
        const result = await this.pages(generation, async (part, raw) => {
            const data = await compress(raw, { level: 6 });
            await sql`INSERT INTO xera_quota_recovery_artifacts(digest,kind,raw_bytes,compressed_sha256,compressed)
            VALUES(${part.digest},'SQL_CHUNK',${raw.length},${hash(data)},${data}) ON CONFLICT(digest) DO NOTHING`.execute(
                this.db.kysely,
            );
            await this.artifact(part.digest);
            await sql`INSERT INTO xera_quota_recovery_bank_parts(request_id,ordinal,section,digest,row_count)
            VALUES(${request}::uuid,${part.ordinal},${part.section},${part.digest},${part.rows})`.execute(
                this.db.kysely,
            );
        });
        await sql`INSERT INTO xera_quota_recovery_banks(request_id,generation,actor_uuid,version,catalog_text,source_digest,part_count,row_count)
        VALUES(${request}::uuid,${generation}::uuid,${actor}::uuid,${RECOVERY_BANK_VERSION},${result.catalog},${result.sourceDigest},${result.partCount},${result.rowCount}::bigint)`.execute(
            this.db.kysely,
        );
        return this.view((await this.bank(request))!);
    }
    private retry(bank: Bank, generation: string, actor: string) {
        if (bank.generation !== generation || bank.actorUuid !== actor)
            throw new QuotaBankError('REQUEST_CONFLICT');
        return this.view(bank);
    }
    async details(request: string) {
        const bank = await this.bank(request);
        if (!bank) throw new QuotaBankError('MISSING');
        return this.view(bank);
    }
    async list(after?: string) {
        let cursor: { at: string; id: string } | undefined;
        if (after) {
            cursor = (
                await sql<{
                    at: string;
                    id: string;
                }>`SELECT created_at::text AS at,request_id::text AS id
                FROM xera_quota_recovery_banks WHERE request_id=${after}::uuid`.execute(
                    this.db.kysely,
                )
            ).rows[0];
            if (!cursor) throw new QuotaBankError('MISSING');
        }
        const rows =
            await sql<Bank>`SELECT request_id AS "requestId",generation,actor_uuid AS "actorUuid",version,catalog_text AS "catalogText",
            source_digest AS "sourceDigest",part_count AS "partCount",row_count::text AS "rowCount",created_at AS "createdAt"
            FROM xera_quota_recovery_banks ${cursor ? sql`WHERE (created_at,request_id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql``}
            ORDER BY created_at DESC,request_id DESC LIMIT 21`.execute(this.db.kysely);
        return {
            entries: rows.rows.slice(0, 20).map((bank) => this.view(bank)),
            nextAfter: rows.rows.length > 20 ? rows.rows[19].requestId : null,
        };
    }
    async parts(request: string, after = -1) {
        await this.details(request);
        const result =
            await sql<Part>`SELECT ordinal,section,digest,row_count AS rows FROM xera_quota_recovery_bank_parts
            WHERE request_id=${request}::uuid AND ordinal>${after} ORDER BY ordinal LIMIT 21`.execute(
                this.db.kysely,
            );
        return {
            entries: result.rows.slice(0, 20),
            nextAfter: result.rows.length > 20 ? result.rows[19].ordinal : null,
        };
    }
    async download(request: string, digest: string) {
        const found =
            await sql`SELECT 1 FROM xera_quota_recovery_bank_parts WHERE request_id=${request}::uuid AND digest=${digest}`.execute(
                this.db.kysely,
            );
        if (!found.rows.length) throw new QuotaBankError('MISSING');
        return {
            data: await this.artifact(digest),
            filename: `quota-bank-${request}-${digest}.json.gz`,
        };
    }
    async compare(request: string, generation: string) {
        this.standalone();
        return this.transactions.withTransaction(
            { isolationLevel: 'RepeatableRead', timeout: 60000 },
            () => this.compareInTransaction(request, generation),
        );
    }
    async compareInTransaction(request: string, generation: string) {
        if (!this.transactions.isTransactionActive())
            throw new Error('Bank comparison requires an active transaction');
        await this.pending(generation);
        const bank = await this.bank(request);
        if (!bank) throw new QuotaBankError('MISSING');
        if (bank.generation !== generation) throw new QuotaBankError('NOT_PENDING');
        if (
            bank.version !== RECOVERY_BANK_VERSION ||
            bank.catalogText !== JSON.stringify(RECOVERY_BANK_TABLES)
        )
            throw new QuotaBankError('CORRUPT');
        const previousSections = new Map<string, ReturnType<typeof createHash>>();
        const previousRoot = createHash('sha256').update(
            bank.version + '\n' + bank.catalogText + '\n',
        );
        let after = -1,
            count = 0,
            rows = 0n;
        for (;;) {
            const page =
                await sql<Part>`SELECT ordinal,section,digest,row_count AS rows FROM xera_quota_recovery_bank_parts
                    WHERE request_id=${request}::uuid AND ordinal>${after} ORDER BY ordinal LIMIT 500`.execute(
                    this.db.kysely,
                );
            for (const part of page.rows) {
                if (part.ordinal !== count++) throw new QuotaBankError('CORRUPT');
                await this.artifact(part.digest);
                const section = previousSections.get(part.section) ?? createHash('sha256');
                section.update(`${part.digest}:${part.rows}\n`);
                previousSections.set(part.section, section);
                previousRoot.update(
                    `${part.section}:${part.ordinal}:${part.digest}:${part.rows}\n`,
                );
                rows += BigInt(part.rows);
            }
            if (page.rows.length < 500) break;
            after = page.rows[page.rows.length - 1].ordinal;
        }
        if (
            count !== bank.partCount ||
            rows.toString() !== bank.rowCount ||
            previousRoot.digest('hex') !== bank.sourceDigest
        )
            throw new QuotaBankError('CORRUPT');
        const currentSections = new Map<string, ReturnType<typeof createHash>>();
        const current = await this.pages(generation, async (part) => {
            const section = currentSections.get(part.section) ?? createHash('sha256');
            section.update(`${part.digest}:${part.rows}\n`);
            currentSections.set(part.section, section);
        });
        const changed = RECOVERY_BANK_TABLES.filter(
            (section) =>
                previousSections.get(section)?.digest('hex') !==
                currentSections.get(section)?.digest('hex'),
        );
        return {
            requestId: request,
            generation,
            originalDigest: bank.sourceDigest,
            currentDigest: current.sourceDigest,
            matches: bank.sourceDigest === current.sourceDigest,
            changedSections: changed,
        };
    }
}
