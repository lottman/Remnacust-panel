import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { TxKyselyService } from '@common/database';

import { quotaRestoreState } from './quota-journal-checkpoint';
import { QuotaRecoveryEvidenceWriter } from './quota-recovery-evidence';
import { readRecoveryObligations } from './quota-recovery-obligations';
import { QuotaRecoveryReceiptService } from './quota-recovery-receipt.service';
import {
    RecoveryBasis,
    recoveryDigest,
    recoveryReport,
    recoveryStatusSchema,
    RecoveryReport,
    recoverySnapshotReport,
    recoveryOwnerIssue,
    RecoveryIssue,
} from './quota-recovery-report';
import { recoveryNodeRoster } from './quota-recovery-roster';
import { decodeRecoverySnapshot, RecoverySnapshot } from './quota-recovery-snapshot';
import { recoveryQuiescenceAcknowledged } from './recovery-quiescence';

export class QuotaRecoveryError extends Error {
    constructor(
        readonly code:
            | 'NOT_PENDING'
            | 'NODE_MISSING'
            | 'EVIDENCE_MISSING'
            | 'EVIDENCE_CORRUPT'
            | 'CHECK_BUSY'
            | 'CHECK_SUPERSEDED',
    ) {
        super(code);
    }
}

@Injectable()
export class QuotaRecoveryService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly axios: AxiosService,
        private readonly receipts: QuotaRecoveryReceiptService,
    ) {}

    async history(node: string, after?: string, generation?: string) {
        let cursor: { at: string; id: string } | null = null;
        if (after) {
            const selected = await sql<{
                at: string;
                id: string;
            }>`SELECT created_at::text AS at,request_id::text AS id FROM xera_quota_recovery_evidence
                WHERE node_uuid=${node}::uuid AND request_id=${after}::uuid ${generation ? sql`AND generation=${generation}::uuid` : sql``}`.execute(
                this.db.kysely,
            );
            cursor = selected.rows[0] ?? null;
            if (!cursor) throw new QuotaRecoveryError('EVIDENCE_MISSING');
        }
        const result = await sql<{
            id: string;
            generation: string;
            actorUuid: string;
            createdAt: Date;
            journalDigest: string;
            metadataDigest: string;
            sqlDigest: string;
            sqlParts: number;
            sqlRows: string;
            journalMetadata: {
                instance: string;
                sequence: string;
                checkpoint: string;
                retiredBefore: number;
                policyRevision: string;
                coreProcessId: string;
                capturedAt: number;
                entries: number;
            };
            report: RecoveryReport;
        }>`SELECT request_id::text AS id,generation::text,actor_uuid::text AS "actorUuid",created_at AS "createdAt",journal_digest AS "journalDigest",
            metadata_digest AS "metadataDigest",sql_digest AS "sqlDigest",sql_parts AS "sqlParts",sql_rows::text AS "sqlRows",journal_metadata AS "journalMetadata",report
            FROM xera_quota_recovery_evidence WHERE node_uuid=${node}::uuid ${generation ? sql`AND generation=${generation}::uuid` : sql``}
                ${cursor ? sql`AND (created_at,request_id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql``}
            ORDER BY created_at DESC,request_id DESC LIMIT 21`.execute(this.db.kysely);
        return {
            entries: result.rows.slice(0, 20),
            nextAfter: result.rows.length > 20 ? result.rows[19].id : null,
        };
    }

    async evidenceParts(node: string, request: string, after?: number) {
        const found =
            await sql`SELECT 1 FROM xera_quota_recovery_evidence WHERE node_uuid=${node}::uuid AND request_id=${request}::uuid`.execute(
                this.db.kysely,
            );
        if (!found.rows.length) throw new QuotaRecoveryError('EVIDENCE_MISSING');
        const result = await sql<{
            ordinal: number;
            section: string;
            digest: string;
            rows: number;
        }>`SELECT ordinal,section,digest,row_count AS rows FROM xera_quota_recovery_evidence_parts
            WHERE request_id=${request}::uuid AND ordinal>${after ?? -1} ORDER BY ordinal LIMIT 101`.execute(
            this.db.kysely,
        );
        return {
            entries: result.rows.slice(0, 100),
            nextAfter: result.rows.length > 100 ? result.rows[99].ordinal : null,
        };
    }

    async evidenceArtifact(node: string, request: string, digest: string) {
        const result = await sql<{
            compressed: Uint8Array;
            compressedDigest: string;
        }>`SELECT a.compressed,a.compressed_sha256 AS "compressedDigest" FROM xera_quota_recovery_evidence e
            JOIN xera_quota_recovery_artifacts a ON a.digest=${digest}
            WHERE e.node_uuid=${node}::uuid AND e.request_id=${request}::uuid AND (e.journal_digest=a.digest OR EXISTS(
                SELECT 1 FROM xera_quota_recovery_evidence_parts p WHERE p.request_id=e.request_id AND p.digest=a.digest))`.execute(
            this.db.kysely,
        );
        if (!result.rows.length) throw new QuotaRecoveryError('EVIDENCE_MISSING');
        const data = Buffer.from(result.rows[0].compressed);
        if (createHash('sha256').update(data).digest('hex') !== result.rows[0].compressedDigest)
            throw new QuotaRecoveryError('EVIDENCE_CORRUPT');
        return {
            data,
            filename: `quota-${request}-${digest.slice(0, 12)}.json.gz`,
        };
    }

    async status(after?: string) {
        const restore = await quotaRestoreState(this.db);
        if (!restore || restore.reconciledAt)
            return { restore, nodes: [], nextAfter: null, checkingNode: null };
        const active = await sql<{
            node: string;
        }>`SELECT node_uuid::text AS node FROM xera_quota_recovery_checks
            WHERE generation=${restore.generation}::uuid AND finished_at IS NULL AND started_at>clock_timestamp()-interval '90 seconds'
            ORDER BY started_at DESC LIMIT 1`.execute(this.db.kysely);
        const result = await sql<{
            uuid: string;
            name: string | null;
            disabled: boolean | null;
            checking: boolean;
            startedAt: Date | null;
            finishedAt: Date | null;
            report: RecoveryReport | null;
        }>`
            WITH expected AS (${recoveryNodeRoster})
            SELECT e.node_uuid::text AS uuid,n.name,n.is_disabled AS disabled,COALESCE(c.finished_at IS NULL AND c.started_at>clock_timestamp()-interval '90 seconds',false) AS checking,c.started_at AS "startedAt",c.finished_at AS "finishedAt",c.report
            FROM expected e LEFT JOIN nodes n ON n.uuid=e.node_uuid
            LEFT JOIN xera_quota_recovery_checks c ON c.node_uuid=e.node_uuid AND c.generation=${restore.generation}::uuid
            ${after ? sql`WHERE e.node_uuid>${after}::uuid` : sql``} ORDER BY e.node_uuid LIMIT 51`.execute(
            this.db.kysely,
        );
        return {
            restore,
            checkingNode: active.rows[0]?.node ?? null,
            financial: await readRecoveryObligations(this.db, restore.generation),
            nodes: result.rows.slice(0, 50),
            nextAfter: result.rows.length > 50 ? result.rows[49].uuid : null,
        };
    }

    private async basis(node: string): Promise<RecoveryBasis> {
        const row = await sql<{ basis: RecoveryBasis }>`SELECT jsonb_build_object(
            'node',(SELECT jsonb_build_object('name',name,'address',address,'port',port,'proxyUrl',proxy_url,'disabled',is_disabled) FROM nodes WHERE uuid=${node}::uuid),
            'mode',(SELECT jsonb_build_object('instance',instance_uuid) FROM xera_quota_node_modes WHERE node_uuid=${node}::uuid),
            'revision',COALESCE((SELECT revision::text FROM xera_node_policy_revisions WHERE node_uuid=${node}::uuid),'0'),
            'watermarks',(SELECT COALESCE(jsonb_agg(r ORDER BY r.instance),'[]') FROM (SELECT instance_uuid::text AS instance,sequence::text AS sequence,policy_revision::text AS revision
                FROM xera_quota_journal_watermarks WHERE node_uuid=${node}::uuid ORDER BY instance_uuid LIMIT 501)r),
            'grants',(SELECT COALESCE(jsonb_agg(r ORDER BY r.id),'[]') FROM (SELECT g.id::text AS id,g.instance_uuid::text AS instance,lower(g.kind)||':'||g.key AS "group",
                g.user_id::text AS owner,g.ceiling_bytes::text AS ceiling,p.expires_at AS "expiresAt",g.closed_usage_bytes::text AS "closedUsage",g.activation_revision::text AS activation,g.registration_required AS "registrationRequired",g.registered_revision IS NOT NULL AS registered,
                jsonb_build_object('source',b.source,'subject',b.subject_uuid,'current',c.subject_uuid) AS identity
                FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
                LEFT JOIN xera_quota_grant_subjects b ON b.grant_id=g.id LEFT JOIN xera_quota_current_subjects c ON c.user_id=g.user_id
                WHERE g.node_uuid=${node}::uuid ORDER BY g.id LIMIT 501)r),
            'grantCount',(SELECT count(*)::text FROM xera_quota_reserves WHERE node_uuid=${node}::uuid),
            'exposures',(SELECT count(*)::text FROM xera_quota_usage_exposures WHERE node_uuid=${node}::uuid),
            'stream',(SELECT jsonb_build_object('core',expected_core,'digest',committed_digest) FROM xera_node_usage_streams WHERE node_uuid=${node}::uuid)
            ) AS basis`.execute(this.db.kysely);
        return row.rows[0].basis;
    }

    private async *grants(
        node: string,
        evidence: QuotaRecoveryEvidenceWriter,
    ): AsyncGenerator<RecoveryBasis['grants'][number]> {
        let after: string | null = null;
        for (;;) {
            const page: { rows: (RecoveryBasis['grants'][number] & { data: string })[] } =
                await sql<RecoveryBasis['grants'][number] & { data: string }>`
                SELECT g.id::text AS id,g.instance_uuid::text AS instance,lower(g.kind)||':'||g.key AS "group",
                    g.user_id::text AS owner,g.ceiling_bytes::text AS ceiling,p.expires_at AS "expiresAt",g.closed_usage_bytes::text AS "closedUsage",
                    g.activation_revision::text AS activation,g.registration_required AS "registrationRequired",g.registered_revision IS NOT NULL AS registered,
                    jsonb_build_object('source',b.source,'subject',b.subject_uuid,'current',c.subject_uuid) AS identity,
                    jsonb_build_object('grant',to_jsonb(g),'pool',to_jsonb(p),'identity',to_jsonb(b),'usageIdentity',to_jsonb(a),'currentSubject',to_jsonb(s))::text AS data
                FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
                LEFT JOIN xera_quota_grant_subjects b ON b.grant_id=g.id LEFT JOIN xera_quota_pool_subjects a ON a.usage_account=p.usage_account
                LEFT JOIN xera_quota_current_subjects c ON c.user_id=g.user_id LEFT JOIN xera_quota_subjects s ON s.subject_uuid=c.subject_uuid
                WHERE g.node_uuid=${node}::uuid ${after ? sql`AND g.id>${after}::uuid` : sql``}
                ORDER BY g.id LIMIT 500`.execute(this.db.kysely);
            await evidence.append(
                'GRANTS',
                page.rows.map((row) => row.data),
            );
            for (const grant of page.rows) yield grant;
            if (page.rows.length < 500) return;
            after = page.rows[page.rows.length - 1].id;
        }
    }

    private async evidenceMetadata(
        node: string,
        instance: string,
        evidence: QuotaRecoveryEvidenceWriter,
    ) {
        const state = await sql<{
            data: string;
        }>`SELECT jsonb_build_object('nodeUuid',${node}::text,
            'mode',(SELECT to_jsonb(m) FROM xera_quota_node_modes m WHERE node_uuid=${node}::uuid),
            'revision',(SELECT revision::text FROM xera_node_policy_revisions WHERE node_uuid=${node}::uuid),
            'usageStream',(SELECT to_jsonb(s) FROM xera_node_usage_streams s WHERE node_uuid=${node}::uuid),
            'legacyUsageStream',(SELECT to_jsonb(s) FROM xera_legacy_usage_streams s WHERE node_uuid=${node}::uuid))::text AS data`.execute(
            this.db.kysely,
        );
        await evidence.append(
            'STATE',
            state.rows.map((row) => row.data),
        );
        let after: string | null = null,
            matching: RecoveryBasis['watermarks'][number] | null = null;
        for (;;) {
            const page: { rows: (RecoveryBasis['watermarks'][number] & { data: string })[] } =
                await sql<RecoveryBasis['watermarks'][number] & { data: string }>`
                SELECT instance_uuid::text AS instance,sequence::text AS sequence,policy_revision::text AS revision,to_jsonb(w)::text AS data
                FROM xera_quota_journal_watermarks w WHERE node_uuid=${node}::uuid
                    ${after ? sql`AND instance_uuid>${after}::uuid` : sql``} ORDER BY instance_uuid LIMIT 500`.execute(
                    this.db.kysely,
                );
            await evidence.append(
                'WATERMARKS',
                page.rows.map((row) => row.data),
            );
            for (const row of page.rows)
                if (row.instance === instance)
                    matching = {
                        instance: row.instance,
                        sequence: row.sequence,
                        revision: row.revision,
                    };
            if (page.rows.length < 500) break;
            after = page.rows[page.rows.length - 1].instance;
        }
        type Exposure = {
            core: string;
            instance: string;
            kind: string;
            key: string;
            owner: string;
            data: string;
        };
        let cursor: Exposure | null = null;
        for (;;) {
            const page: { rows: Exposure[] } =
                await sql<Exposure>`SELECT core_uuid::text AS core,instance_uuid::text AS instance,kind,key,user_id::text AS owner,to_jsonb(e)::text AS data
                FROM xera_quota_usage_exposures e WHERE node_uuid=${node}::uuid
                    ${cursor ? sql`AND (core_uuid,instance_uuid,kind,key,user_id)>(${cursor.core}::uuid,${cursor.instance}::uuid,${cursor.kind},${cursor.key},${cursor.owner}::bigint)` : sql``}
                ORDER BY core_uuid,instance_uuid,kind,key,user_id LIMIT 500`.execute(
                    this.db.kysely,
                );
            await evidence.append(
                'EXPOSURES',
                page.rows.map((row) => row.data),
            );
            if (page.rows.length < 500) break;
            cursor = page.rows[page.rows.length - 1];
        }
        return matching ? [matching] : [];
    }

    private async evidenceIdentities(
        node: string,
        snapshot: RecoverySnapshot,
        evidence: QuotaRecoveryEvidenceWriter,
    ): Promise<RecoveryIssue[]> {
        const remaining = new Set(snapshot.entries.map((entry) => entry.id));
        const issues = new Set<RecoveryIssue>();
        let after: string | null = null;
        for (;;) {
            type Row = {
                id: string;
                identity: RecoveryBasis['grants'][number]['identity'];
                data: string;
            };
            const page: { rows: Row[] } = await sql<Row>`SELECT b.grant_id::text AS id,
                jsonb_build_object('source',b.source,'subject',b.subject_uuid,'current',c.subject_uuid) AS identity,
                jsonb_build_object('binding',to_jsonb(b),'usageIdentity',to_jsonb(a),'issuedSubject',to_jsonb(s),'currentSubject',to_jsonb(current_subject))::text AS data
                FROM xera_quota_grant_subjects b LEFT JOIN xera_quota_pool_subjects a ON a.usage_account=b.usage_account
                LEFT JOIN xera_quota_subjects s ON s.subject_uuid=b.subject_uuid
                LEFT JOIN xera_quota_current_subjects c ON c.user_id=b.user_id
                LEFT JOIN xera_quota_subjects current_subject ON current_subject.subject_uuid=c.subject_uuid
                WHERE b.node_uuid=${node}::uuid ${after ? sql`AND b.grant_id>${after}::uuid` : sql``}
                ORDER BY b.grant_id LIMIT 500`.execute(this.db.kysely);
            await evidence.append(
                'IDENTITIES',
                page.rows.map((row) => row.data),
            );
            for (const row of page.rows) {
                if (!remaining.delete(row.id)) continue;
                const issue = recoveryOwnerIssue(row.identity);
                if (issue) issues.add(issue);
            }
            if (page.rows.length < 500) break;
            after = page.rows[page.rows.length - 1].id;
        }
        if (remaining.size) issues.add('OWNER_UNPROVEN');
        return [...issues];
    }

    private async pending(generation: string) {
        const row =
            await sql`SELECT generation FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL FOR UPDATE`.execute(
                this.db.kysely,
            );
        if (!row.rows.length) throw new QuotaRecoveryError('NOT_PENDING');
    }

    async check(node: string, generation: string, actor: string) {
        return this.inspect(node, generation, actor, false);
    }

    async pause(node: string, generation: string, actor: string) {
        return this.inspect(node, generation, actor, true);
    }

    private async inspect(node: string, generation: string, actor: string, pause: boolean) {
        if (this.transactions.isTransactionActive())
            throw new Error('Quota recovery checks require standalone transactions');
        const request = randomUUID();
        const prepared = await this.transactions.withTransaction({ timeout: 10000 }, async () => {
            await this.pending(generation);
            // One large snapshot per restore generation, across API processes.
            // The lease outlives bounded HTTP + SQL work; a late worker still
            // needs its exact request UUID before it may publish an observation.
            const busy = await sql`SELECT 1 FROM xera_quota_recovery_checks
                WHERE generation=${generation}::uuid AND finished_at IS NULL
                    AND started_at>clock_timestamp()-interval '90 seconds' LIMIT 1`.execute(
                this.db.kysely,
            );
            if (busy.rows.length) throw new QuotaRecoveryError('CHECK_BUSY');
            const expected =
                await sql`SELECT 1 FROM (${recoveryNodeRoster}) e WHERE node_uuid=${node}::uuid`.execute(
                    this.db.kysely,
                );
            if (!expected.rows.length) throw new QuotaRecoveryError('NODE_MISSING');
            const basis = await this.basis(node),
                digest = recoveryDigest(basis);
            const saved =
                await sql`INSERT INTO xera_quota_recovery_checks(generation,node_uuid,request_id,actor_uuid,source_digest)
                VALUES(${generation}::uuid,${node}::uuid,${request}::uuid,${actor}::uuid,${digest})
                ON CONFLICT(generation,node_uuid) DO UPDATE SET request_id=excluded.request_id,actor_uuid=excluded.actor_uuid,source_digest=excluded.source_digest,
                    started_at=clock_timestamp(),finished_at=NULL,report=NULL
                WHERE xera_quota_recovery_checks.finished_at IS NOT NULL OR xera_quota_recovery_checks.started_at<clock_timestamp()-interval '90 seconds'
                RETURNING request_id`.execute(this.db.kysely);
            if (!saved.rows.length) throw new QuotaRecoveryError('CHECK_BUSY');
            if (pause)
                await sql`INSERT INTO xera_quota_recovery_actions(request_id,phase,generation,node_uuid,actor_uuid,action,details)
                VALUES(${request}::uuid,'REQUESTED',${generation}::uuid,${node}::uuid,${actor}::uuid,'PAUSE',
                    ${JSON.stringify({ metadataDigest: digest })}::jsonb)`.execute(this.db.kysely);
            return { basis, digest };
        });
        // Node I/O never holds a SQL transaction. Inspection is read-only;
        // an explicit pause changes admission only, never credit or policy.
        let status: unknown = null,
            journal: unknown = null;
        let snapshot: RecoverySnapshot | null = null;
        let invalidSnapshot = false;
        let pauseConfirmed = false;
        let finalAcknowledgement: Awaited<
            ReturnType<QuotaRecoveryReceiptService['acknowledgedQuiescenceSource']>
        > = null;
        if (prepared.basis.node && !prepared.basis.node.disabled) {
            const nodeOpts = prepared.basis.node;
            try {
                const result = await this.axios.hostPolicy<unknown>(nodeOpts);
                if (result.isOk) {
                    status = result.response;
                    const before = recoveryStatusSchema.safeParse(status);
                    if (
                        pause &&
                        before.success &&
                        before.data.quotaRecoveryFencesSupported &&
                        before.data.coreProcessId &&
                        before.data.quotaRecovery
                    ) {
                        // This endpoint has no release operation. A late request
                        // from a superseded generation can only restrict traffic.
                        await this.axios.hostQuotaRecoveryFence(nodeOpts, {
                            generation,
                            requestId: request,
                            coreProcessId: before.data.coreProcessId,
                            instance: before.data.quotaInstanceId ?? null,
                            previous: before.data.quotaRecovery.record?.digest ?? null,
                        });
                        const after = await this.axios.hostPolicy<unknown>(nodeOpts);
                        status = after.isOk ? after.response : null;
                        const verified = recoveryStatusSchema.safeParse(status);
                        pauseConfirmed =
                            verified.success &&
                            verified.data.coreProcessId === before.data.coreProcessId &&
                            verified.data.quotaRecovery?.record?.state === 'FENCED' &&
                            verified.data.quotaRecovery.record.generation === generation &&
                            verified.data.quotaRecovery.record.token === request;
                    }
                    const parsed = recoveryStatusSchema.safeParse(status);
                    if (
                        parsed.success &&
                        parsed.data.applied &&
                        parsed.data.quotaReservesSupported &&
                        parsed.data.quotaWatermarksSupported
                    ) {
                        if (parsed.data.quotaSnapshotsSupported) {
                            const state = await this.axios.hostQuotaSnapshot<unknown>(nodeOpts, {
                                generation,
                                requestId: request,
                            });
                            if (state.isOk) {
                                try {
                                    snapshot = await decodeRecoverySnapshot(state.response, {
                                        generation,
                                        requestId: request,
                                    });
                                } catch {
                                    invalidSnapshot = true;
                                }
                            }
                        } else {
                            const state = await this.axios.hostQuotaState<unknown>(nodeOpts, {
                                limit: 500,
                            });
                            if (state.isOk) journal = state.response;
                        }
                        if (!pause && snapshot && parsed.data.quotaRecoveryQuiescenceSupported) {
                            const candidate = await this.transactions.withTransaction(
                                { timeout: 10000 },
                                () => this.receipts.acknowledgedQuiescenceSource(node, generation),
                            );
                            if (
                                candidate &&
                                snapshot.instance === candidate.witness.request.instance &&
                                snapshot.coreProcessId ===
                                    candidate.witness.request.coreProcessId &&
                                snapshot.recovery?.record?.state === 'FENCED' &&
                                snapshot.recovery.record.digest ===
                                    candidate.witness.request.previous
                            ) {
                                const proof = await this.axios.usageRecoveryQuiescence(
                                    nodeOpts,
                                    candidate.witness.request,
                                );
                                if (
                                    proof.isOk &&
                                    recoveryQuiescenceAcknowledged(
                                        candidate.witness.request,
                                        proof.response,
                                    )
                                )
                                    finalAcknowledgement = candidate;
                            }
                        }
                    }
                }
            } catch {
                // Persist a bounded diagnostic, never a transport error or URL.
            }
        }
        if (pause) {
            const parsed = recoveryStatusSchema.safeParse(status);
            // Keep the observation even if the restore generation was replaced
            // during RPC. Its immutable intent remains the authoritative context.
            await this.transactions.withTransaction({ timeout: 10000 }, async () => {
                const saved =
                    await sql`INSERT INTO xera_quota_recovery_actions(request_id,phase,generation,node_uuid,actor_uuid,action,details)
                    SELECT request_id,'OBSERVED',generation,node_uuid,actor_uuid,action,
                        ${JSON.stringify({
                            confirmed: pauseConfirmed,
                            coreProcessId: parsed.success
                                ? (parsed.data.coreProcessId ?? null)
                                : null,
                            recovery: parsed.success ? (parsed.data.quotaRecovery ?? null) : null,
                        })}::jsonb
                    FROM xera_quota_recovery_actions WHERE request_id=${request}::uuid AND phase='REQUESTED'
                        AND generation=${generation}::uuid AND node_uuid=${node}::uuid AND actor_uuid=${actor}::uuid RETURNING request_id`.execute(
                        this.db.kysely,
                    );
                if (!saved.rows.length) throw new QuotaRecoveryError('CHECK_SUPERSEDED');
            });
        }
        let report = recoveryReport(prepared.basis, status, journal);
        return this.transactions.withTransaction(
            { timeout: 30000, isolationLevel: 'RepeatableRead' },
            async () => {
                await this.pending(generation);
                const currentBasis = await this.basis(node);
                let evidence: QuotaRecoveryEvidenceWriter | null = null;
                if (snapshot) {
                    evidence = new QuotaRecoveryEvidenceWriter(
                        this.db,
                        {
                            generation,
                            requestId: request,
                            node,
                            actor,
                            metadataDigest: prepared.digest,
                        },
                        snapshot,
                        () => this.transactions.isTransactionActive(),
                    );
                    const watermarks = await this.evidenceMetadata(
                        node,
                        snapshot.instance,
                        evidence,
                    );
                    const identityIssues = await this.evidenceIdentities(node, snapshot, evidence);
                    report = await recoverySnapshotReport(
                        { ...currentBasis, watermarks },
                        status,
                        snapshot,
                        this.grants(node, evidence),
                    );
                    report.issues = [...new Set([...report.issues, ...identityIssues])];
                }
                if (invalidSnapshot)
                    report.issues = [...new Set([...report.issues, 'INVALID_REPORT' as const])];
                if (pause) {
                    report.pauseRequested = true;
                    if (
                        !pauseConfirmed ||
                        (snapshot &&
                            snapshot.recovery?.record?.digest !== report.recoveryFence?.digest)
                    )
                        report.issues = [
                            ...new Set([...report.issues, 'RECOVERY_PAUSE_UNCONFIRMED' as const]),
                        ];
                }
                if (recoveryDigest(currentBasis) !== prepared.digest)
                    report = {
                        ...report,
                        issues: [...new Set([...report.issues, 'STATE_CHANGED' as const])],
                    };
                if (finalAcknowledgement && recoveryDigest(currentBasis) === prepared.digest) {
                    const current = await this.receipts.acknowledgedQuiescenceSource(
                        node,
                        generation,
                    );
                    if (
                        current &&
                        recoveryDigest(current) === recoveryDigest(finalAcknowledgement)
                    ) {
                        // Clear only the receipt issue. Unknown grants, exposure,
                        // legacy debt and every other issue remain independent.
                        report.issues = report.issues.filter(
                            (issue) => issue !== 'PENDING_RECEIPT',
                        );
                        report.acknowledgedReceipt = {
                            stream: current.witness.frame.stream,
                            sequence: current.witness.frame.sequence,
                            digest: current.witness.frame.digest,
                            witnessDigest: current.witness.digest,
                            acknowledgementRequest: current.acknowledgementRequest,
                            decisionRequest: current.decisionRequest,
                        };
                    }
                }
                if (evidence) await evidence.finish(report);
                const updated = await sql<{
                    finishedAt: Date;
                }>`UPDATE xera_quota_recovery_checks SET finished_at=clock_timestamp(),report=${JSON.stringify(report)}::jsonb
                WHERE generation=${generation}::uuid AND node_uuid=${node}::uuid AND request_id=${request}::uuid RETURNING finished_at AS "finishedAt"`.execute(
                    this.db.kysely,
                );
                if (!updated.rows.length) throw new QuotaRecoveryError('CHECK_SUPERSEDED');
                return { nodeUuid: node, report, finishedAt: updated.rows[0].finishedAt };
            },
        );
    }
}
