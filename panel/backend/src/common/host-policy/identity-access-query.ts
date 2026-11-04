import { sql, type RawBuilder } from 'kysely';

import { hostUserAccessQuery } from './host-user-access-query';

export function identityAccessQuery(requested: RawBuilder<unknown>) {
    return sql<{
        userId: string;
        hostUuid: string;
        quotaHostUuid: string | null;
        hwid: string | null;
        parent: string;
        allowed: boolean;
    }>`WITH requested AS MATERIALIZED (${requested}),
    candidates AS MATERIALIZED (
        SELECT user_id,owner_uuid AS host_uuid FROM requested
        UNION SELECT user_id,source_uuid FROM requested
    ), allowed_hosts AS MATERIALIZED (
        ${hostUserAccessQuery(sql`SELECT user_id,host_uuid FROM candidates`)}
    ), owners AS MATERIALIZED (SELECT DISTINCT user_id FROM requested),
    blocked_users AS MATERIALIZED (
        SELECT d.user_id FROM hwid_user_devices d JOIN owners o ON o.user_id=d.user_id WHERE d.blocked
        UNION SELECT p.user_id FROM xera_hwid_registration_policy p JOIN owners o ON o.user_id=p.user_id WHERE NOT p.registration_allowed
    )
    SELECT r.user_id::text AS "userId",r.host_uuid AS "hostUuid",
        CASE WHEN r.owner_uuid=r.host_uuid THEN NULL::uuid ELSE r.owner_uuid END AS "quotaHostUuid",
        r.hwid,r.parent,
        COALESCE(a.user_id IS NOT NULL AND s.user_id IS NOT NULL AND u.vless_uuid=r.parent AND
            CASE WHEN r.hwid IS NULL THEN b.user_id IS NULL ELSE d.user_id IS NOT NULL AND NOT d.blocked END,false) AS allowed
    FROM requested r JOIN users u ON u.id=r.user_id
    LEFT JOIN allowed_hosts a ON a.user_id=r.user_id AND a.host_uuid=r.owner_uuid
    LEFT JOIN allowed_hosts s ON s.user_id=r.user_id AND s.host_uuid=r.source_uuid
    LEFT JOIN blocked_users b ON b.user_id=r.user_id
    LEFT JOIN hwid_user_devices d ON d.user_id=r.user_id AND d.hwid=r.hwid`;
}
