-- Panel-only quota administration. Raw billing and host traffic are never erased.
CREATE TABLE xera_limit_scopes (
 kind TEXT NOT NULL CHECK(kind IN ('HOST','TAG')), key TEXT NOT NULL,
 paused BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,key)
);
CREATE TABLE xera_limit_user_adjustments (
 kind TEXT NOT NULL, key TEXT NOT NULL, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 window_start DATE NOT NULL, bonus_bytes BIGINT NOT NULL DEFAULT 0 CHECK(bonus_bytes>=0),
 paused BOOLEAN NOT NULL DEFAULT false, reset_base JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,key,user_id), FOREIGN KEY(kind,key) REFERENCES xera_limit_scopes(kind,key) ON DELETE CASCADE
);
CREATE TABLE xera_limit_actions (
 id UUID PRIMARY KEY, kind TEXT NOT NULL, key TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('ADD','RESET','PAUSE','RESUME')),
 amount_bytes BIGINT NOT NULL DEFAULT 0 CHECK(amount_bytes>=0), affected_users INTEGER NOT NULL,
 selection JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(kind,key) REFERENCES xera_limit_scopes(kind,key) ON DELETE CASCADE
);

-- Entitlement is independent of subscription status and quota. The UI can show
-- assigned users even when they are expired, paused or out of traffic.
CREATE FUNCTION xera_host_user_entitled(p_user BIGINT,p_host UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM hosts h
 JOIN internal_squad_inbounds si ON si.inbound_uuid=h.config_profile_inbound_uuid
 JOIN internal_squad_members sm ON sm.internal_squad_uuid=si.internal_squad_uuid AND sm.user_id=p_user
 WHERE h.uuid=p_host AND
 (EXISTS(SELECT 1 FROM internal_squad_host_links hl WHERE hl.host_uuid=h.uuid AND hl.squad_uuid=si.internal_squad_uuid)
  = (h.internal_squads_mode='ALLOW_ONLY')));
$$;
CREATE FUNCTION xera_limit_entitled(p_kind TEXT,p_key TEXT,p_user BIGINT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM hosts h WHERE
  ((p_kind='HOST' AND h.uuid::text=p_key) OR (p_kind='TAG' AND p_key=ANY(h.tags)))
  AND xera_host_user_entitled(p_user,h.uuid));
$$;

CREATE FUNCTION xera_limit_raw(p_kind TEXT,p_key TEXT,p_user BIGINT,p_window DATE,p_factor DOUBLE PRECISION)
RETURNS TABLE(bucket TEXT,raw_bytes NUMERIC,multiplier NUMERIC) LANGUAGE SQL STABLE AS $$
 SELECT h.uuid::text,COALESCE(sum(q.total_bytes),0)::numeric,
  COALESCE(h.traffic_multiplier,p_factor)::numeric
 FROM hosts h LEFT JOIN xera_host_quota_usage q ON q.host_uuid=h.uuid AND q.user_id=p_user AND q.created_at>=p_window
 WHERE (p_kind='HOST' AND h.uuid::text=p_key) OR (p_kind='TAG' AND p_key=ANY(h.tags))
 GROUP BY h.uuid,h.traffic_multiplier
 UNION ALL
 SELECT 'legacy',COALESCE(sum(total_bytes),0)::numeric,p_factor::numeric
 FROM xera_legacy_tag_quota_usage WHERE p_kind='TAG' AND tag=p_key AND user_id=p_user AND created_at>=p_window
 HAVING p_kind='TAG';
$$;

CREATE FUNCTION xera_limit_state(p_kind TEXT,p_key TEXT,p_user BIGINT)
RETURNS TABLE(used_bytes BIGINT,base_limit BIGINT,bonus_bytes BIGINT,effective_limit BIGINT,paused BOOLEAN,window_start DATE)
LANGUAGE SQL STABLE AS $$
 WITH config AS (
  SELECT COALESCE(user_traffic_limit_bytes,0) AS quota,traffic_limit_reset_anchor_at AS anchor,
   traffic_limit_reset_value AS reset_value,traffic_limit_reset_unit AS reset_unit,COALESCE(traffic_multiplier,1) AS factor
  FROM hosts WHERE p_kind='HOST' AND uuid::text=p_key
  UNION ALL
  SELECT COALESCE(l.user_traffic_limit_bytes,0),COALESCE(l.reset_anchor_at,'1970-01-01'::timestamptz),
   COALESCE(l.reset_value,0),COALESCE(l.reset_unit,'DAYS'),COALESCE(l.traffic_multiplier,1)
  FROM (SELECT p_key AS tag) t LEFT JOIN xera_host_tag_limits l ON l.tag=t.tag WHERE p_kind='TAG'
 ), period AS (
  SELECT *, (xera_quota_window_start(anchor,reset_value,reset_unit,now()) AT TIME ZONE 'UTC')::date AS start FROM config
 ), state AS (
  SELECT p.*, COALESCE(a.bonus_bytes,0) AS bonus,COALESCE(a.reset_base,'{}') AS baseline
  FROM period p LEFT JOIN xera_limit_user_adjustments a ON a.kind=p_kind AND a.key=p_key AND a.user_id=p_user AND a.window_start=p.start
 )
 SELECT CEIL(COALESCE((SELECT sum(GREATEST(r.raw_bytes-COALESCE((s.baseline->>r.bucket)::numeric,0),0)*r.multiplier)
   FROM xera_limit_raw(p_kind,p_key,p_user,s.start,s.factor) r),0))::bigint,
  s.quota,s.bonus,CASE WHEN s.quota>0 THEN s.quota+s.bonus ELSE 0 END,
  COALESCE((SELECT c.paused FROM xera_limit_scopes c WHERE c.kind=p_kind AND c.key=p_key),false) OR COALESCE((SELECT a.paused FROM xera_limit_user_adjustments a WHERE a.kind=p_kind AND a.key=p_key AND a.user_id=p_user),false),s.start
 FROM state s;
$$;

CREATE FUNCTION xera_cleanup_limit_scope() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM xera_limit_scopes WHERE kind=CASE WHEN TG_TABLE_NAME='hosts' THEN 'HOST' ELSE 'TAG' END
 AND key=CASE WHEN TG_TABLE_NAME='hosts' THEN to_jsonb(OLD)->>'uuid' ELSE to_jsonb(OLD)->>'tag' END;
 RETURN OLD;
END $$;
CREATE TRIGGER xera_host_limit_cleanup AFTER DELETE ON hosts FOR EACH ROW EXECUTE FUNCTION xera_cleanup_limit_scope();
CREATE TRIGGER xera_tag_limit_cleanup AFTER DELETE ON xera_host_tag_limits FOR EACH ROW EXECUTE FUNCTION xera_cleanup_limit_scope();
