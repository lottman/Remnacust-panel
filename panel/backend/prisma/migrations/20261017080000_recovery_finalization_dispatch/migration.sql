-- Control queue only: the original financial intent remains immutable in finalizations.
CREATE TABLE xera_quota_recovery_finalization_dispatches (
    request_id UUID PRIMARY KEY REFERENCES xera_quota_recovery_finalizations(request_id),
    state TEXT NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','RUNNING','FAILED','COMPLETED')),
    attempts BIGINT NOT NULL DEFAULT 0 CHECK(attempts>=0),
    lease_owner UUID,
    lease_until TIMESTAMPTZ,
    last_error TEXT CHECK(last_error ~ '^[A-Z_]{1,80}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    queued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((lease_owner IS NULL)=(lease_until IS NULL)),
    CHECK((state='RUNNING')=(lease_owner IS NOT NULL)),
    CHECK((state='FAILED')=(last_error IS NOT NULL))
);
CREATE INDEX xera_recovery_finalization_dispatch_ready ON xera_quota_recovery_finalization_dispatches(state,queued_at,request_id);
CREATE FUNCTION xera_guard_finalization_dispatch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'finalization dispatch history is immutable'; END IF;
    IF TG_OP='UPDATE' THEN
        IF NEW.request_id<>OLD.request_id OR NEW.created_at<>OLD.created_at OR OLD.state='COMPLETED' THEN
            RAISE EXCEPTION 'finalization dispatch identity or completed result is immutable';
        END IF;
        IF NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1 THEN
            RAISE EXCEPTION 'finalization dispatch attempt counter differs';
        END IF;
        IF NEW.state='RUNNING' AND NEW.lease_owner IS DISTINCT FROM OLD.lease_owner THEN
            IF OLD.state NOT IN ('QUEUED','RUNNING') OR (OLD.state='RUNNING' AND OLD.lease_until>clock_timestamp())
                OR NEW.attempts<>OLD.attempts+1 THEN
                RAISE EXCEPTION 'finalization dispatch cannot steal an active lease';
            END IF;
        ELSIF NEW.attempts<>OLD.attempts THEN
            RAISE EXCEPTION 'finalization dispatch attempts require a new owner';
        END IF;
        IF NEW.state='QUEUED' AND OLD.state<>'FAILED' THEN
            RAISE EXCEPTION 'only an explicit retry can queue a failed finalization';
        END IF;
        IF NEW.state='FAILED' AND OLD.state<>'RUNNING' THEN
            RAISE EXCEPTION 'failed finalization dispatch has no running attempt';
        END IF;
    ELSIF NEW.state<>'QUEUED' OR NEW.attempts<>0 THEN
        RAISE EXCEPTION 'finalization dispatch must begin queued';
    END IF;
    IF NEW.state='COMPLETED' AND NOT EXISTS(SELECT 1 FROM xera_quota_recovery_finalizations f WHERE f.request_id=NEW.request_id AND f.result IS NOT NULL) THEN
        RAISE EXCEPTION 'completed dispatch requires a confirmed finalization';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_finalization_dispatch_guard BEFORE INSERT OR UPDATE OR DELETE ON xera_quota_recovery_finalization_dispatches
    FOR EACH ROW EXECUTE FUNCTION xera_guard_finalization_dispatch();
CREATE TRIGGER xera_finalization_dispatch_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_finalization_dispatches
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
