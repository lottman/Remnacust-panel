-- Revision allocation commits independently of policy delivery. Reconnect reads
-- the node's durable high-water mark before allocating, including after DB restore.
CREATE TABLE xera_node_policy_revisions (
    node_uuid UUID PRIMARY KEY,
    revision BIGINT NOT NULL CHECK(revision>=0)
);

CREATE FUNCTION xera_next_host_policy_revision(p_node UUID,p_seen BIGINT)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE allocated BIGINT;
BEGIN
    IF p_seen IS NULL OR p_seen<0 OR p_seen>=9223372036854775807 THEN RAISE EXCEPTION 'invalid node policy revision boundary'; END IF;
    INSERT INTO xera_node_policy_revisions(node_uuid,revision) VALUES(p_node,p_seen+1)
    ON CONFLICT(node_uuid) DO UPDATE SET revision=GREATEST(xera_node_policy_revisions.revision,p_seen)+1
      WHERE GREATEST(xera_node_policy_revisions.revision,p_seen)<9223372036854775807
    RETURNING revision INTO allocated;
    IF NOT FOUND THEN RAISE EXCEPTION 'node policy revision exhausted'; END IF;
    RETURN allocated;
END;
$$;

CREATE FUNCTION xera_quota_window_end(anchor_at TIMESTAMPTZ,reset_value INTEGER,reset_unit TEXT,current_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE cycles BIGINT; candidate TIMESTAMPTZ;
BEGIN
    IF reset_value=0 THEN RETURN '9999-12-31 23:59:59+00'::timestamptz; END IF;
    IF current_at<anchor_at THEN RETURN anchor_at; END IF;
    IF reset_unit='DAYS' THEN
        RETURN xera_quota_window_start(anchor_at,reset_value,reset_unit,current_at)+reset_value::bigint*86400*interval '1 second';
    END IF;
    cycles:=GREATEST(0,FLOOR(((extract(year FROM current_at AT TIME ZONE 'UTC')-extract(year FROM anchor_at AT TIME ZONE 'UTC'))*12
        +extract(month FROM current_at AT TIME ZONE 'UTC')-extract(month FROM anchor_at AT TIME ZONE 'UTC'))/reset_value)::bigint);
    candidate:=((anchor_at AT TIME ZONE 'UTC')+cycles*reset_value*interval '1 month') AT TIME ZONE 'UTC';
    IF candidate<=current_at THEN
        candidate:=((anchor_at AT TIME ZONE 'UTC')+(cycles+1)*reset_value*interval '1 month') AT TIME ZONE 'UTC';
    END IF;
    RETURN candidate;
END;
$$;

CREATE FUNCTION xera_quota_scope_window_end(p_kind TEXT,p_key TEXT,p_now TIMESTAMPTZ)
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE STRICT AS $$
    SELECT xera_quota_window_end(c.anchor,c.reset_value,c.reset_unit,p_now) FROM (
        SELECT h.traffic_limit_reset_anchor_at AS anchor,h.traffic_limit_reset_value AS reset_value,h.traffic_limit_reset_unit AS reset_unit
          FROM hosts h WHERE p_kind='HOST' AND h.uuid::text=p_key
        UNION ALL
        SELECT COALESCE(t.reset_anchor_at,'1970-01-01'::timestamptz),COALESCE(t.reset_value,0),COALESCE(t.reset_unit,'DAYS')
          FROM xera_host_tag_limits t WHERE p_kind='TAG' AND t.tag=p_key
    ) c;
$$;

-- Reservations remain allocated when a node disconnects or is deleted. An
-- unreachable node may still spend its signed-in policy; its credit is not free.
-- Manual RESET has a distinct budget epoch within the same UTC period.
-- Offline nodes retain the previous epoch until their next acknowledged policy.
-- Global user quotas use the same reserve bank as host/tag quotas, but their
-- accounting comes from user_traffic and their reset epochs are explicit. Never
-- infer a fresh global budget merely because the calendar date changed.
CREATE FUNCTION xera_user_quota_deadline(p_strategy TEXT,p_created TIMESTAMPTZ,p_now TIMESTAMPTZ)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE current_utc TIMESTAMP; candidate TIMESTAMP; month_start TIMESTAMP; first_reset TIMESTAMP; anchor_day INTEGER;
BEGIN
    current_utc:=p_now AT TIME ZONE 'UTC';
    CASE p_strategy
      WHEN 'NO_RESET' THEN RETURN '9999-12-31 23:59:59+00'::timestamptz;
      WHEN 'DAY' THEN
        candidate:=date_trunc('day',current_utc)+interval '5 minutes';
        IF candidate<=current_utc THEN candidate:=candidate+interval '1 day'; END IF;
      WHEN 'WEEK' THEN
        candidate:=date_trunc('week',current_utc)+interval '15 minutes';
        IF candidate<=current_utc THEN candidate:=candidate+interval '7 days'; END IF;
      WHEN 'MONTH' THEN
        candidate:=date_trunc('month',current_utc)+interval '20 minutes';
        IF candidate<=current_utc THEN candidate:=candidate+interval '1 month'; END IF;
      WHEN 'MONTH_ROLLING' THEN
        anchor_day:=extract(day FROM p_created AT TIME ZONE 'UTC')::integer;
        month_start:=date_trunc('month',current_utc);
        candidate:=month_start+(LEAST(anchor_day,extract(day FROM month_start+interval '1 month - 1 day')::integer)-1)*interval '1 day'+interval '10 minutes';
        IF candidate<=current_utc THEN
          month_start:=month_start+interval '1 month';
          candidate:=month_start+(LEAST(anchor_day,extract(day FROM month_start+interval '1 month - 1 day')::integer)-1)*interval '1 day'+interval '10 minutes';
        END IF;
        month_start:=date_trunc('month',p_created AT TIME ZONE 'UTC')+interval '1 month';
        first_reset:=month_start+(LEAST(anchor_day,extract(day FROM month_start+interval '1 month - 1 day')::integer)-1)*interval '1 day'+interval '10 minutes';
        candidate:=GREATEST(candidate,first_reset);
      ELSE RAISE EXCEPTION 'unknown global user quota reset strategy';
    END CASE;
    RETURN candidate AT TIME ZONE 'UTC';
END;
$$;

CREATE FUNCTION xera_quota_budget_state(p_kind TEXT,p_key TEXT,p_user BIGINT)
RETURNS TABLE(used_bytes BIGINT,base_limit BIGINT,bonus_bytes BIGINT,effective_limit BIGINT,paused BOOLEAN,window_start DATE)
LANGUAGE sql STABLE AS $$
    SELECT q.* FROM xera_limit_state(p_kind,p_key,p_user) q WHERE p_kind IN ('HOST','TAG')
    UNION ALL
    SELECT t.used_traffic_bytes,u.traffic_limit_bytes,0::bigint,u.traffic_limit_bytes,
      u.status<>'ACTIVE' OR (u.expire_at AT TIME ZONE 'UTC')<=now(),'1970-01-01'::date
    FROM users u JOIN user_traffic t ON t.id=u.id WHERE p_kind='USER' AND p_key='global' AND u.id=p_user;
$$;

CREATE FUNCTION xera_quota_budget_end(p_kind TEXT,p_key TEXT,p_user BIGINT,p_now TIMESTAMPTZ)
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE STRICT AS $$
    SELECT xera_quota_scope_window_end(p_kind,p_key,p_now) WHERE p_kind IN ('HOST','TAG')
    UNION ALL
    SELECT xera_user_quota_deadline(u.traffic_limit_strategy,u.created_at AT TIME ZONE 'UTC',p_now)
      FROM users u WHERE p_kind='USER' AND p_key='global' AND u.id=p_user;
$$;

CREATE TABLE xera_quota_budget_heads (
    kind TEXT NOT NULL CHECK(kind IN ('HOST','TAG','USER')),
    key TEXT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    window_start DATE NOT NULL,
    budget_epoch UUID NOT NULL,
    reason TEXT NOT NULL DEFAULT 'RESET' CHECK(reason IN ('RESET','ENTITLEMENT')),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(kind,key,user_id,window_start)
);
CREATE TABLE xera_quota_budget_actions (
    request_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('HOST','TAG')),
    key TEXT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK(action IN ('RESET','ADD')),
    amount_bytes BIGINT NOT NULL CHECK(amount_bytes>=0),
    window_start DATE NOT NULL,
    budget_epoch UUID NOT NULL,
    PRIMARY KEY(request_id,user_id)
);
CREATE TABLE xera_quota_node_modes (
    node_uuid UUID PRIMARY KEY,
    user_quota BOOLEAN NOT NULL DEFAULT false,
    phase TEXT NOT NULL CHECK(phase IN ('FENCING','ACTIVE')),
    instance_uuid UUID,
    fenced_revision BIGINT CHECK(fenced_revision>0),
    fenced_at TIMESTAMPTZ,
    fenced_source TEXT CHECK(fenced_source ~ '^[a-f0-9]{64}$'),
    fenced_core UUID,
    initial_core UUID,
    legacy_usage_drained_at TIMESTAMPTZ,
    initial_drained_at TIMESTAMPTZ,
    initial_drain_sequence BIGINT CHECK(initial_drain_sequence>0),
    CHECK((fenced_revision IS NULL)=(fenced_at IS NULL)),
    CHECK((fenced_revision IS NULL)=(fenced_source IS NULL)),
    CHECK((initial_drained_at IS NULL)=(initial_drain_sequence IS NULL)),
    CHECK(initial_drained_at IS NULL OR initial_core IS NOT NULL),
    CHECK(phase<>'ACTIVE' OR instance_uuid IS NOT NULL)
);
CREATE FUNCTION xera_current_quota_epoch(p_kind TEXT,p_key TEXT,p_user BIGINT,p_window DATE)
RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT budget_epoch FROM xera_quota_budget_heads
      WHERE kind=p_kind AND key=p_key AND user_id=p_user AND window_start=p_window),
      '00000000-0000-0000-0000-000000000000'::uuid);
