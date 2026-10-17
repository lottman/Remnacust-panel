CREATE TABLE xera_quota_recovery_settlements (
    request_id UUID PRIMARY KEY,
    generation UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    bank_request UUID NOT NULL REFERENCES xera_quota_recovery_banks(request_id),
    source_request UUID NOT NULL REFERENCES xera_quota_recovery_evidence(request_id),
    node_uuid UUID NOT NULL,
    request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
    plan_digest TEXT NOT NULL CHECK(plan_digest ~ '^[a-f0-9]{64}$'),
    plan_text TEXT NOT NULL CHECK(octet_length(plan_text) BETWEEN 1 AND 4194304),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK(plan_digest=encode(sha256(convert_to(plan_text,'UTF8')),'hex')),
    CHECK(plan_text::jsonb->>'version' IS NOT DISTINCT FROM 'remnacust-quota-recovery-settlement-v1'),
    CHECK(plan_text::jsonb->>'generation' IS NOT DISTINCT FROM generation::text),
    CHECK(plan_text::jsonb->>'bankRequest' IS NOT DISTINCT FROM bank_request::text),
    CHECK(plan_text::jsonb->'source'->>'requestId' IS NOT DISTINCT FROM source_request::text),
    CHECK(plan_text::jsonb->>'node' IS NOT DISTINCT FROM node_uuid::text)
);
CREATE INDEX xera_quota_recovery_settlement_history ON xera_quota_recovery_settlements(created_at DESC,request_id DESC);
CREATE TRIGGER xera_quota_recovery_settlements_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_settlements
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_settlements_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_settlements
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
