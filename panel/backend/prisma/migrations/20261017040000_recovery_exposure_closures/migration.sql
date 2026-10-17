-- Closing a covered risk marker is not charging money or releasing traffic.
CREATE TABLE xera_quota_recovery_exposure_closures (
    request_id UUID PRIMARY KEY,
    generation UUID NOT NULL,
    node_uuid UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    witness_request UUID NOT NULL REFERENCES xera_quota_recovery_quiescence(preparation_request),
    acknowledgement_request UUID NOT NULL REFERENCES xera_quota_recovery_receipt_jobs(request_id),
    bank_request UUID NOT NULL REFERENCES xera_quota_recovery_banks(request_id),
    request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
    plan_digest TEXT NOT NULL CHECK(plan_digest ~ '^[a-f0-9]{64}$'),
    plan_text TEXT NOT NULL CHECK(octet_length(plan_text)<=16384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((plan_text::jsonb->>'version'='remnacust-exposure-closure-v1'
        AND plan_text::jsonb->>'node'=node_uuid::text AND plan_text::jsonb->>'generation'=generation::text
        AND plan_text::jsonb->>'witnessRequest'=witness_request::text
        AND plan_text::jsonb->>'acknowledgementRequest'=acknowledgement_request::text
        AND plan_text::jsonb->>'bankRequest'=bank_request::text) IS TRUE)
);
CREATE INDEX xera_quota_exposure_closures_history ON xera_quota_recovery_exposure_closures(generation,node_uuid,created_at,request_id);
CREATE TRIGGER xera_quota_exposure_closure_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_exposure_closures
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_exposure_closure_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_exposure_closures
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
