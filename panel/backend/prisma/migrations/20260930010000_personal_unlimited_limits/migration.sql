-- Unlimited quota is a personal scope override, retained until explicitly revoked.
-- It never disables pause flags, speed limits or subscription/access checks.
ALTER TABLE xera_limit_user_adjustments ADD COLUMN unlimited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE xera_limit_actions DROP CONSTRAINT xera_limit_actions_action_check;
ALTER TABLE xera_limit_actions ADD CONSTRAINT xera_limit_actions_action_check
 CHECK(action IN ('ADD','RESET','PAUSE','RESUME','UNLIMITED','LIMITED'));

CREATE OR REPLACE FUNCTION xera_limit_state(p_kind TEXT,p_key TEXT,p_user BIGINT)
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
  s.quota,s.bonus,CASE WHEN COALESCE((SELECT a.unlimited FROM xera_limit_user_adjustments a WHERE a.kind=p_kind AND a.key=p_key AND a.user_id=p_user),false) THEN 0 WHEN s.quota>0 THEN s.quota+s.bonus ELSE 0 END,
  COALESCE((SELECT c.paused FROM xera_limit_scopes c WHERE c.kind=p_kind AND c.key=p_key),false) OR COALESCE((SELECT a.paused FROM xera_limit_user_adjustments a WHERE a.kind=p_kind AND a.key=p_key AND a.user_id=p_user),false),s.start
 FROM state s;
$$;