$$;

CREATE TABLE xera_quota_reserve_pools (
    kind TEXT NOT NULL CHECK(kind IN ('HOST','TAG','USER')),
    key TEXT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    window_start DATE NOT NULL,
    budget_epoch UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    allocated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    baseline_bytes BIGINT NOT NULL CHECK(baseline_bytes >= 0),
    limit_bytes BIGINT NOT NULL CHECK(limit_bytes >= 0),
    usage_account UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    unreserved_nano NUMERIC(50,0) NOT NULL DEFAULT 0 CHECK(unreserved_nano>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(kind,key,user_id,window_start,budget_epoch)
);
-- Provenance survives a later policy, node deletion or process replacement.
-- Only an account/price actually committed for this journal instance may bill.
CREATE TABLE xera_quota_usage_deliveries (
    usage_account UUID NOT NULL REFERENCES xera_quota_reserve_pools(usage_account) ON DELETE CASCADE,
    node_uuid UUID NOT NULL,
    instance_uuid UUID NOT NULL,
    factor BIGINT NOT NULL CHECK(factor>0),
    scale BIGINT NOT NULL CHECK(scale IN (100,1000000000) AND factor<=100*scale),
    first_revision BIGINT NOT NULL CHECK(first_revision>0),
    last_revision BIGINT NOT NULL CHECK(last_revision>=first_revision),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(usage_account,node_uuid,instance_uuid,factor,scale)
);

-- Runs in the same transaction as the receipt digest and ordinary raw usage.
-- Acquire all affected scope locks before touching user_traffic (RESET uses
-- that order too). Counter metadata never increments the raw usage meter.
CREATE FUNCTION xera_account_unreserved_usage(p_node UUID,p_stream UUID,p_items JSONB)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE scope RECORD; item RECORD; pool xera_quota_reserve_pools%ROWTYPE; increment NUMERIC;
BEGIN
    IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>100000 THEN
        RAISE EXCEPTION 'invalid unreserved usage frame';
    END IF;
    IF jsonb_array_length(p_items)=0 THEN RETURN; END IF;
    IF NOT EXISTS(SELECT 1 FROM xera_node_usage_streams WHERE node_uuid=p_node AND stream_id=p_stream) THEN
        RAISE EXCEPTION 'unreserved usage journal binding differs';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_items) AS d(account UUID,owner BIGINT,factor BIGINT,scale BIGINT,bytes BIGINT)
        WHERE d.account IS NULL OR d.owner IS NULL OR d.owner<=0 OR d.factor IS NULL OR d.factor<=0 OR
            d.scale IS NULL OR d.scale NOT IN (100,1000000000) OR d.factor>100*d.scale OR d.bytes IS NULL OR d.bytes<=0) THEN
        RAISE EXCEPTION 'invalid unreserved usage record';
    END IF;
    FOR scope IN
        SELECT DISTINCT p.kind,p.key FROM jsonb_to_recordset(p_items) AS d(account UUID,owner BIGINT,factor BIGINT,scale BIGINT,bytes BIGINT)
        JOIN xera_quota_reserve_pools p ON p.usage_account=d.account AND p.user_id=d.owner
        ORDER BY p.kind,p.key
    LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(scope.kind||':'||scope.key,20261015));
    END LOOP;
    FOR item IN SELECT d.account,d.owner,d.factor,d.scale,sum(d.bytes::numeric) AS bytes
        FROM jsonb_to_recordset(p_items) AS d(account UUID,owner BIGINT,factor BIGINT,scale BIGINT,bytes BIGINT)
        GROUP BY d.account,d.owner,d.factor,d.scale ORDER BY d.account,d.owner,d.factor,d.scale
    LOOP
        IF item.owner IS NULL OR item.owner<=0 OR item.factor IS NULL OR item.factor<=0 OR
           item.scale IS NULL OR item.scale NOT IN (100,1000000000) OR item.factor>100*item.scale OR
           item.bytes IS NULL OR item.bytes<=0 THEN RAISE EXCEPTION 'invalid unreserved usage price'; END IF;
        SELECT * INTO pool FROM xera_quota_reserve_pools WHERE usage_account=item.account AND user_id=item.owner FOR UPDATE;
        IF NOT FOUND THEN
            -- User IDs are monotonic; a late receipt for a deleted owner has no
            -- surviving budget. Missing debt for a live owner requires recovery.
            IF EXISTS(SELECT 1 FROM users WHERE id=item.owner) THEN
                RAISE EXCEPTION 'unknown unreserved usage account';
            END IF;
            CONTINUE;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM xera_quota_usage_deliveries WHERE usage_account=item.account
            AND node_uuid=p_node AND instance_uuid=p_stream AND factor=item.factor AND scale=item.scale) THEN
            RAISE EXCEPTION 'unreserved usage price or node provenance differs';
        END IF;
        increment:=item.bytes*item.factor*(1000000000/item.scale);
        UPDATE xera_quota_reserve_pools SET
            baseline_bytes=baseline_bytes+ceil((unreserved_nano+increment)/1000000000)-ceil(unreserved_nano/1000000000),
            unreserved_nano=unreserved_nano+increment WHERE usage_account=item.account;
    END LOOP;
