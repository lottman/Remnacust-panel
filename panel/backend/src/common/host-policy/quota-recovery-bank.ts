import { sql } from 'kysely';
import { z } from 'zod';

import type { TxKyselyService } from '@common/database';

export const RECOVERY_BANK_VERSION = 'remnacust-quota-bank-v1';
export class RecoveryBankCapacityError extends Error {}

// This catalog is versioned with the recovery plan. Credential-bearing tables
// use explicit projections; financial ledgers retain their complete SQL rows.
const sources = [
    {
        table: 'users',
        columns: [
            'id',
            'username',
            'status',
            'traffic_limit_bytes',
            'traffic_limit_strategy',
            'expire_at',
            'last_traffic_reset_at',
            'hwid_device_limit',
            'external_squad_uuid',
            'created_at',
        ],
    },
    { table: 'user_traffic' },
    {
        table: 'nodes',
        columns: [
            'uuid',
            'id',
            'name',
            'is_disabled',
            'active_config_profile_uuid',
            'consumption_multiplier',
            'node_consumption_multiplier',
            'traffic_limit_bytes',
            'traffic_used_bytes',
            'tags',
        ],
    },
    {
        table: 'hosts',
        columns: [
            'uuid',
            'tags',
            'always_available',
            'only_when_inactive',
            'is_disabled',
            'user_traffic_limit_bytes',
            'traffic_limit_reset_value',
            'traffic_limit_reset_unit',
            'traffic_limit_reset_anchor_at',
            'traffic_multiplier',
            'use_tag_traffic_limit',
            'use_tag_speed_limit',
            'use_tag_total_speed_limit',
            'internal_squads_mode',
            'config_profile_inbound_uuid',
            'config_profile_uuid',
        ],
    },
    { table: 'internal_squad_members' },
    { table: 'internal_squad_inbounds' },
    { table: 'internal_squad_host_links' },
    { table: 'hosts_to_nodes' },
    {
        table: 'config_profile_inbounds',
        columns: ['uuid', 'profile_uuid', 'tag', 'type', 'network', 'security', 'port'],
    },
    { table: 'config_profile_inbounds_to_nodes' },
    { table: 'xera_host_tag_limits' },
    { table: 'xera_limit_scopes' },
    { table: 'xera_limit_user_adjustments' },
    { table: 'xera_limit_actions' },
    { table: 'xera_quota_usage' },
    { table: 'xera_host_quota_usage' },
    { table: 'xera_legacy_tag_quota_usage' },
    { table: 'xera_quota_budget_heads' },
    { table: 'xera_quota_budget_actions' },
    { table: 'xera_quota_reserve_pools' },
    { table: 'xera_quota_usage_deliveries' },
    { table: 'xera_quota_reserves' },
    { table: 'xera_quota_reserve_operations' },
    { table: 'xera_quota_node_epochs' },
    { table: 'xera_quota_node_modes' },
    { table: 'xera_node_policy_revisions' },
    { table: 'xera_quota_journal_watermarks' },
    { table: 'xera_quota_restore_state' },
    { table: 'xera_quota_receipt_requests' },
    { table: 'xera_quota_receipt_captures' },
    { table: 'xera_quota_usage_exposures' },
    { table: 'xera_node_usage_streams' },
    { table: 'xera_legacy_usage_streams' },
    { table: 'xera_legacy_usage_jobs' },
    { table: 'xera_legacy_quota_recovery_decisions' },
    { table: 'xera_quota_recovery_settlements' },
    { table: 'xera_native_quota_recovery_decisions' },
    {
        table: 'xera_quota_recovery_policy_jobs',
        columns: [
            'request_id',
            'generation',
            'node_uuid',
            'actor_uuid',
            'connection_hash',
            'payload',
            'created_at',
            'result',
        ],
    },
    { table: 'xera_quota_subjects' },
    { table: 'xera_quota_current_subjects' },
    { table: 'xera_quota_recovery_tail_preparations' },
    { table: 'xera_quota_recovery_quiescence' },
    { table: 'xera_quota_recovery_exposure_closures' },
    {
        table: 'xera_quota_recovery_receipt_jobs',
        columns: [
            'request_id',
            'generation',
            'node_uuid',
            'actor_uuid',
            'decision_request',
            'connection_hash',
            'source',
            'created_at',
            'result',
        ],
    },
    { table: 'xera_quota_pool_subjects' },
    { table: 'xera_quota_grant_subjects' },
    { table: 'xera_quota_recovery_release_approvals' },
    {
        table: 'xera_quota_recovery_release_jobs',
        columns: [
            'request_id',
            'approval_request',
            'node_uuid',
            'evidence_request',
            'connection_hash',
            'payload',
            'previous',
            'created_at',
        ],
    },
    { table: 'xera_quota_coordinator' },
    { table: 'xera_quota_node_progress' },
    { table: 'xera_quota_transitions' },
    { table: 'xera_quota_transition_nodes' },
] as const;

