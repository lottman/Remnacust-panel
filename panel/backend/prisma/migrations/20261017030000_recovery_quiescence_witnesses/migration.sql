-- Native empty-after-fence evidence; this does not reconcile money or release a node.
CREATE TABLE xera_quota_recovery_quiescence (
    preparation_request UUID PRIMARY KEY REFERENCES xera_quota_recovery_tail_preparations(request_id),
    source_request UUID NOT NULL REFERENCES xera_quota_receipt_requests(request_id),
    generation UUID NOT NULL,
    node_uuid UUID NOT NULL,
    witness_digest TEXT NOT NULL CHECK(witness_digest ~ '^[a-f0-9]{64}$'),
    witness JSONB NOT NULL CHECK(jsonb_typeof(witness)='object' AND octet_length(witness::text)<=8192),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((witness->>'version'='remnacust-recovery-quiescence-v1'
        AND witness->>'digest'=witness_digest
        AND witness->'request'->>'requestId'=preparation_request::text
        AND witness->'request'->>'generation'=generation::text
        AND witness->'fence'->>'state'='FENCED'
        AND witness->'frame'->'stats'='[]'::jsonb) IS TRUE)
);
CREATE INDEX xera_quota_recovery_quiescence_node ON xera_quota_recovery_quiescence(generation,node_uuid);
CREATE TRIGGER xera_quota_recovery_quiescence_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_quiescence
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_quiescence_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_quiescence
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
