-- Potential RAM debt is not an applied-policy cache. Keep each exposed process
-- until a receipt prepared after its own admission barrier commits its counters.
-- No node/user FK: deletion cannot erase a monetary liability.
CREATE TABLE xera_quota_usage_exposures (
    node_uuid UUID NOT NULL,
    core_uuid UUID NOT NULL,
    instance_uuid UUID NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('USER','HOST','TAG')),
    key TEXT NOT NULL CHECK(length(key) BETWEEN 1 AND 200),
    user_id BIGINT NOT NULL CHECK(user_id>0),
    first_revision BIGINT NOT NULL CHECK(first_revision>0),
    last_revision BIGINT NOT NULL CHECK(last_revision>=first_revision),
    unbounded BOOLEAN NOT NULL,
    exposed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    fenced_at TIMESTAMPTZ,
    fenced_sequence BIGINT CHECK(fenced_sequence>0),
    PRIMARY KEY(node_uuid,core_uuid,instance_uuid,kind,key,user_id),
    CHECK(kind<>'USER' OR key='global'),
    CHECK((fenced_at IS NULL)=(fenced_sequence IS NULL))
);
CREATE INDEX xera_quota_usage_exposure_scope ON xera_quota_usage_exposures(kind,key,user_id);

CREATE FUNCTION xera_record_quota_exposure_intent(p_node UUID,p_core UUID,p_instance UUID,p_revision BIGINT,p_proof JSONB)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE affected INTEGER;
BEGIN
    IF p_node IS NULL OR p_revision IS NULL OR p_revision<=0 OR p_proof->>'version' IS DISTINCT FROM '1'
       OR jsonb_typeof(p_proof->'scopes') IS DISTINCT FROM 'object' OR octet_length(p_proof::text)>33554432 THEN
        RAISE EXCEPTION 'invalid quota exposure proof';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_each(p_proof->'scopes') s CROSS JOIN LATERAL jsonb_each(s.value) o
        WHERE o.value->>0='U' OR (o.value->>0='R' AND o.value->>4='true')) THEN RETURN 0; END IF;
    IF p_core IS NULL OR p_instance IS NULL THEN RAISE EXCEPTION 'quota exposure requires a live process and journal'; END IF;
    INSERT INTO xera_quota_usage_exposures(node_uuid,core_uuid,instance_uuid,kind,key,user_id,first_revision,last_revision,unbounded)
        SELECT p_node,p_core,p_instance,upper(split_part(s.key,':',1)),substring(s.key from position(':' in s.key)+1),
            o.key::bigint,p_revision,p_revision,o.value->>0='U'
        FROM jsonb_each(p_proof->'scopes') s CROSS JOIN LATERAL jsonb_each(s.value) o
        WHERE o.value->>0='U' OR (o.value->>0='R' AND o.value->>4='true')
    ON CONFLICT(node_uuid,core_uuid,instance_uuid,kind,key,user_id) DO UPDATE SET
        last_revision=GREATEST(xera_quota_usage_exposures.last_revision,excluded.last_revision),
        unbounded=xera_quota_usage_exposures.unbounded OR excluded.unbounded,
        fenced_at=CASE WHEN excluded.last_revision>=xera_quota_usage_exposures.last_revision THEN NULL ELSE xera_quota_usage_exposures.fenced_at END,
        fenced_sequence=CASE WHEN excluded.last_revision>=xera_quota_usage_exposures.last_revision THEN NULL ELSE xera_quota_usage_exposures.fenced_sequence END;
    GET DIAGNOSTICS affected=ROW_COUNT;
    RETURN affected;
END;
$$;

CREATE FUNCTION xera_ack_quota_exposure_policy(p_node UUID,p_core UUID,p_instance UUID,p_revision BIGINT,p_proof JSONB)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE affected INTEGER;
BEGIN
    -- A restart between preflight and ACK preserves the earlier process's row;
    -- acknowledging the replacement never fabricates its predecessor's zero.
    PERFORM xera_record_quota_exposure_intent(p_node,p_core,p_instance,p_revision,p_proof);
    UPDATE xera_quota_usage_exposures e SET fenced_at=COALESCE(e.fenced_at,clock_timestamp()),
        fenced_sequence=COALESCE(e.fenced_sequence,(SELECT s.next_sequence+CASE WHEN s.expected_core IS NOT NULL THEN 1 ELSE 0 END
            FROM xera_node_usage_streams s WHERE s.node_uuid=p_node AND s.stream_id=p_instance),1)
        WHERE e.node_uuid=p_node AND e.core_uuid=p_core AND e.instance_uuid=p_instance AND e.last_revision<=p_revision
          AND NOT EXISTS(SELECT 1 FROM jsonb_each(p_proof->'scopes') s CROSS JOIN LATERAL jsonb_each(s.value) o
            WHERE upper(split_part(s.key,':',1))=e.kind AND substring(s.key from position(':' in s.key)+1)=e.key AND o.key=e.user_id::text
              AND (o.value->>0='U' OR (o.value->>0='R' AND o.value->>4='true')));
    GET DIAGNOSTICS affected=ROW_COUNT;
    RETURN affected;