END;
$$;
CREATE TABLE xera_quota_reserves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    user_id BIGINT NOT NULL,
    window_start DATE NOT NULL,
    budget_epoch UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    node_uuid UUID NOT NULL,
    instance_uuid UUID NOT NULL,
    ceiling_bytes BIGINT NOT NULL CHECK(ceiling_bytes >= 0),
    closed_usage_bytes BIGINT CHECK(closed_usage_bytes>=0 AND closed_usage_bytes<=ceiling_bytes),
    closed_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    closed_revision BIGINT CHECK(closed_revision>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK((closed_usage_bytes IS NULL AND closed_at IS NULL AND closed_revision IS NULL)
       OR (closed_usage_bytes IS NOT NULL AND closed_at IS NOT NULL AND closed_revision IS NOT NULL)),
    FOREIGN KEY(kind,key,user_id,window_start,budget_epoch)
      REFERENCES xera_quota_reserve_pools(kind,key,user_id,window_start,budget_epoch) ON DELETE CASCADE
);
CREATE INDEX xera_quota_reserves_node ON xera_quota_reserves(node_uuid,window_start);
CREATE UNIQUE INDEX xera_quota_reserves_active ON xera_quota_reserves(kind,key,user_id,window_start,budget_epoch,node_uuid)
  WHERE closed_usage_bytes IS NULL AND retired_at IS NULL;
CREATE TABLE xera_quota_reserve_operations (
    id UUID PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('HOST','TAG','USER')),
    key TEXT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    window_start DATE NOT NULL,
    budget_epoch UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    roster UUID[] NOT NULL,
    instances JSONB NOT NULL,
    granted_bytes BIGINT NOT NULL CHECK(granted_bytes>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(kind,key,user_id,window_start,budget_epoch)
      REFERENCES xera_quota_reserve_pools(kind,key,user_id,window_start,budget_epoch) ON DELETE CASCADE
);

-- Preparing a new policy and observing its live-core ACK are different events.
-- Keep progress in SQL so a restarted panel can show and resume pending resets.
CREATE TABLE xera_quota_node_epochs (
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    user_id BIGINT NOT NULL,
    window_start DATE NOT NULL,
    node_uuid UUID NOT NULL,
    instance_uuid UUID NOT NULL,
    desired_epoch UUID NOT NULL,
    desired_revision BIGINT NOT NULL CHECK(desired_revision>0),
    applied_epoch UUID,
    applied_revision BIGINT CHECK(applied_revision>0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK((applied_epoch IS NULL)=(applied_revision IS NULL)),
    CHECK(applied_revision IS NULL OR applied_revision<=desired_revision),
    PRIMARY KEY(kind,key,user_id,window_start,node_uuid),
    FOREIGN KEY(kind,key,user_id,window_start,desired_epoch)
      REFERENCES xera_quota_reserve_pools(kind,key,user_id,window_start,budget_epoch) ON DELETE CASCADE
);
CREATE INDEX xera_quota_node_epochs_pending ON xera_quota_node_epochs(node_uuid)
  WHERE applied_epoch IS DISTINCT FROM desired_epoch;

-- Called in the same transaction as xera_limit_user_adjustments. No HTTP and no
-- wait for disconnected nodes. Previous epochs remain encumbered separately.
CREATE FUNCTION xera_adjust_quota_budget(
    p_request UUID,p_kind TEXT,p_key TEXT,p_user BIGINT,p_action TEXT,p_amount BIGINT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    meter RECORD;
    pool xera_quota_reserve_pools%ROWTYPE;
    previous xera_quota_budget_actions%ROWTYPE;
    epoch UUID;
    boundary TIMESTAMPTZ;
BEGIN
    IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN ('HOST','TAG')
       OR p_key IS NULL OR length(p_key)>200 OR p_user IS NULL
       OR p_action IS NULL OR p_action NOT IN ('RESET','ADD') OR p_amount IS NULL
       OR p_amount<0 OR (p_action='RESET' AND p_amount<>0) THEN
        RAISE EXCEPTION 'invalid quota budget adjustment';
    END IF;
    -- Same ordering as redistribution: global operation lock, then scope.
    -- A bulk RESET must not retain one shared-memory advisory lock per user.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,20261017));
    PERFORM pg_advisory_xact_lock(hashtextextended(p_kind||':'||p_key,20261015));
    SELECT * INTO previous FROM xera_quota_budget_actions WHERE request_id=p_request AND user_id=p_user;
    IF FOUND THEN
        IF previous.kind<>p_kind OR previous.key<>p_key OR previous.action<>p_action OR previous.amount_bytes<>p_amount THEN
            RAISE EXCEPTION 'quota adjustment ID reused for different content';
        END IF;
        RETURN previous.budget_epoch;
    END IF;
    SELECT * INTO meter FROM xera_limit_state(p_kind,p_key,p_user);
    IF NOT FOUND THEN RAISE EXCEPTION 'quota scope does not exist'; END IF;
    epoch:=xera_current_quota_epoch(p_kind,p_key,p_user,meter.window_start);
    SELECT * INTO pool FROM xera_quota_reserve_pools p WHERE p.kind=p_kind AND p.key=p_key
      AND p.user_id=p_user AND p.window_start=meter.window_start AND p.budget_epoch=epoch FOR UPDATE;
    -- Legacy-only scopes still use their meter reset baseline. Creating a bank
    -- before the initial fence would forget legacy traffic after this action.
    IF FOUND THEN
        IF p_action='RESET' THEN
            boundary:=xera_quota_scope_window_end(p_kind,p_key,now());
            IF boundary IS NULL OR boundary<=now() THEN RAISE EXCEPTION 'invalid quota reset period'; END IF;
            epoch:=gen_random_uuid();
            INSERT INTO xera_quota_reserve_pools(kind,key,user_id,window_start,budget_epoch,expires_at,baseline_bytes,limit_bytes)
              VALUES(p_kind,p_key,p_user,meter.window_start,epoch,boundary,0,meter.effective_limit);
            INSERT INTO xera_quota_budget_heads(kind,key,user_id,window_start,budget_epoch)
              VALUES(p_kind,p_key,p_user,meter.window_start,epoch)
              ON CONFLICT(kind,key,user_id,window_start) DO UPDATE SET budget_epoch=excluded.budget_epoch,
                reason='RESET',changed_at=clock_timestamp();
        ELSE
            -- ADD preserves existing grant IDs; a later redistribution may issue
            -- only this newly authorized credit and previously sealed refunds.
            UPDATE xera_quota_reserve_pools SET limit_bytes=limit_bytes+p_amount
              WHERE kind=p_kind AND key=p_key AND user_id=p_user AND window_start=meter.window_start AND budget_epoch=epoch;
        END IF;
    END IF;
    INSERT INTO xera_quota_budget_actions(request_id,kind,key,user_id,action,amount_bytes,window_start,budget_epoch)
      VALUES(p_request,p_kind,p_key,p_user,p_action,p_amount,meter.window_start,epoch);
    RETURN epoch;
