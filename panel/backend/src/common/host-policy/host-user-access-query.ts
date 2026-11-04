import { sql, type RawBuilder } from 'kysely';

export function hostUserAccessQuery(candidates: RawBuilder<unknown>, entitledOnly = false) {
    return sql<{ user_id: bigint; host_uuid: string }>`SELECT DISTINCT c.user_id,c.host_uuid
        FROM (${candidates}) c JOIN users u ON u.id=c.user_id JOIN hosts h ON h.uuid=c.host_uuid
        JOIN internal_squad_inbounds si ON si.inbound_uuid=h.config_profile_inbound_uuid
        JOIN internal_squad_members sm ON sm.internal_squad_uuid=si.internal_squad_uuid AND sm.user_id=c.user_id
        LEFT JOIN internal_squad_host_links hl ON hl.host_uuid=h.uuid AND hl.squad_uuid=si.internal_squad_uuid
        WHERE ((hl.host_uuid IS NOT NULL)=(h.internal_squads_mode='ALLOW_ONLY'))
        ${
            entitledOnly
                ? sql``
                : sql`AND NOT h.is_disabled
          AND ((u.status='ACTIVE' AND u.expire_at>now() AND NOT h.only_when_inactive)
            OR (h.always_available AND (u.status IN ('EXPIRED','DISABLED','FROZEN','LIMITED')
                OR (u.status='ACTIVE' AND u.expire_at<=now()))))`
        }`;
}