export const RECOVERY_BANK_TABLES = sources.map((source) => source.table);
export type RecoveryBankPage = {
    section: (typeof sources)[number]['table'];
    rows: string[];
};

// The consumer writes these exact JSON texts to the immutable recovery plan.
// It must not parse them through JavaScript numbers before hashing/archiving.
export async function* readRecoveryBank(
    db: TxKyselyService,
    generation: string,
    inTransaction: () => boolean,
): AsyncGenerator<RecoveryBankPage> {
    z.uuid().parse(generation);
    const active = () => {
        if (!inTransaction()) throw new Error('Recovery bank requires an active transaction');
    };
    active();
    const isolation = await sql<{
        level: string;
    }>`SELECT current_setting('transaction_isolation') AS level`.execute(db.kysely);
    if (!['repeatable read', 'serializable'].includes(isolation.rows[0]?.level))
        throw new Error('Recovery bank requires a consistent transaction snapshot');
    const restore = await sql`SELECT 1 FROM xera_quota_restore_state WHERE singleton
        AND generation=${generation}::uuid AND reconciled_at IS NULL FOR SHARE`.execute(db.kysely);
    if (!restore.rows.length) throw new Error('Recovery generation is not pending');
    await sql`SET LOCAL TIME ZONE 'UTC'`.execute(db.kysely);

    for (const source of sources) {
        active();
        const keys = await sql<{ name: string }>`SELECT a.attname AS name FROM pg_index i
            JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,position)
            JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
            WHERE n.nspname='public' AND c.relname=${source.table} AND i.indisprimary
            ORDER BY k.position`.execute(db.kysely);
        if (!keys.rows.length) throw new Error('Recovery source has no stable primary key');
        const key = sql`jsonb_build_array(${sql.join(keys.rows.map((row) => sql.ref('r.' + row.name)))})`;
        const projection =
            'columns' in source
                ? sql`(SELECT p FROM (SELECT ${sql.join(source.columns.map((name) => sql.ref('r.' + name)))}) p)`
                : sql.ref('r');
        let cursor: string | null = null;
        let emitted = false;
        for (;;) {
            active();
            const sizes: { rows: { cursor: string; bytes: number }[] } = await sql<{
                cursor: string;
                bytes: number;
            }>`
                SELECT ${key}::text AS cursor,octet_length(to_jsonb(${projection})::text) AS bytes
                FROM ${sql.table('public.' + source.table)} r
                ${cursor === null ? sql`` : sql`WHERE ${key}>${cursor}::jsonb`}
                ORDER BY ${key} LIMIT 500`.execute(db.kysely);
            let count = 0,
                bytes = 0;
            for (const row of sizes.rows) {
                if (row.bytes > 32 * 1024 * 1024 - 1024)
                    throw new RecoveryBankCapacityError(
                        'Recovery bank row exceeds archive capacity',
                    );
                if (count && bytes + row.bytes > 16 * 1024 * 1024) break;
                count++;
                bytes += row.bytes;
                if (bytes >= 16 * 1024 * 1024) break;
            }
            // Size metadata is bounded before transferring potentially large
            // journal/plan bodies into the application process.
            const page: { rows: { cursor: string; data: string }[] } = count
                ? await sql<{ cursor: string; data: string }>`
                SELECT ${key}::text AS cursor,to_jsonb(${projection})::text AS data
                FROM ${sql.table('public.' + source.table)} r
                ${cursor === null ? sql`` : sql`WHERE ${key}>${cursor}::jsonb`}
                ORDER BY ${key} LIMIT ${count}`.execute(db.kysely)
                : { rows: [] };
            if (page.rows.length !== count) throw new Error('Recovery bank snapshot changed');
            active();
            if (page.rows.length || !emitted)
                yield { section: source.table, rows: page.rows.map((row) => row.data) };
            emitted = true;
            if (count === sizes.rows.length && sizes.rows.length < 500) break;
            cursor = page.rows[page.rows.length - 1].cursor;
        }
    }
}
