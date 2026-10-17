CREATE TABLE xera_quota_recovery_finalizations (
    request_id UUID PRIMARY KEY,
    approval_request UUID NOT NULL UNIQUE REFERENCES xera_quota_recovery_release_approvals(request_id),
    generation UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
    note TEXT NOT NULL CHECK(length(note) BETWEEN 10 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    lease_owner UUID,
    lease_until TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result JSONB CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND octet_length(result::text)<=4096)),
    CHECK((lease_owner IS NULL)=(lease_until IS NULL)),
    CHECK((completed_at IS NULL)=(result IS NULL)),
    CHECK(result IS NULL OR ((result->>'requestId'=request_id::text AND result->>'approvalRequest'=approval_request::text
        AND result->>'generation'=generation::text AND (result->>'completedAt')::timestamptz=completed_at) IS TRUE))
);
CREATE FUNCTION xera_guard_recovery_finalization() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'recovery finalization intent is immutable'; END IF;
    IF TG_OP='UPDATE' AND ((NEW.request_id,NEW.approval_request,NEW.generation,NEW.actor_uuid,NEW.request_digest,NEW.note,NEW.created_at)
        IS DISTINCT FROM (OLD.request_id,OLD.approval_request,OLD.generation,OLD.actor_uuid,OLD.request_digest,OLD.note,OLD.created_at)
        OR (OLD.result IS NOT NULL AND NEW IS DISTINCT FROM OLD)) THEN
        RAISE EXCEPTION 'recovery finalization intent is immutable';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM xera_quota_recovery_release_approvals a WHERE a.request_id=NEW.approval_request AND a.generation=NEW.generation) THEN
        RAISE EXCEPTION 'recovery finalization generation differs';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_recovery_finalization_guard BEFORE INSERT OR UPDATE OR DELETE ON xera_quota_recovery_finalizations
    FOR EACH ROW EXECUTE FUNCTION xera_guard_recovery_finalization();
