import { sql } from 'kysely';

// Financial and recovery records outlive the editable nodes table. Keep their
// original node identities visible; absence of an endpoint is not settlement.
export const RECOVERY_NODE_SOURCES = [
    'hosts_to_nodes',
    'config_profile_inbounds_to_nodes',
    'xera_quota_node_modes',
    'xera_quota_reserves',
    'xera_quota_journal_watermarks',
    'xera_quota_usage_exposures',
    'xera_quota_grant_subjects',
    'xera_quota_receipt_requests',
    'xera_quota_receipt_captures',
    'xera_node_usage_streams',
    'xera_legacy_usage_streams',
    'xera_quota_usage_deliveries',
    'xera_quota_node_epochs',
    'xera_node_policy_revisions',
    'xera_quota_node_progress',
    'xera_quota_transition_nodes',
    'xera_quota_recovery_checks',
    'xera_quota_recovery_evidence',
    'xera_quota_recovery_actions',
    'xera_quota_recovery_settlements',
    'xera_native_quota_recovery_decisions',
    'xera_quota_recovery_policy_jobs',
    'xera_quota_recovery_receipt_jobs',
    'xera_quota_recovery_tail_preparations',
    'xera_quota_recovery_quiescence',
    'xera_quota_recovery_exposure_closures',
    'xera_quota_recovery_release_jobs',
] as const;

// UNION removes overlap before the UUID keyset pagination. A transition may
// name its required nodes before individual delivery rows have been created.
export const recoveryNodeRoster = sql`
    SELECT uuid AS node_uuid FROM nodes
    UNION ${sql.join(
        RECOVERY_NODE_SOURCES.map((table) => sql`SELECT node_uuid FROM ${sql.table(table)}`),
        sql` UNION `,
    )}
    UNION SELECT required.node_uuid FROM xera_quota_transitions
        CROSS JOIN LATERAL unnest(desired_nodes) AS required(node_uuid)
        WHERE required.node_uuid IS NOT NULL
`;
