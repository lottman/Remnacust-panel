import type { QuotaPolicyBody } from './quota-policy';

import { sql } from 'kysely';

import type { TxKyselyService } from '@common/database';

// Called in the same transaction as the desired revision. A committed transfer
// remains a soft admission barrier across retries and scheduler restarts.
export async function renderQuotaTransitionPolicy(
    db: TxKyselyService,
    node: string,
    body: QuotaPolicyBody,
) {
    const fences = await sql<{ group: string; owner: string; phase: string }>`
        SELECT lower(t.kind)||':'||t.key AS "group",t.user_id::text AS owner,t.phase
        FROM xera_quota_transitions t JOIN xera_quota_transition_nodes p ON p.transition_id=t.id
        WHERE p.node_uuid=${node}::uuid AND NOT p.release_ready
          AND (t.phase IN ('FENCING','DRAINING','SETTLING','FUNDING','RELEASING') OR (t.phase='PREFLIGHT' AND p.hold_barrier))
        ORDER BY t.kind,t.key,t.user_id LIMIT 200001
    `.execute(db.kysely);
    if (fences.rows.length > 200000) throw new Error('Quota transition policy exceeds limit');
    for (const fence of fences.rows) {
        const group = body.groups[fence.group];
        // Removing the entire scope is an admission denial, not a new unlimited
        // scope. Do not resurrect a host or its credentials just to show a fence.
        if (!group) continue;
        group.fencedOwners = {
            ...(group.fencedOwners as Record<string, boolean> | undefined),
            [fence.owner]: true,
        };
        const reserves = group.reserves as Record<string, unknown> | undefined;
        // The old SQL grant was retired before this policy can be prepared.
        // Omission seals that grant locally; the soft fence keeps links waiting.
        if (reserves) delete reserves[fence.owner];
    }
}
