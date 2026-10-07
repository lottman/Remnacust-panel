import { sql } from 'kysely';

export type LimitScope = {
    kind: 'HOST' | 'TAG';
    key: string;
    name: string;
    limitBytes: string;
    usedBytes: string;
    viewPosition: number;
    speedLimitMbps: number | null;
    totalSpeedLimitMbps: number | null;
    trafficMultiplier: number | null;
    hostCount: number;
    paused: boolean;
};

export function limitScopesQuery(withUsage = true) {
    // Read traffic only for the overview, never while authorizing an action.
    // Only users with recorded traffic can contribute; no hosts × users cross join.
    const usage = withUsage
        ? sql`
      candidates AS (
        SELECT 'HOST'::text AS kind,q.host_uuid::text AS key,q.user_id FROM xera_host_quota_usage q
        UNION
        SELECT 'TAG',t.tag,q.user_id FROM xera_host_quota_usage q
          JOIN hosts h ON h.uuid=q.host_uuid AND h.use_tag_traffic_limit
          CROSS JOIN LATERAL unnest(h.tags) t(tag)
        UNION
        SELECT 'TAG',tag,user_id FROM xera_legacy_tag_quota_usage
      ), usage AS (
        SELECT c.kind,c.key,sum(s.used_bytes)::text AS bytes
        FROM candidates c JOIN entries e ON e.kind=c.kind AND e.key=c.key
        CROSS JOIN LATERAL xera_limit_state(c.kind,c.key,c.user_id) s
        WHERE xera_limit_entitled(c.kind,c.key,c.user_id)
        GROUP BY c.kind,c.key
      )`
        : sql`usage AS (SELECT NULL::text AS kind,NULL::text AS key,'0'::text AS bytes WHERE false)`;
    return sql<LimitScope>`WITH entries AS (
      SELECT 'HOST'::text AS kind,h.uuid::text AS key,h.remark AS name,
        COALESCE(h.user_traffic_limit_bytes,0)::text AS "limitBytes",h.view_position AS "viewPosition",
        h.server_speed_limit_mbps AS "speedLimitMbps",h.total_speed_limit_mbps AS "totalSpeedLimitMbps",
        h.traffic_multiplier AS "trafficMultiplier",1 AS "hostCount"
      FROM hosts h
      UNION ALL
      SELECT 'TAG',t.tag,t.tag,COALESCE(l.user_traffic_limit_bytes,0)::text,
        COALESCE((SELECT min(h.view_position) FROM hosts h WHERE t.tag=ANY(h.tags)),2147483647),
        l.speed_limit_mbps,l.total_speed_limit_mbps,l.traffic_multiplier,
        (SELECT count(*)::integer FROM hosts h WHERE t.tag=ANY(h.tags) AND h.use_tag_traffic_limit)
      FROM (SELECT DISTINCT unnest(tags) AS tag FROM hosts UNION SELECT tag FROM xera_host_tag_limits) t
      LEFT JOIN xera_host_tag_limits l ON l.tag=t.tag
    ), ${usage}
    SELECT e.*,COALESCE(c.paused,false) AS paused,COALESCE(u.bytes,'0') AS "usedBytes"
    FROM entries e LEFT JOIN xera_limit_scopes c ON c.kind=e.kind AND c.key=e.key
    LEFT JOIN usage u ON u.kind=e.kind AND u.key=e.key
    ORDER BY e."viewPosition",e.kind,e.name,e.key`;
}
