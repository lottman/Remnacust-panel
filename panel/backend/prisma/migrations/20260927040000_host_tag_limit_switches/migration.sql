-- Defaults preserve all existing tag restrictions. No traffic or adjustments are deleted.
ALTER TABLE hosts
 ADD COLUMN use_tag_traffic_limit BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN use_tag_speed_limit BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN use_tag_total_speed_limit BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION xera_limit_entitled(p_kind TEXT,p_key TEXT,p_user BIGINT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM hosts h WHERE
  ((p_kind='HOST' AND h.uuid::text=p_key) OR (p_kind='TAG' AND p_key=ANY(h.tags) AND h.use_tag_traffic_limit))
  AND xera_host_user_entitled(p_user,h.uuid));
$$;

CREATE OR REPLACE FUNCTION xera_limit_raw(p_kind TEXT,p_key TEXT,p_user BIGINT,p_window DATE,p_factor DOUBLE PRECISION)
RETURNS TABLE(bucket TEXT,raw_bytes NUMERIC,multiplier NUMERIC) LANGUAGE SQL STABLE AS $$
 SELECT h.uuid::text,COALESCE(sum(q.total_bytes),0)::numeric,
  COALESCE(h.traffic_multiplier,p_factor)::numeric
 FROM hosts h LEFT JOIN xera_host_quota_usage q ON q.host_uuid=h.uuid AND q.user_id=p_user AND q.created_at>=p_window
 WHERE (p_kind='HOST' AND h.uuid::text=p_key) OR (p_kind='TAG' AND p_key=ANY(h.tags) AND h.use_tag_traffic_limit)
 GROUP BY h.uuid,h.traffic_multiplier
 UNION ALL
 SELECT 'legacy',COALESCE(sum(total_bytes),0)::numeric,p_factor::numeric
 FROM xera_legacy_tag_quota_usage WHERE p_kind='TAG' AND tag=p_key AND user_id=p_user AND created_at>=p_window
 HAVING p_kind='TAG';
$$;
