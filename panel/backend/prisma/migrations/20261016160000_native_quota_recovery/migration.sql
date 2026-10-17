CREATE TABLE xera_native_quota_recovery_decisions (
    request_id UUID PRIMARY KEY,
    generation UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    node_uuid UUID NOT NULL,
    stream_id UUID NOT NULL,
    sequence BIGINT NOT NULL CHECK(sequence>0),
    source_request UUID NOT NULL REFERENCES xera_quota_receipt_requests(request_id),
    bank_request UUID NOT NULL REFERENCES xera_quota_recovery_banks(request_id),
    request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
    plan_digest TEXT NOT NULL CHECK(plan_digest ~ '^[a-f0-9]{64}$'),
    plan_text TEXT NOT NULL CHECK(octet_length(plan_text) BETWEEN 1 AND 16777216),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(node_uuid,stream_id,sequence),
    CHECK(plan_digest=encode(sha256(convert_to(plan_text,'UTF8')),'hex')),
    CHECK(plan_text::jsonb->>'version' IS NOT DISTINCT FROM 'remnacust-native-recovery-v1'),
    CHECK(plan_text::jsonb->>'generation' IS NOT DISTINCT FROM generation::text),
    CHECK(plan_text::jsonb->>'node' IS NOT DISTINCT FROM node_uuid::text),
    CHECK(plan_text::jsonb->>'sourceRequest' IS NOT DISTINCT FROM source_request::text),
    CHECK(plan_text::jsonb->>'bankRequest' IS NOT DISTINCT FROM bank_request::text),
    CHECK(plan_text::jsonb->'source'->>'stream' IS NOT DISTINCT FROM stream_id::text),
    CHECK(plan_text::jsonb->'source'->'frame'->>'sequence' IS NOT DISTINCT FROM sequence::text)
);
CREATE INDEX xera_native_quota_recovery_history ON xera_native_quota_recovery_decisions(created_at DESC,request_id DESC);
CREATE TRIGGER xera_native_quota_recovery_immutable BEFORE UPDATE OR DELETE ON xera_native_quota_recovery_decisions
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_native_quota_recovery_no_truncate BEFORE TRUNCATE ON xera_native_quota_recovery_decisions
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
