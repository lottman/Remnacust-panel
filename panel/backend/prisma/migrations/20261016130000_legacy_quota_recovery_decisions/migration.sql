-- Explicit administrative recovery decisions are accounting history, not logs.
-- Keep the original plan text so its exact hash can be checked independently.
CREATE TABLE xera_legacy_quota_recovery_decisions (
    request_id UUID PRIMARY KEY,
    generation UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    receipt TEXT NOT NULL UNIQUE CHECK(receipt ~ '^[a-f0-9]{64}$'),
    source_digest TEXT NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
    request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
    plan_digest TEXT NOT NULL CHECK(plan_digest ~ '^[a-f0-9]{64}$'),
    plan_text TEXT NOT NULL CHECK(octet_length(plan_text) BETWEEN 1 AND 2097152),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK(plan_digest=encode(sha256(convert_to(plan_text,'UTF8')),'hex')),
    CHECK(plan_text::jsonb->>'version' IS NOT DISTINCT FROM 'remnacust-legacy-recovery-v1'),
    CHECK(plan_text::jsonb->>'receipt' IS NOT DISTINCT FROM receipt),
    CHECK(plan_text::jsonb->>'generation' IS NOT DISTINCT FROM generation::text),
    CHECK(plan_text::jsonb->'source'->>'digest' IS NOT DISTINCT FROM source_digest)
);
CREATE INDEX xera_legacy_quota_recovery_history
    ON xera_legacy_quota_recovery_decisions(created_at,request_id);
CREATE TRIGGER xera_legacy_quota_recovery_decisions_immutable
    BEFORE UPDATE OR DELETE ON xera_legacy_quota_recovery_decisions
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_legacy_quota_recovery_decisions_no_truncate
    BEFORE TRUNCATE ON xera_legacy_quota_recovery_decisions
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();

-- Deleting an old mutable job cannot turn its retained decision into new debt.
CREATE FUNCTION xera_guard_resolved_legacy_job() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE decision xera_legacy_quota_recovery_decisions%ROWTYPE;
BEGIN
    IF TG_OP='UPDATE' AND OLD.receipt IS DISTINCT FROM NEW.receipt
       AND EXISTS(SELECT 1 FROM xera_legacy_quota_recovery_decisions WHERE receipt=OLD.receipt) THEN
        RAISE EXCEPTION 'resolved legacy receipt cannot be renamed';
    END IF;
    SELECT * INTO decision FROM xera_legacy_quota_recovery_decisions WHERE receipt=NEW.receipt;
    IF FOUND AND (NOT NEW.applied OR NEW.pending_users IS NOT NULL OR NEW.digest IS DISTINCT FROM decision.source_digest
        OR NEW.payload IS DISTINCT FROM decision.plan_text::jsonb->'source'->'payload') THEN
        RAISE EXCEPTION 'resolved legacy receipt cannot be reintroduced as new debt';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_resolved_legacy_job_guard BEFORE INSERT OR UPDATE ON xera_legacy_usage_jobs
    FOR EACH ROW EXECUTE FUNCTION xera_guard_resolved_legacy_job();