END;
$$;

CREATE FUNCTION xera_ack_quota_epoch(p_node UUID,p_instance UUID,p_revision BIGINT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE acknowledged INTEGER;
BEGIN
    IF p_revision IS NULL OR p_revision<=0 OR NOT EXISTS(
      SELECT 1 FROM xera_node_policy_revisions WHERE node_uuid=p_node AND revision>=p_revision
    ) THEN RAISE EXCEPTION 'quota acknowledgement revision is not committed'; END IF;
    -- A late ACK must never mark a newer desired reset as applied.
    UPDATE xera_quota_node_epochs SET applied_epoch=desired_epoch,applied_revision=p_revision,updated_at=now()
      WHERE node_uuid=p_node AND instance_uuid=p_instance AND desired_revision=p_revision;
    GET DIAGNOSTICS acknowledged=ROW_COUNT;
    RETURN acknowledged;
END;
$$;

-- p_debt is the conservative, fenced pre-reservation node usage not yet known
-- to the SQL meter. The caller must fence every eligible node before allocating.
-- This function performs no network IO. Its transaction must COMMIT before send.
CREATE FUNCTION xera_allocate_quota_reserves(
    p_kind TEXT,p_key TEXT,p_user BIGINT,p_nodes UUID[],p_debt BIGINT,p_instances JSONB
) RETURNS TABLE(id UUID,node_uuid UUID,instance_uuid UUID,ceiling_bytes BIGINT,expires_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE
    meter RECORD;
    pool xera_quota_reserve_pools%ROWTYPE;
    roster UUID[];
    budget BIGINT;
    n INTEGER;
    boundary TIMESTAMPTZ;
    epoch UUID;
BEGIN
    IF p_kind IS NULL OR p_kind NOT IN ('HOST','TAG','USER') OR p_key IS NULL OR length(p_key)>200 OR p_debt<0 OR p_debt IS NULL
       OR (p_kind='USER' AND p_key<>'global') THEN
        RAISE EXCEPTION 'invalid quota reservation boundary';
    END IF;
    SELECT array_agg(v ORDER BY v) INTO roster FROM (SELECT DISTINCT unnest(p_nodes) v) r WHERE v IS NOT NULL;
    n:=COALESCE(cardinality(roster),0);
    IF n=0 OR n>10000 THEN RAISE EXCEPTION 'invalid quota reservation roster'; END IF;
    IF jsonb_typeof(p_instances) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid quota instance map'; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_instances))<>n OR EXISTS(
      SELECT 1 FROM unnest(roster) v WHERE NOT COALESCE((p_instances->>v::text) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',false)
    ) THEN RAISE EXCEPTION 'invalid quota instance binding'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_kind||':'||p_key,20261015));
    SELECT * INTO meter FROM xera_quota_budget_state(p_kind,p_key,p_user);
    IF NOT FOUND THEN RAISE EXCEPTION 'quota scope does not exist'; END IF;
    IF meter.used_bytes<0 OR meter.effective_limit<0 THEN RAISE EXCEPTION 'invalid quota meter'; END IF;
    IF meter.paused OR meter.effective_limit<=0 THEN RETURN; END IF;
    IF p_kind='USER' AND EXISTS(
      SELECT 1 FROM unnest(roster) v LEFT JOIN xera_quota_node_modes m ON m.node_uuid=v
      WHERE m.instance_uuid IS DISTINCT FROM (p_instances->>v::text)::uuid OR m.initial_drained_at IS NULL OR NOT m.user_quota
        OR m.legacy_usage_drained_at IS NULL OR m.legacy_usage_drained_at>m.initial_drained_at
        OR EXISTS(SELECT 1 FROM xera_legacy_usage_jobs j WHERE NOT j.applied)
        OR EXISTS(SELECT 1 FROM xera_legacy_usage_streams l WHERE l.node_uuid=v
          AND (l.requested_at IS NOT NULL OR l.uncertain_since IS NOT NULL))
    ) THEN RAISE EXCEPTION 'initial global user debt is not proven for every reserve participant'; END IF;
    boundary:=xera_quota_budget_end(p_kind,p_key,p_user,now());
    epoch:=xera_current_quota_epoch(p_kind,p_key,p_user,meter.window_start);
    IF boundary IS NULL OR boundary<=now() THEN RAISE EXCEPTION 'invalid quota period'; END IF;
    SELECT * INTO pool FROM xera_quota_reserve_pools p
      WHERE p.kind=p_kind AND p.key=p_key AND p.user_id=p_user AND p.window_start=meter.window_start AND p.budget_epoch=epoch;
    IF NOT FOUND THEN
        -- Numeric arithmetic prevents overflow at BIGINT limits. Reserving a byte
        -- cannot be rolled back simply because an HTTP acknowledgement was lost.
        budget:=GREATEST(meter.effective_limit::numeric-meter.used_bytes-p_debt,0)::bigint;
        INSERT INTO xera_quota_reserve_pools(kind,key,user_id,window_start,budget_epoch,expires_at,baseline_bytes,limit_bytes)
          VALUES(p_kind,p_key,p_user,meter.window_start,epoch,boundary,
                 LEAST(meter.used_bytes::numeric+p_debt,9223372036854775807)::bigint,meter.effective_limit)
          RETURNING * INTO pool;
    END IF;
    IF pool.allocated_at IS NULL THEN
        budget:=GREATEST(pool.limit_bytes::numeric-pool.baseline_bytes,0)::bigint;
        INSERT INTO xera_quota_reserves(kind,key,user_id,window_start,budget_epoch,node_uuid,instance_uuid,ceiling_bytes)
          SELECT p_kind,p_key,p_user,meter.window_start,epoch,v,(p_instances->>v::text)::uuid,
                 budget/n+CASE WHEN ord<=mod(budget,n) THEN 1 ELSE 0 END
          FROM unnest(roster) WITH ORDINALITY r(v,ord);
        UPDATE xera_quota_reserve_pools SET allocated_at=now() WHERE kind=p_kind AND key=p_key
          AND user_id=p_user AND window_start=meter.window_start AND budget_epoch=epoch;
    END IF;
    -- Retry returns exactly the committed grant IDs and ceilings. New membership,
    -- reset, or larger limits never implicitly reclaim another node's grant.
    IF EXISTS(SELECT 1 FROM xera_quota_reserves g WHERE g.kind=p_kind AND g.key=p_key AND g.user_id=p_user AND g.window_start=meter.window_start AND g.budget_epoch=epoch
      AND g.closed_usage_bytes IS NULL AND g.retired_at IS NULL AND g.node_uuid=ANY(roster) AND g.instance_uuid<>(p_instances->>g.node_uuid::text)::uuid)
    THEN RAISE EXCEPTION 'quota node state identity changed; recover its existing reservation'; END IF;
    RETURN QUERY SELECT g.id,g.node_uuid,g.instance_uuid,g.ceiling_bytes,p.expires_at
      FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
      WHERE g.kind=p_kind AND g.key=p_key AND g.user_id=p_user AND g.window_start=meter.window_start AND g.budget_epoch=epoch
        AND g.closed_usage_bytes IS NULL AND g.retired_at IS NULL;
