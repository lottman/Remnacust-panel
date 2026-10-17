-- Hold-policy delivery is restrictive control, not financial reconciliation.
CREATE TABLE xera_quota_recovery_policy_jobs (
    request_id UUID PRIMARY KEY,
    generation UUID NOT NULL,
    node_uuid UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    connection_hash TEXT NOT NULL CHECK(connection_hash ~ '^[a-f0-9]{64}$'),
    payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    lease_owner UUID,
    lease_until TIMESTAMPTZ,
    result JSONB CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND octet_length(result::text)<=16384)),
    CHECK((lease_owner IS NULL)=(lease_until IS NULL)),
    CHECK((payload->>'requestId'=request_id::text AND payload->>'generation'=generation::text) IS TRUE),
    CHECK(result IS NULL OR ((result->>'requestId'=payload->>'requestId'
        AND result->>'coreProcessId'=payload->>'coreProcessId'
        AND result->>'instance'=payload->>'instance'
        AND result->>'policyRevision'=payload->>'policyRevision'
        AND result->'quotaRecovery'->'record'->>'state'='FENCED'
        AND result->'quotaRecovery'->'record'->>'generation'=generation::text
        AND result->'quotaRecovery'->'record'->>'digest'=payload->>'previous') IS TRUE))
);
CREATE INDEX xera_quota_recovery_policy_jobs_node ON xera_quota_recovery_policy_jobs(generation,node_uuid);
CREATE FUNCTION xera_guard_recovery_policy_job() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'quota recovery policy intent is immutable'; END IF;
    IF ROW(NEW.request_id,NEW.generation,NEW.node_uuid,NEW.actor_uuid,NEW.connection_hash,NEW.payload,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.request_id,OLD.generation,OLD.node_uuid,OLD.actor_uuid,OLD.connection_hash,OLD.payload,OLD.created_at)
        OR (OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result) THEN
        RAISE EXCEPTION 'quota recovery policy intent is immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_recovery_policy_job_guard BEFORE UPDATE OR DELETE ON xera_quota_recovery_policy_jobs
    FOR EACH ROW EXECUTE FUNCTION xera_guard_recovery_policy_job();
CREATE TRIGGER xera_recovery_policy_job_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_policy_jobs
    EXECUTE FUNCTION xera_guard_recovery_policy_job();
CREATE TABLE xera_quota_recovery_policy_attempts (
    attempt_id UUID NOT NULL,
    phase TEXT NOT NULL CHECK(phase IN ('REQUESTED','OBSERVED')),
    request_id UUID NOT NULL REFERENCES xera_quota_recovery_policy_jobs(request_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    details JSONB NOT NULL CHECK(jsonb_typeof(details)='object' AND octet_length(details::text)<=16384),
    PRIMARY KEY(attempt_id,phase)
);
CREATE INDEX xera_recovery_policy_attempt_history ON xera_quota_recovery_policy_attempts(request_id,created_at,attempt_id);
CREATE TRIGGER xera_recovery_policy_attempt_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_policy_attempts
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_recovery_policy_attempt_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_policy_attempts
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE FUNCTION xera_check_recovery_policy_attempt() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.phase='OBSERVED' AND NOT EXISTS(SELECT 1 FROM xera_quota_recovery_policy_attempts a
        WHERE a.attempt_id=NEW.attempt_id AND a.phase='REQUESTED' AND a.request_id=NEW.request_id) THEN
        RAISE EXCEPTION 'quota recovery policy observation requires its original intent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_recovery_policy_attempt_context BEFORE INSERT ON xera_quota_recovery_policy_attempts
    FOR EACH ROW EXECUTE FUNCTION xera_check_recovery_policy_attempt();