END;
$$;

CREATE FUNCTION xera_cover_quota_usage_exposure(p_node UUID,p_core UUID,p_instance UUID,p_sequence BIGINT,p_requested TIMESTAMPTZ)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE affected INTEGER;
BEGIN
    IF p_node IS NULL OR p_core IS NULL OR p_instance IS NULL OR p_requested IS NULL OR p_sequence IS NULL OR p_sequence<=0 THEN
        RAISE EXCEPTION 'invalid quota exposure coverage';
    END IF;
    -- The caller commits this with the validated frame's monetary increments.
    -- SQL timestamps come from the same database, never the remote node clock.
    DELETE FROM xera_quota_usage_exposures WHERE node_uuid=p_node AND core_uuid=p_core AND instance_uuid=p_instance
        AND fenced_at IS NOT NULL AND p_sequence>=fenced_sequence
        AND floor(extract(epoch FROM fenced_at)*1000)<floor(extract(epoch FROM p_requested)*1000);
    GET DIAGNOSTICS affected=ROW_COUNT;
    RETURN affected;
END;
$$;

CREATE FUNCTION xera_assert_quota_exposure_covered(p_kind TEXT,p_key TEXT,p_owner BIGINT,p_credit BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS(SELECT 1 FROM xera_quota_usage_exposures e LEFT JOIN xera_quota_node_modes m ON m.node_uuid=e.node_uuid
        WHERE e.kind=p_kind AND e.key=p_key AND e.user_id=p_owner
          AND (p_credit OR e.unbounded OR e.fenced_at IS NOT NULL OR e.core_uuid IS DISTINCT FROM m.applied_core OR e.instance_uuid IS DISTINCT FROM m.instance_uuid)) THEN
        RAISE EXCEPTION USING MESSAGE='QUOTA_USAGE_REQUIRES_RECOVERY';
    END IF;
END;
$$;

-- Upgrade existing installations without modifying their migration history.
CREATE OR REPLACE FUNCTION xera_allocate_quota_reserves(
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
    PERFORM xera_assert_quota_exposure_covered(p_kind,p_key,p_user);
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
        PERFORM xera_assert_quota_exposure_covered(p_kind,p_key,p_user,true);
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

CREATE OR REPLACE FUNCTION xera_redistribute_quota_reserves(
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
    PERFORM xera_assert_quota_exposure_covered(p_kind,p_key,p_user);
    epoch:=xera_current_quota_epoch(p_kind,p_key,p_user,meter.window_start);
    SELECT * INTO pool FROM xera_quota_reserve_pools p WHERE p.kind=p_kind AND p.key=p_key
      AND p.user_id=p_user AND p.window_start=meter.window_start AND p.budget_epoch=epoch FOR UPDATE;
    IF NOT FOUND OR pool.allocated_at IS NULL OR pool.expires_at<=now() OR meter.paused OR meter.effective_limit<=0 THEN
        RAISE EXCEPTION 'quota pool is unavailable for redistribution';
    END IF;
    SELECT COALESCE(sum(CASE WHEN g.closed_usage_bytes IS NULL THEN g.ceiling_bytes ELSE g.closed_usage_bytes END),0)
      INTO committed FROM xera_quota_reserves g WHERE g.kind=p_kind AND g.key=p_key AND g.user_id=p_user AND g.window_start=pool.window_start AND g.budget_epoch=epoch;
    available:=GREATEST(pool.limit_bytes::numeric-pool.baseline_bytes-committed,0)::bigint;
    IF available>0 THEN PERFORM xera_assert_quota_exposure_covered(p_kind,p_key,p_user,true); END IF;
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

-- These tables belong to unreleased coordinator sources. If source upgrades
-- have already recorded an applied proof, preserve it before future replacement.
SELECT xera_record_quota_exposure_intent(node_uuid,applied_core,instance_uuid,applied_revision,applied_policy)
    FROM xera_quota_node_modes WHERE applied_core IS NOT NULL AND applied_revision IS NOT NULL AND applied_policy IS NOT NULL;
-- A committed pending delivery may already have served traffic without an ACK.
SELECT xera_record_quota_exposure_intent(node_uuid,COALESCE(applied_core,initial_core),instance_uuid,desired_revision,desired_policy)
    FROM xera_quota_node_modes WHERE COALESCE(applied_core,initial_core) IS NOT NULL AND instance_uuid IS NOT NULL
      AND desired_revision IS NOT NULL AND desired_policy IS NOT NULL;
