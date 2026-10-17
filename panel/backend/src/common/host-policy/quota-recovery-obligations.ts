import { sql } from 'kysely';
import { z } from 'zod';

import type { TxKyselyService } from '@common/database';

const count = z
    .string()
    .regex(/^(0|[1-9][0-9]{0,18})$/)
    .refine((value) => BigInt(value) <= 9223372036854775807n);
export const recoveryObligationsSchema = z.strictObject({
    unsettledReserves: count,
    exposures: count,
    nativeTickets: count,
    nativeEffects: count,
    legacyStreams: count,
    legacyJobs: count,
    recoveryDeliveries: count,
    activeWorkers: count,
});
export type RecoveryObligations = z.infer<typeof recoveryObligationsSchema>;

// One SQL statement observes the global ledgers, not just the visible page of
// nodes. A missing/restored generation is unknown, never eight zero counters.
export async function readRecoveryObligations(db: TxKyselyService, generation: string) {
    z.uuid().parse(generation);
    const row = (
        await sql<RecoveryObligations>`SELECT
        (SELECT count(*)::text FROM xera_quota_reserves WHERE closed_usage_bytes IS NULL) AS "unsettledReserves",
        (SELECT count(*)::text FROM xera_quota_usage_exposures) AS exposures,
        (SELECT count(*)::text FROM xera_node_usage_streams WHERE expected_core IS NOT NULL AND committed_digest IS NULL) AS "nativeTickets",
        (SELECT count(*)::text FROM xera_node_usage_streams WHERE pending_effects IS NOT NULL) AS "nativeEffects",
        (SELECT count(*)::text FROM xera_legacy_usage_streams WHERE uncertain_since IS NOT NULL OR requested_at IS NOT NULL OR payload IS NOT NULL OR pending_effects IS NOT NULL OR applied) AS "legacyStreams",
        (SELECT count(*)::text FROM xera_legacy_usage_jobs WHERE NOT applied OR pending_users IS NOT NULL) AS "legacyJobs",
        ((SELECT count(*) FROM xera_quota_recovery_policy_jobs WHERE generation=${generation}::uuid AND result IS NULL)
            +(SELECT count(*) FROM xera_quota_recovery_receipt_jobs WHERE generation=${generation}::uuid AND result IS NULL)
            +(SELECT count(*) FROM xera_quota_recovery_release_jobs j JOIN xera_quota_recovery_release_approvals a ON a.request_id=j.approval_request WHERE a.generation=${generation}::uuid AND j.result IS NULL))::text AS "recoveryDeliveries",
        ((SELECT count(*) FROM xera_quota_coordinator WHERE lease_owner IS NOT NULL AND lease_until>clock_timestamp())
            +(SELECT count(*) FROM xera_quota_recovery_policy_jobs WHERE lease_owner IS NOT NULL AND lease_until>clock_timestamp())
            +(SELECT count(*) FROM xera_quota_recovery_receipt_jobs WHERE lease_owner IS NOT NULL AND lease_until>clock_timestamp())
            +(SELECT count(*) FROM xera_quota_recovery_release_jobs WHERE lease_owner IS NOT NULL AND lease_until>clock_timestamp()))::text AS "activeWorkers"
        FROM xera_quota_restore_state WHERE singleton AND generation=${generation}::uuid AND reconciled_at IS NULL`.execute(
            db.kysely,
        )
    ).rows[0];
    return row ? recoveryObligationsSchema.parse(row) : null;
}

// This is a necessary SQL precondition, not release authorization. A caller
// must ALSO validate the full roster, live Node proofs and external queue.
export function requireSettledRecoveryObligations(value: unknown) {
    const obligations = recoveryObligationsSchema.parse(value);
    const pending = Object.entries(obligations)
        .filter(([, value]) => value !== '0')
        .map(([key]) => key);
    if (pending.length) throw new Error('Recovery obligations pending: ' + pending.join(', '));
    return obligations;
}
