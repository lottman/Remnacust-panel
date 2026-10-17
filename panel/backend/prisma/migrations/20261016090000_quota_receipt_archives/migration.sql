ALTER TABLE xera_quota_recovery_artifacts DROP CONSTRAINT xera_quota_recovery_artifacts_kind_check;
ALTER TABLE xera_quota_recovery_artifacts ADD CONSTRAINT xera_quota_recovery_artifacts_kind_check
    CHECK(kind IN ('NODE_JOURNAL','SQL_CHUNK','USAGE_JOURNAL'));
ALTER TABLE xera_quota_recovery_artifacts DROP CONSTRAINT xera_quota_recovery_artifacts_raw_bytes_check;
ALTER TABLE xera_quota_recovery_artifacts ADD CONSTRAINT xera_quota_recovery_artifacts_raw_bytes_check
    CHECK(raw_bytes BETWEEN CASE WHEN kind='USAGE_JOURNAL' THEN 0 ELSE 1 END AND 33554432);

CREATE TABLE xera_quota_receipt_requests (
    request_id UUID PRIMARY KEY,
    node_uuid UUID NOT NULL,
    generation UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    metadata_digest TEXT NOT NULL CHECK(metadata_digest ~ '^[a-f0-9]{64}$'),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(request_id,node_uuid)
);
CREATE INDEX xera_quota_receipt_requests_history ON xera_quota_receipt_requests(node_uuid,requested_at DESC,request_id DESC);
CREATE TABLE xera_quota_receipt_capture_leases (
    generation UUID PRIMARY KEY,
    request_id UUID NOT NULL REFERENCES xera_quota_receipt_requests(request_id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE xera_quota_receipt_captures (
    request_id UUID PRIMARY KEY,
    node_uuid UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    state TEXT NOT NULL CHECK(state IN ('PRESENT','ABSENT','INVALID','UNAVAILABLE')),
    source_digest TEXT REFERENCES xera_quota_recovery_artifacts(digest),
    source_bytes INTEGER CHECK(source_bytes BETWEEN 0 AND 8388736),
    captured_at BIGINT CHECK(captured_at BETWEEN 1 AND 253402300799999),
    payload_digest TEXT CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
    metadata JSONB CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=4096),
    reason TEXT CHECK(reason IN ('INVALID_JOURNAL','SOURCE_ABSENT','NODE_UNAVAILABLE','INVALID_RESPONSE')),
    FOREIGN KEY(request_id,node_uuid) REFERENCES xera_quota_receipt_requests(request_id,node_uuid),
    CHECK((state IN ('PRESENT','INVALID') AND source_digest IS NOT NULL AND source_bytes IS NOT NULL)
        OR (state NOT IN ('PRESENT','INVALID') AND source_digest IS NULL AND source_bytes IS NULL)),
    CHECK((state='UNAVAILABLE' AND captured_at IS NULL AND payload_digest IS NULL)
        OR (state<>'UNAVAILABLE' AND captured_at IS NOT NULL AND payload_digest IS NOT NULL)),
    CHECK((state='PRESENT')=(metadata IS NOT NULL)),
    CHECK((state='PRESENT')=(reason IS NULL)),
    CHECK((state='PRESENT' AND reason IS NULL) OR (state='ABSENT' AND reason='SOURCE_ABSENT')
        OR (state='INVALID' AND reason='INVALID_JOURNAL') OR (state='UNAVAILABLE' AND reason IN ('NODE_UNAVAILABLE','INVALID_RESPONSE')))
);
CREATE FUNCTION xera_check_quota_receipt_artifact() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.source_digest IS NOT NULL AND NOT EXISTS(SELECT 1 FROM xera_quota_recovery_artifacts
        WHERE digest=NEW.source_digest AND kind='USAGE_JOURNAL' AND raw_bytes=NEW.source_bytes) THEN
        RAISE EXCEPTION 'quota receipt source artifact differs';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_quota_receipt_artifact BEFORE INSERT ON xera_quota_receipt_captures
    FOR EACH ROW EXECUTE FUNCTION xera_check_quota_receipt_artifact();
CREATE TRIGGER xera_quota_receipt_requests_immutable BEFORE UPDATE OR DELETE ON xera_quota_receipt_requests
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_receipt_requests_no_truncate BEFORE TRUNCATE ON xera_quota_receipt_requests
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_receipt_captures_immutable BEFORE UPDATE OR DELETE ON xera_quota_receipt_captures
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_receipt_captures_no_truncate BEFORE TRUNCATE ON xera_quota_receipt_captures
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