END;
$$;

-- Redistribute only credit proved unused by a sealed node journal. Active
-- grants keep their entire ceiling, including disconnected or deleted nodes.
-- This function never changes the pool's budget or the SQL meter's baseline.
CREATE FUNCTION xera_redistribute_quota_reserves(
    p_operation UUID,p_kind TEXT,p_key TEXT,p_user BIGINT,p_nodes UUID[],p_instances JSONB
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    pool xera_quota_reserve_pools%ROWTYPE;
    operation_row xera_quota_reserve_operations%ROWTYPE;
    meter RECORD;
    participant RECORD;
    active_grant xera_quota_reserves%ROWTYPE;
    roster UUID[];
    n INTEGER;
    committed NUMERIC;
    available BIGINT;
    allocation_bytes BIGINT;
    epoch UUID;
BEGIN
    IF p_operation IS NULL OR p_kind IS NULL OR p_kind NOT IN ('HOST','TAG','USER') OR p_key IS NULL OR length(p_key)>200
       OR (p_kind='USER' AND p_key<>'global') THEN
        RAISE EXCEPTION 'invalid quota redistribution boundary';
    END IF;
    SELECT array_agg(v ORDER BY v) INTO roster FROM (SELECT DISTINCT unnest(p_nodes) v) r WHERE v IS NOT NULL;
    n:=COALESCE(cardinality(roster),0);
    IF n=0 OR n>10000 OR jsonb_typeof(p_instances) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'invalid quota redistribution roster';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_instances))<>n OR EXISTS(
      SELECT 1 FROM unnest(roster) v WHERE NOT COALESCE((p_instances->>v::text) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',false)
    ) THEN RAISE EXCEPTION 'invalid quota instance binding'; END IF;
    -- A request ID is global, not scoped: racing calls cannot reinterpret it
    -- for another owner or another group after acquiring different pool locks.
    IF p_kind='USER' AND EXISTS(
      SELECT 1 FROM unnest(roster) v LEFT JOIN xera_quota_node_modes m ON m.node_uuid=v
      WHERE m.instance_uuid IS DISTINCT FROM (p_instances->>v::text)::uuid OR m.initial_drained_at IS NULL OR NOT m.user_quota
        OR m.legacy_usage_drained_at IS NULL OR m.legacy_usage_drained_at>m.initial_drained_at
        OR EXISTS(SELECT 1 FROM xera_legacy_usage_jobs j WHERE NOT j.applied)
        OR EXISTS(SELECT 1 FROM xera_legacy_usage_streams l WHERE l.node_uuid=v
          AND (l.requested_at IS NOT NULL OR l.uncertain_since IS NOT NULL))
    ) THEN RAISE EXCEPTION 'initial global user debt is not proven for every reserve participant'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text,20261017));
    PERFORM pg_advisory_xact_lock(hashtextextended(p_kind||':'||p_key,20261015));
    SELECT * INTO meter FROM xera_quota_budget_state(p_kind,p_key,p_user);
    IF NOT FOUND THEN RAISE EXCEPTION 'quota scope does not exist'; END IF;
    SELECT * INTO operation_row FROM xera_quota_reserve_operations WHERE id=p_operation;
    IF FOUND THEN
        IF operation_row.kind<>p_kind OR operation_row.key<>p_key OR operation_row.user_id<>p_user
           OR operation_row.roster<>roster OR operation_row.instances<>p_instances
        THEN RAISE EXCEPTION 'quota operation ID reused for different content'; END IF;
        RETURN operation_row.granted_bytes;
    END IF;
    epoch:=xera_current_quota_epoch(p_kind,p_key,p_user,meter.window_start);
    SELECT * INTO pool FROM xera_quota_reserve_pools p WHERE p.kind=p_kind AND p.key=p_key
      AND p.user_id=p_user AND p.window_start=meter.window_start AND p.budget_epoch=epoch FOR UPDATE;
    IF NOT FOUND OR pool.allocated_at IS NULL OR pool.expires_at<=now() OR meter.paused OR meter.effective_limit<=0 THEN
        RAISE EXCEPTION 'quota pool is unavailable for redistribution';
    END IF;
    SELECT COALESCE(sum(CASE WHEN g.closed_usage_bytes IS NULL THEN g.ceiling_bytes ELSE g.closed_usage_bytes END),0)
      INTO committed FROM xera_quota_reserves g WHERE g.kind=p_kind AND g.key=p_key AND g.user_id=p_user AND g.window_start=pool.window_start AND g.budget_epoch=epoch;
    available:=GREATEST(pool.limit_bytes::numeric-pool.baseline_bytes-committed,0)::bigint;
    FOR participant IN SELECT v AS node,ord FROM unnest(roster) WITH ORDINALITY r(v,ord) LOOP
        allocation_bytes:=available/n+CASE WHEN participant.ord<=mod(available,n) THEN 1 ELSE 0 END;
        SELECT * INTO active_grant FROM xera_quota_reserves g WHERE g.kind=p_kind AND g.key=p_key AND g.user_id=p_user
          AND g.window_start=pool.window_start AND g.budget_epoch=epoch AND g.node_uuid=participant.node AND g.closed_usage_bytes IS NULL AND g.retired_at IS NULL FOR UPDATE;
        IF FOUND THEN
            IF active_grant.instance_uuid<>(p_instances->>participant.node::text)::uuid THEN
                RAISE EXCEPTION 'quota node state identity changed; recover its existing reservation';
            END IF;
            IF allocation_bytes>0 THEN UPDATE xera_quota_reserves SET ceiling_bytes=ceiling_bytes+allocation_bytes WHERE id=active_grant.id; END IF;
        ELSIF allocation_bytes>0 THEN
            INSERT INTO xera_quota_reserves(kind,key,user_id,window_start,budget_epoch,node_uuid,instance_uuid,ceiling_bytes)
              VALUES(p_kind,p_key,p_user,pool.window_start,epoch,participant.node,(p_instances->>participant.node::text)::uuid,allocation_bytes);
        END IF;
    END LOOP;
    INSERT INTO xera_quota_reserve_operations(id,kind,key,user_id,window_start,budget_epoch,roster,instances,granted_bytes)
      VALUES(p_operation,p_kind,p_key,p_user,pool.window_start,epoch,roster,p_instances,available);
    RETURN available;
