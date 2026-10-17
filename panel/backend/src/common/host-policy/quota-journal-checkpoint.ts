import type { QuotaNodeMode, QuotaPolicyBody } from './quota-policy';

import { sql } from 'kysely';

import type { TxKyselyService } from '@common/database';

export const QUOTA_WATERMARK_VERSION = 'remnacust-quota-watermarks-v1';
export async function quotaRestoreState(db: TxKyselyService) {
    const result = await sql<{
        generation: string;
        restoredAt: Date;
        reconciledAt: Date | null;
    }>`SELECT generation::text AS generation,restored_at AS "restoredAt",reconciled_at AS "reconciledAt" FROM xera_quota_restore_state WHERE singleton`.execute(
        db.kysely,
    );
    return result.rows[0] ?? null;
}
export type QuotaJournalObservation = {
    quotaWatermarksSupported?: boolean;
    quotaJournalSequence?: string | null;
    quotaInstanceId?: string | null;
    policyRevision?: string;
};

export async function renderQuotaCheckpoint(
    db: TxKyselyService,
    node: string,
    mode: QuotaNodeMode,
    body: QuotaPolicyBody,
    observation: QuotaJournalObservation | null | undefined,
) {
    // The very first fencing request creates the private journal on the node.
    // Enrollment begins on the next request after that identity is acknowledged.
    if (!mode.instance) return;
    if (
        !observation?.quotaWatermarksSupported ||
        observation.quotaInstanceId !== mode.instance ||
        typeof observation.quotaJournalSequence !== 'string' ||
        !/^(0|[1-9][0-9]{0,15})$/.test(observation.quotaJournalSequence) ||
        BigInt(observation.quotaJournalSequence) > BigInt(Number.MAX_SAFE_INTEGER)
    )
        throw new Error(
            `Node ${node}: update node and core or recover the quota journal checkpoint`,
        );
    await sql`SELECT xera_observe_quota_journal(${node}::uuid,${mode.instance}::uuid,${observation.quotaJournalSequence}::bigint,${observation.policyRevision ?? '0'}::bigint)`.execute(
        db.kysely,
    );
    body.quotaCheckpoint = { instance: mode.instance, sequence: observation.quotaJournalSequence };
}

export async function observeQuotaCheckpoint(
    db: TxKyselyService,
    node: string,
    instance: string,
    sequence: number,
    revision: string,
) {
    await sql`SELECT xera_observe_quota_journal(${node}::uuid,${instance}::uuid,${sequence}::bigint,${revision}::bigint)`.execute(
        db.kysely,
    );
}
