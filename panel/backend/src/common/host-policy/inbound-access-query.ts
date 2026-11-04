import { sql, type RawBuilder } from 'kysely';

export function inboundAccessQuery(
    candidates: RawBuilder<unknown>,
    legacy: readonly string[] = [],
) {
    return sql<{
        user_id: bigint;
        inbound_uuid: string;
    }>`WITH candidates AS MATERIALIZED (${candidates}),
        inbound_modes AS MATERIALIZED (
            SELECT h.config_profile_inbound_uuid AS inbound_uuid,
                bool_and(h.only_when_inactive) AS inactive_only
            FROM hosts h WHERE h.config_profile_inbound_uuid IN (SELECT inbound_uuid FROM candidates)
            GROUP BY h.config_profile_inbound_uuid
        ), exceptions AS MATERIALIZED (
            SELECT DISTINCT sm.user_id,h.config_profile_inbound_uuid AS inbound_uuid
            FROM internal_squad_members sm
            JOIN internal_squad_inbounds si ON si.internal_squad_uuid=sm.internal_squad_uuid
            JOIN hosts h ON h.config_profile_inbound_uuid=si.inbound_uuid
            LEFT JOIN internal_squad_host_links hl ON hl.host_uuid=h.uuid AND hl.squad_uuid=si.internal_squad_uuid
            WHERE h.always_available AND NOT h.is_disabled
              AND ((hl.host_uuid IS NOT NULL)=(h.internal_squads_mode='ALLOW_ONLY'))
              AND sm.user_id IN (SELECT user_id FROM candidates)
              AND h.config_profile_inbound_uuid IN (SELECT inbound_uuid FROM candidates)
        )
        SELECT DISTINCT c.user_id,c.inbound_uuid FROM candidates c JOIN users u ON u.id=c.user_id
        LEFT JOIN inbound_modes m ON m.inbound_uuid=c.inbound_uuid
        LEFT JOIN exceptions e ON e.user_id=c.user_id AND e.inbound_uuid=c.inbound_uuid
        WHERE (u.status='ACTIVE' AND u.expire_at>now() AND NOT COALESCE(m.inactive_only,false))
            OR ((u.status IN ('EXPIRED','DISABLED') OR (u.status='ACTIVE' AND u.expire_at<=now()))
                AND e.user_id IS NOT NULL
                ${legacy.length ? sql`AND c.inbound_uuid NOT IN (${sql.join(legacy.map((id) => sql`${id}::uuid`))})` : sql``})`;
}