END;
$$;

-- A live core first removes the grant from its policy and durably seals its
-- journal entry. Only that closed record can settle unused credit; a missing
-- record, disconnected node or a lower counter is never evidence of a refund.
CREATE FUNCTION xera_settle_quota_reserve(
    p_id UUID,p_node UUID,p_instance UUID,p_group TEXT,p_user BIGINT,
    p_ceiling BIGINT,p_expiry TIMESTAMPTZ,p_used BIGINT,p_revision BIGINT
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE grant_row xera_quota_reserves%ROWTYPE; expected_group TEXT;
BEGIN
    IF p_used IS NULL OR p_used<0 OR p_ceiling IS NULL OR p_used>p_ceiling OR p_revision IS NULL OR p_revision<=0 THEN
        RAISE EXCEPTION 'invalid closed quota report';
    END IF;
    SELECT * INTO grant_row FROM xera_quota_reserves WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'unknown quota reservation; do not assume zero usage'; END IF;
    expected_group:=CASE WHEN grant_row.kind='HOST' THEN 'host:' WHEN grant_row.kind='USER' THEN 'user:' ELSE 'tag:' END||grant_row.key;
    IF grant_row.node_uuid IS DISTINCT FROM p_node OR grant_row.instance_uuid IS DISTINCT FROM p_instance
       OR grant_row.user_id IS DISTINCT FROM p_user OR expected_group IS DISTINCT FROM p_group
       OR p_ceiling>grant_row.ceiling_bytes
       OR NOT EXISTS(SELECT 1 FROM xera_quota_reserve_pools p WHERE p.kind=grant_row.kind AND p.key=grant_row.key
          AND p.user_id=grant_row.user_id AND p.window_start=grant_row.window_start AND p.budget_epoch=grant_row.budget_epoch AND p.expires_at=p_expiry)
    THEN RAISE EXCEPTION 'closed quota report binding mismatch'; END IF;
    IF NOT EXISTS(SELECT 1 FROM xera_node_policy_revisions n WHERE n.node_uuid=p_node AND n.revision>=p_revision) THEN
        RAISE EXCEPTION 'closed quota report revision is not committed';
    END IF;
    IF grant_row.closed_usage_bytes IS NOT NULL THEN
        IF grant_row.closed_usage_bytes<>p_used OR p_revision<grant_row.closed_revision THEN
            RAISE EXCEPTION 'closed quota report changed after settlement';
        END IF;
        RETURN grant_row.ceiling_bytes-grant_row.closed_usage_bytes;
    END IF;
    UPDATE xera_quota_reserves SET closed_usage_bytes=p_used,closed_at=now(),closed_revision=p_revision WHERE id=p_id;
    RETURN grant_row.ceiling_bytes-p_used;
END;
$$;

-- Single, bulk and scheduled resets update this field in their traffic
-- transaction. Rotate an already-managed user's epoch even if no usage has
-- reached SQL yet. An offline old grant remains allocated in its old epoch.
CREATE FUNCTION xera_user_quota_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE epoch UUID;
BEGIN
    IF OLD.last_traffic_reset_at IS NOT DISTINCT FROM NEW.last_traffic_reset_at
       AND OLD.traffic_limit_bytes=NEW.traffic_limit_bytes THEN RETURN NEW; END IF;
    IF NOT EXISTS(SELECT 1 FROM xera_quota_reserve_pools WHERE kind='USER' AND key='global' AND user_id=NEW.id)
       THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('USER:global',20261015));
    IF OLD.last_traffic_reset_at IS DISTINCT FROM NEW.last_traffic_reset_at
       OR (OLD.traffic_limit_bytes=0)<>(NEW.traffic_limit_bytes=0) THEN
        epoch:=gen_random_uuid();
        INSERT INTO xera_quota_budget_heads(kind,key,user_id,window_start,budget_epoch,reason)
          VALUES('USER','global',NEW.id,'1970-01-01',epoch,
            CASE WHEN OLD.last_traffic_reset_at IS DISTINCT FROM NEW.last_traffic_reset_at THEN 'RESET' ELSE 'ENTITLEMENT' END)
          ON CONFLICT(kind,key,user_id,window_start) DO UPDATE SET budget_epoch=excluded.budget_epoch,
            reason=excluded.reason,changed_at=clock_timestamp();
    ELSE
        epoch:=xera_current_quota_epoch('USER','global',NEW.id,'1970-01-01');
        UPDATE xera_quota_reserve_pools SET limit_bytes=NEW.traffic_limit_bytes
          WHERE kind='USER' AND key='global' AND user_id=NEW.id AND window_start='1970-01-01' AND budget_epoch=epoch;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_user_quota_changed AFTER UPDATE OF last_traffic_reset_at,traffic_limit_bytes ON users
  FOR EACH ROW EXECUTE FUNCTION xera_user_quota_changed();