CREATE TRIGGER xera_recovery_finalization_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_finalizations
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TABLE xera_quota_recovery_finalization_attempts (
    attempt_id UUID NOT NULL,
    phase TEXT NOT NULL CHECK(phase IN ('REQUESTED','OBSERVED')),
    request_id UUID NOT NULL REFERENCES xera_quota_recovery_finalizations(request_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    details JSONB NOT NULL CHECK(jsonb_typeof(details)='object' AND octet_length(details::text)<=32768),
    PRIMARY KEY(attempt_id,phase)
);
CREATE INDEX xera_recovery_finalization_history ON xera_quota_recovery_finalization_attempts(request_id,created_at,attempt_id);
CREATE TRIGGER xera_recovery_finalization_attempt_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_finalization_attempts
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_recovery_finalization_attempt_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_finalization_attempts
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TABLE xera_quota_recovery_finalization_checks (
    attempt_id UUID NOT NULL,
    phase TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(phase='REQUESTED'),
    node_uuid UUID NOT NULL,
    release_request UUID NOT NULL REFERENCES xera_quota_recovery_release_jobs(request_id),
    release_attempt UUID NOT NULL,
    release_phase TEXT NOT NULL DEFAULT 'OBSERVED' CHECK(release_phase='OBSERVED'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(attempt_id,node_uuid),
    UNIQUE(attempt_id,release_request),
    FOREIGN KEY(attempt_id,phase) REFERENCES xera_quota_recovery_finalization_attempts(attempt_id,phase),
    FOREIGN KEY(release_attempt,release_phase) REFERENCES xera_quota_recovery_release_attempts(attempt_id,phase)
);
CREATE TRIGGER xera_recovery_finalization_check_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_finalization_checks
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_recovery_finalization_check_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_finalization_checks
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE FUNCTION xera_check_recovery_finalization_context() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='xera_quota_recovery_finalization_checks' THEN
        IF NOT EXISTS(SELECT 1 FROM xera_quota_recovery_finalization_attempts f
            JOIN xera_quota_recovery_finalizations i ON i.request_id=f.request_id
            JOIN xera_quota_recovery_release_jobs j ON j.approval_request=i.approval_request
            JOIN xera_quota_recovery_release_attempts r ON r.attempt_id=NEW.release_attempt AND r.phase='REQUESTED'
            JOIN xera_quota_recovery_release_attempts o ON o.attempt_id=r.attempt_id AND o.phase='OBSERVED'
            WHERE f.attempt_id=NEW.attempt_id AND f.phase='REQUESTED'
                AND j.request_id=NEW.release_request AND j.node_uuid=NEW.node_uuid
                AND r.request_id=j.request_id AND r.created_at>=f.created_at
                AND o.request_id=j.request_id AND o.details->>'confirmed'='true'
                AND j.result IS NOT NULL AND o.details->'acknowledgement'=j.result) THEN
            RAISE EXCEPTION 'finalization requires a fresh matching Node acknowledgement';
        END IF;
    ELSE
        IF NEW.phase='REQUESTED' AND NOT EXISTS(SELECT 1 FROM xera_quota_recovery_finalizations i
            JOIN xera_quota_recovery_release_approvals a ON a.request_id=i.approval_request
            WHERE i.request_id=NEW.request_id AND NEW.details->>'actor'=i.actor_uuid::text
                AND NEW.details->>'approvalRequest'=i.approval_request::text
                AND NEW.details->>'generation'=i.generation::text
                AND NEW.details->>'baselineRequest'=a.baseline_request::text) THEN
            RAISE EXCEPTION 'finalization attempt differs from original intent';
        END IF;
        IF NEW.phase='OBSERVED' AND (jsonb_typeof(NEW.details->'confirmed') IS DISTINCT FROM 'boolean'
            OR NOT EXISTS(SELECT 1 FROM xera_quota_recovery_finalization_attempts a
                WHERE a.attempt_id=NEW.attempt_id AND a.phase='REQUESTED' AND a.request_id=NEW.request_id)) THEN
            RAISE EXCEPTION 'finalization observation requires original intent';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_recovery_finalization_attempt_context BEFORE INSERT ON xera_quota_recovery_finalization_attempts
    FOR EACH ROW EXECUTE FUNCTION xera_check_recovery_finalization_context();
CREATE TRIGGER xera_recovery_finalization_check_context BEFORE INSERT ON xera_quota_recovery_finalization_checks
    FOR EACH ROW EXECUTE FUNCTION xera_check_recovery_finalization_context();
CREATE FUNCTION xera_check_recovery_finalization_result() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE item xera_quota_recovery_finalizations%ROWTYPE; run UUID; expected BIGINT;
BEGIN
    IF TG_TABLE_NAME='xera_quota_recovery_finalizations' THEN item:=NEW;
    ELSE SELECT * INTO item FROM xera_quota_recovery_finalizations WHERE request_id=NEW.request_id; END IF;
    IF item.result IS NULL THEN
        IF TG_TABLE_NAME='xera_quota_recovery_finalization_attempts' THEN
            IF NEW.phase='OBSERVED' AND NEW.details->>'confirmed'='true' THEN
                RAISE EXCEPTION 'confirmed finalization has no completion';
            END IF;
        END IF;
        RETURN NULL;
    END IF;
    run:=(item.result->>'attemptId')::uuid;
    SELECT count(*) INTO expected FROM xera_quota_recovery_release_jobs WHERE approval_request=item.approval_request;
    IF expected=0 OR expected<>(SELECT count(*) FROM xera_quota_recovery_finalization_checks WHERE attempt_id=run)
        OR NOT EXISTS(SELECT 1 FROM xera_quota_recovery_finalization_attempts o WHERE o.attempt_id=run AND o.phase='OBSERVED'
            AND o.request_id=item.request_id AND o.details->>'confirmed'='true' AND o.details->'result'=item.result)
        OR EXISTS(SELECT 1 FROM xera_quota_recovery_release_jobs WHERE approval_request=item.approval_request AND result IS NULL) THEN
        RAISE EXCEPTION 'finalization completion lacks its full confirmed graph';
    END IF;
    -- Only the live NULL -> completed transition checks mutable global state.
    -- Historical INSERTs remain restorable after later coordinator generations.
    IF TG_TABLE_NAME='xera_quota_recovery_finalizations' AND TG_OP='UPDATE' THEN
      IF OLD.result IS NULL THEN
        IF NOT EXISTS(SELECT 1 FROM xera_quota_restore_state WHERE singleton AND generation=item.generation AND reconciled_at=item.completed_at)
            OR NOT EXISTS(SELECT 1 FROM xera_quota_coordinator WHERE id=1 AND generation=(item.result->>'coordinatorGeneration')::uuid
                AND phase='PREFLIGHT' AND lease_owner IS NULL) THEN
            RAISE EXCEPTION 'finalization completion is not atomic with coordinator handoff';
        END IF;
      END IF;
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER xera_recovery_finalization_result AFTER INSERT OR UPDATE ON xera_quota_recovery_finalizations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xera_check_recovery_finalization_result();
CREATE CONSTRAINT TRIGGER xera_recovery_finalization_observation AFTER INSERT ON xera_quota_recovery_finalization_attempts
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xera_check_recovery_finalization_result();
