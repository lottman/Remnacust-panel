-- This records preparation of a next sample, not financial reconciliation.
CREATE TABLE xera_quota_recovery_tail_preparations (
    request_id UUID PRIMARY KEY,
    acknowledgement_request UUID NOT NULL UNIQUE REFERENCES xera_quota_recovery_receipt_jobs(request_id),
    source_request UUID NOT NULL REFERENCES xera_quota_receipt_requests(request_id),
    generation UUID NOT NULL,
    node_uuid UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    intent JSONB NOT NULL CHECK(jsonb_typeof(intent)='object' AND octet_length(intent::text)<=8192),
    plan JSONB NOT NULL CHECK(jsonb_typeof(plan)='object' AND octet_length(plan::text)<=4096),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((intent->>'requestId'=request_id::text AND intent->>'generation'=generation::text
        AND intent->>'acknowledgementRequest'=acknowledgement_request::text
        AND intent->>'consumptionMultiplier'=plan->>'consumptionMultiplier'
        AND plan->>'version'='remnacust-recovery-tail-v1'
        AND plan->'sample'->>'action'='sample') IS TRUE)
);
CREATE INDEX xera_quota_tail_preparations_node ON xera_quota_recovery_tail_preparations(generation,node_uuid);
CREATE TRIGGER xera_quota_tail_preparation_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_tail_preparations
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_tail_preparation_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_tail_preparations
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