-- Node identity is historical billing provenance, not ownership of the user's
-- debt. Deleting a node must not erase quota usage or its replay receipts.
-- Keep its numeric ID as a tombstone; IDs are not reassigned on node creation.
ALTER TABLE xera_host_quota_usage DROP CONSTRAINT xera_host_quota_usage_node_id_fkey;
ALTER TABLE xera_legacy_tag_quota_usage DROP CONSTRAINT xera_legacy_tag_quota_usage_node_id_fkey;
ALTER TABLE xera_quota_usage DROP CONSTRAINT xera_quota_usage_node_id_fkey;
ALTER TABLE xera_host_usage_receipts DROP CONSTRAINT xera_host_usage_receipts_node_id_fkey;

-- One durable in-flight statistics frame per node incarnation. This bounded
-- high-water mark replaces an ever-growing table of ten-second receipts.
-- The frame is acknowledged remotely only after every billing effect commits.
CREATE TABLE xera_node_usage_streams (
    stream_id UUID PRIMARY KEY,
    node_uuid UUID NOT NULL UNIQUE,
    node_id BIGINT NOT NULL,
    next_sequence BIGINT NOT NULL DEFAULT 1 CHECK(next_sequence>0),
    expected_core UUID,
    requested_at TIMESTAMPTZ,
    consumption_multiplier BIGINT CHECK(consumption_multiplier>=0),
    committed_digest TEXT CHECK(committed_digest ~ '^[a-f0-9]{64}$'),
    pending_effects JSONB,
    last_core UUID,
    last_requested_at TIMESTAMPTZ,
    last_captured_at TIMESTAMPTZ,
    last_committed_at TIMESTAMPTZ,
    last_committed_sequence BIGINT NOT NULL DEFAULT 0 CHECK(last_committed_sequence>=0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK((expected_core IS NULL)=(requested_at IS NULL)),
    CHECK((expected_core IS NULL)=(consumption_multiplier IS NULL)),
    CHECK(committed_digest IS NULL OR expected_core IS NOT NULL),
    CHECK(pending_effects IS NULL OR committed_digest IS NOT NULL),
    CHECK(last_committed_sequence<=next_sequence)
);

-- Legacy cores cannot replay a destructive stats read. Keep the one known
-- response until SQL billing and its outbox commit, and retain an explicit
-- uncertainty marker for any response lost between reset and persistence.
-- Collection may continue; such a marker never proves safe reserve cutover.
CREATE TABLE xera_legacy_usage_streams (
    stream_id UUID PRIMARY KEY,
    node_uuid UUID NOT NULL UNIQUE,
    node_id BIGINT NOT NULL,
    next_sequence BIGINT NOT NULL DEFAULT 1 CHECK(next_sequence>0),
    requested_at TIMESTAMPTZ,
    consumption_multiplier BIGINT CHECK(consumption_multiplier>=0),
    payload JSONB CHECK(payload IS NULL OR octet_length(payload::text)<=8388608),
    applied BOOLEAN NOT NULL DEFAULT false,
    pending_effects JSONB,
    uncertain_since TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK((requested_at IS NULL)=(consumption_multiplier IS NULL)),
    CHECK(payload IS NULL OR requested_at IS NOT NULL),
    CHECK(NOT applied OR payload IS NOT NULL),
    CHECK(pending_effects IS NULL OR applied)
);

-- Only the finite queue left by older panel versions uses these receipts.
-- New collection bills SQL directly, without enqueueing monetary increments.
CREATE TABLE xera_legacy_usage_jobs (
    receipt TEXT PRIMARY KEY CHECK(receipt ~ '^[a-f0-9]{64}$'),
    digest TEXT NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
    payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='array' AND octet_length(payload::text)<=262144),
    applied BOOLEAN NOT NULL DEFAULT false,
    pending_users JSONB,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK(pending_users IS NULL OR applied)
);


-- Retirement stops future delivery but is not a refund or a fabricated closure.
-- Its full ceiling stays committed until a real sealed journal settles it.
CREATE FUNCTION xera_retire_quota_reserve(p_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE item xera_quota_reserves%ROWTYPE;
BEGIN
    SELECT * INTO item FROM xera_quota_reserves WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'unknown quota reservation'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(item.kind||':'||item.key,20261015));
    UPDATE xera_quota_reserves SET retired_at=COALESCE(retired_at,clock_timestamp()) WHERE id=p_id;
    RETURN true;
END;
$$;

