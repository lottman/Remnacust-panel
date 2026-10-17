-- Financial decisions are immutable; live process bindings belong to attempts.
CREATE TABLE xera_quota_recovery_receipt_jobs (
    request_id UUID PRIMARY KEY,
    generation UUID NOT NULL,
    node_uuid UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    decision_request UUID NOT NULL REFERENCES xera_native_quota_recovery_decisions(request_id),
    connection_hash TEXT NOT NULL CHECK(connection_hash ~ '^[a-f0-9]{64}$'),
    source JSONB NOT NULL CHECK(jsonb_typeof(source)='object' AND octet_length(source::text)<=4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    lease_owner UUID,
    lease_until TIMESTAMPTZ,
    result JSONB CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND octet_length(result::text)<=16384)),
    CHECK((lease_owner IS NULL)=(lease_until IS NULL)),
    CHECK((source->>'decisionRequest'=decision_request::text) IS TRUE),
    CHECK(result IS NULL OR ((result->>'requestId'=request_id::text
        AND result->>'generation'=generation::text
        AND result->>'sourceDigest'=source->>'sourceDigest'
        AND result->>'decisionDigest'=source->>'decisionDigest'
        AND result->'acknowledgement'->>'acknowledged'='true'
        AND result->'journal'->>'stream'=source->'receipt'->>'stream'
        AND result->'journal'->>'acked'=source->'receipt'->>'sequence'
        AND result->'journal'->>'ackDigest'=source->'receipt'->>'digest'
        AND result->'recovery'->>'state'='FENCED'
        AND result->'recovery'->>'generation'=generation::text) IS TRUE))
);
CREATE INDEX xera_recovery_receipt_jobs_node ON xera_quota_recovery_receipt_jobs(generation,node_uuid);
CREATE FUNCTION xera_guard_recovery_receipt_job() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'recovery receipt intent is immutable'; END IF;
    IF ROW(NEW.request_id,NEW.generation,NEW.node_uuid,NEW.actor_uuid,NEW.decision_request,NEW.connection_hash,NEW.source,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.request_id,OLD.generation,OLD.node_uuid,OLD.actor_uuid,OLD.decision_request,OLD.connection_hash,OLD.source,OLD.created_at)
        OR (OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result) THEN
        RAISE EXCEPTION 'recovery receipt intent is immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_recovery_receipt_job_guard BEFORE UPDATE OR DELETE ON xera_quota_recovery_receipt_jobs
    FOR EACH ROW EXECUTE FUNCTION xera_guard_recovery_receipt_job();
CREATE TRIGGER xera_recovery_receipt_job_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_receipt_jobs
    EXECUTE FUNCTION xera_guard_recovery_receipt_job();
CREATE TABLE xera_quota_recovery_receipt_attempts (
    attempt_id UUID NOT NULL,
    phase TEXT NOT NULL CHECK(phase IN ('REQUESTED','OBSERVED')),
    request_id UUID NOT NULL REFERENCES xera_quota_recovery_receipt_jobs(request_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    details JSONB NOT NULL CHECK(jsonb_typeof(details)='object' AND octet_length(details::text)<=32768),
    PRIMARY KEY(attempt_id,phase)
);
CREATE INDEX xera_recovery_receipt_attempt_history ON xera_quota_recovery_receipt_attempts(request_id,created_at,attempt_id);
CREATE TRIGGER xera_recovery_receipt_attempt_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_receipt_attempts
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_recovery_receipt_attempt_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_receipt_attempts
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE FUNCTION xera_check_recovery_receipt_attempt() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.phase='OBSERVED' AND NOT EXISTS(SELECT 1 FROM xera_quota_recovery_receipt_attempts a
        WHERE a.attempt_id=NEW.attempt_id AND a.phase='REQUESTED' AND a.request_id=NEW.request_id) THEN
        RAISE EXCEPTION 'recovery receipt observation requires its original intent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_recovery_receipt_attempt_context BEFORE INSERT ON xera_quota_recovery_receipt_attempts
    FOR EACH ROW EXECUTE FUNCTION xera_check_recovery_receipt_attempt();
