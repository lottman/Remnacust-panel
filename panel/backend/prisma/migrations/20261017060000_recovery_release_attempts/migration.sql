-- Control journal: immutable attempts are validated against the already
-- approved immutable job; these events are not monetary bank inputs.
CREATE TABLE xera_quota_recovery_release_attempts (
    attempt_id UUID NOT NULL,
    phase TEXT NOT NULL CHECK(phase IN ('REQUESTED','OBSERVED')),
    request_id UUID NOT NULL REFERENCES xera_quota_recovery_release_jobs(request_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    details JSONB NOT NULL CHECK(jsonb_typeof(details)='object' AND octet_length(details::text)<=32768),
    PRIMARY KEY(attempt_id,phase)
);
CREATE INDEX xera_recovery_release_attempt_history ON xera_quota_recovery_release_attempts(request_id,created_at,attempt_id);
CREATE TRIGGER xera_recovery_release_attempt_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_release_attempts
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_recovery_release_attempt_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_release_attempts
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE FUNCTION xera_check_recovery_release_attempt() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE job xera_quota_recovery_release_jobs%ROWTYPE; parent xera_quota_recovery_release_approvals%ROWTYPE;
BEGIN
    SELECT * INTO job FROM xera_quota_recovery_release_jobs WHERE request_id=NEW.request_id;
    SELECT * INTO parent FROM xera_quota_recovery_release_approvals WHERE request_id=job.approval_request;
    IF NEW.phase='REQUESTED' AND (NEW.details->'payload' IS DISTINCT FROM job.payload
        OR NEW.details->'previous' IS DISTINCT FROM job.previous
        OR NEW.details->>'baselineRequest' IS DISTINCT FROM parent.baseline_request::text
        OR NOT COALESCE(NEW.details->>'actor' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)) THEN
        RAISE EXCEPTION 'release attempt differs from its approved intent';
    END IF;
    IF NEW.phase='OBSERVED' AND (NOT EXISTS(SELECT 1 FROM xera_quota_recovery_release_attempts a
        WHERE a.attempt_id=NEW.attempt_id AND a.phase='REQUESTED' AND a.request_id=NEW.request_id)
        OR jsonb_typeof(NEW.details->'confirmed') IS DISTINCT FROM 'boolean') THEN
        RAISE EXCEPTION 'release observation requires its original intent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_recovery_release_attempt_context BEFORE INSERT ON xera_quota_recovery_release_attempts
    FOR EACH ROW EXECUTE FUNCTION xera_check_recovery_release_attempt();
CREATE FUNCTION xera_check_recovery_release_confirmation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.phase='OBSERVED' AND NEW.details->>'confirmed'='true' AND NOT EXISTS(
        SELECT 1 FROM xera_quota_recovery_release_jobs j WHERE j.request_id=NEW.request_id
            AND j.result IS NOT NULL AND j.result=NEW.details->'acknowledgement') THEN
        RAISE EXCEPTION 'release confirmation requires its committed acknowledgement';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER xera_recovery_release_confirmation AFTER INSERT ON xera_quota_recovery_release_attempts
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xera_check_recovery_release_confirmation();