CREATE TABLE xera_quota_coordinator (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1),
    phase TEXT NOT NULL DEFAULT 'PREFLIGHT' CHECK(phase IN ('PREFLIGHT','FENCING','DRAINING','ALLOCATING','ACTIVE','RECOVERY')),
    generation UUID NOT NULL DEFAULT gen_random_uuid(),
    roster UUID[] NOT NULL DEFAULT '{}',
    lease_owner UUID,
    lease_until TIMESTAMPTZ,
    error_code TEXT CHECK(length(error_code)<=100),
    allocation_cursor BIGINT NOT NULL DEFAULT 0 CHECK(allocation_cursor>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE xera_quota_node_progress (
    node_uuid UUID PRIMARY KEY,
    generation UUID NOT NULL,
    stage TEXT NOT NULL CHECK(stage IN ('PREFLIGHT','READY','FENCED','BOOTSTRAPPED','ACTIVE','RECOVERY')),
    connection_hash TEXT CHECK(connection_hash ~ '^[a-f0-9]{64}$'),
    observed_core UUID,
    observed_instance UUID,
    error_code TEXT CHECK(length(error_code)<=100),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One resumable current transition per owner/scope, not a polling history.
-- Participant rows deliberately outlive deletion/detachment of a node: a cached
-- public listener does not stop merely because its panel row was removed.
CREATE TABLE xera_quota_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL CHECK(kind IN ('USER','HOST','TAG')),
    key TEXT NOT NULL CHECK(length(key) BETWEEN 1 AND 200),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    generation UUID NOT NULL DEFAULT gen_random_uuid(),
    source TEXT NOT NULL CHECK(source ~ '^[a-f0-9]{64}$'),
    phase TEXT NOT NULL CHECK(phase IN ('PREFLIGHT','FENCING','DRAINING','SETTLING','FUNDING','RELEASING','ACTIVE','RECOVERY')),
    finite BOOLEAN NOT NULL,
    limit_bytes BIGINT NOT NULL CHECK(limit_bytes>=0),
    window_start DATE NOT NULL,
    budget_epoch UUID NOT NULL,
    desired_nodes UUID[] NOT NULL CHECK(cardinality(desired_nodes)<=10000),
    checked_at TIMESTAMPTZ,
    error_code TEXT CHECK(length(error_code)<=100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(kind,key,user_id)
);
CREATE TABLE xera_quota_transition_nodes (
    transition_id UUID NOT NULL REFERENCES xera_quota_transitions(id) ON DELETE CASCADE,
    node_uuid UUID NOT NULL,
    required BOOLEAN NOT NULL,
    hold_barrier BOOLEAN NOT NULL DEFAULT false,
    initial_core UUID,
    instance_uuid UUID,
    preflight_at TIMESTAMPTZ,
    fenced_core UUID,
    fenced_revision BIGINT CHECK(fenced_revision>0),
    fenced_at TIMESTAMPTZ,
    drained_at TIMESTAMPTZ,
    release_ready BOOLEAN NOT NULL DEFAULT false,
    released_at TIMESTAMPTZ,
    error_code TEXT CHECK(length(error_code)<=100),
    PRIMARY KEY(transition_id,node_uuid)
);
CREATE INDEX xera_quota_transition_pending_nodes ON xera_quota_transition_nodes(node_uuid,transition_id);
ALTER TABLE xera_quota_node_modes
    ADD COLUMN applied_source TEXT CHECK(applied_source ~ '^[a-f0-9]{64}$'),
    ADD COLUMN applied_core UUID,
    ADD COLUMN applied_revision BIGINT CHECK(applied_revision>0),
    ADD COLUMN applied_at TIMESTAMPTZ,
    ADD COLUMN desired_policy JSONB CHECK(jsonb_typeof(desired_policy)='object'),
    ADD COLUMN desired_source TEXT CHECK(desired_source ~ '^[a-f0-9]{64}$'),
    ADD COLUMN desired_revision BIGINT CHECK(desired_revision>0),
    ADD COLUMN applied_policy JSONB CHECK(jsonb_typeof(applied_policy)='object');

-- A server-side loop holds numeric-node locks in a deterministic order without
-- thousands of network round trips during the global legacy-queue barrier.
CREATE FUNCTION xera_lock_usage_nodes(p_ids BIGINT[]) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE item BIGINT;
BEGIN
    IF cardinality(p_ids)>10000 THEN RAISE EXCEPTION 'quota roster exceeds limit'; END IF;
    FOR item IN SELECT DISTINCT unnest(p_ids) AS id ORDER BY id LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(item::text,20261016));
    END LOOP;
END;
$$;

-- Run a bounded server-side batch rather than one network round trip per user.
-- This helper uses the same allocation/redistribution invariants as manual work.
CREATE FUNCTION xera_fund_quota_targets(p_targets JSONB) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE item JSONB; recipients UUID[]; identities JSONB; scope_kind TEXT; scope_key TEXT; owner_id BIGINT;
    meter RECORD; pool xera_quota_reserve_pools%ROWTYPE; committed NUMERIC; count_done INTEGER:=0;
BEGIN
    IF jsonb_typeof(p_targets) IS DISTINCT FROM 'array' OR jsonb_array_length(p_targets)>500
       OR octet_length(p_targets::text)>16777216 THEN RAISE EXCEPTION 'invalid quota funding batch'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_targets) ORDER BY value->>'kind',value->>'key',(value->>'owner')::bigint LOOP
        scope_kind:=item->>'kind'; scope_key:=item->>'key'; owner_id:=(item->>'owner')::bigint;
        SELECT array_agg(value::uuid ORDER BY value) INTO recipients FROM jsonb_array_elements_text(item->'nodes');
        identities:=item->'instances';
        PERFORM pg_advisory_xact_lock(hashtextextended(scope_kind||':'||scope_key,20261015));
        IF EXISTS(SELECT 1 FROM xera_quota_transitions t WHERE t.kind=scope_kind AND t.key=scope_key AND t.user_id=owner_id
            AND t.phase<>'ACTIVE' AND (t.phase NOT IN ('FUNDING','RELEASING') OR EXISTS(
                SELECT 1 FROM unnest(recipients) n(node_uuid) LEFT JOIN xera_quota_transition_nodes p
                  ON p.transition_id=t.id AND p.node_uuid=n.node_uuid WHERE p.drained_at IS NULL))) THEN
            RAISE EXCEPTION 'quota owner transition is not ready for funding';
        END IF;
        PERFORM 1 FROM xera_allocate_quota_reserves(scope_kind,scope_key,owner_id,recipients,0,identities);
        SELECT * INTO meter FROM xera_quota_budget_state(scope_kind,scope_key,owner_id);
        IF NOT FOUND OR meter.paused OR meter.effective_limit<=0 THEN CONTINUE; END IF;
        SELECT * INTO pool FROM xera_quota_reserve_pools p WHERE p.kind=scope_kind AND p.key=scope_key
          AND p.user_id=owner_id AND p.window_start=meter.window_start
          AND p.budget_epoch=xera_current_quota_epoch(scope_kind,scope_key,owner_id,meter.window_start) FOR UPDATE;
        IF NOT FOUND OR pool.expires_at<=now() THEN CONTINUE; END IF;
        UPDATE xera_quota_reserve_pools SET limit_bytes=meter.effective_limit WHERE kind=scope_kind AND key=scope_key
          AND user_id=owner_id AND window_start=pool.window_start AND budget_epoch=pool.budget_epoch;
        SELECT COALESCE(sum(CASE WHEN g.closed_usage_bytes IS NULL THEN g.ceiling_bytes ELSE g.closed_usage_bytes END),0)
          INTO committed FROM xera_quota_reserves g WHERE g.kind=scope_kind AND g.key=scope_key
          AND g.user_id=owner_id AND g.window_start=pool.window_start AND g.budget_epoch=pool.budget_epoch;
        IF meter.effective_limit::numeric-pool.baseline_bytes-committed>0 THEN
            PERFORM xera_redistribute_quota_reserves(gen_random_uuid(),scope_kind,scope_key,owner_id,recipients,identities);
        END IF;
        count_done:=count_done+1;
    END LOOP;
    RETURN count_done;
END;
$$;
