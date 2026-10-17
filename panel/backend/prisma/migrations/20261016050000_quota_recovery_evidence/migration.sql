-- Inspection results can be replaced. Their original journal and SQL comparison
-- inputs must remain available to a later, explicit reconciliation decision.
CREATE TABLE xera_quota_recovery_artifacts (
    digest TEXT PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'),
    kind TEXT NOT NULL CHECK(kind IN ('NODE_JOURNAL','SQL_CHUNK')),
    raw_bytes INTEGER NOT NULL CHECK(raw_bytes BETWEEN 1 AND 33554432),
    compressed_sha256 TEXT NOT NULL CHECK(compressed_sha256 ~ '^[a-f0-9]{64}$'),
    compressed BYTEA NOT NULL CHECK(octet_length(compressed) BETWEEN 1 AND 33619968),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK(encode(sha256(compressed),'hex')=compressed_sha256)
);
ALTER TABLE xera_quota_recovery_artifacts ALTER COLUMN compressed SET STORAGE EXTERNAL;

CREATE TABLE xera_quota_recovery_evidence (
    request_id UUID PRIMARY KEY,
    generation UUID NOT NULL,
    node_uuid UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    journal_digest TEXT NOT NULL REFERENCES xera_quota_recovery_artifacts(digest),
    metadata_digest TEXT NOT NULL CHECK(metadata_digest ~ '^[a-f0-9]{64}$'),
    sql_digest TEXT NOT NULL CHECK(sql_digest ~ '^[a-f0-9]{64}$'),
    sql_parts INTEGER NOT NULL CHECK(sql_parts BETWEEN 1 AND 100000),
    sql_rows BIGINT NOT NULL CHECK(sql_rows>0),
    journal_metadata JSONB NOT NULL CHECK(jsonb_typeof(journal_metadata)='object' AND octet_length(journal_metadata::text)<=4096),
    report JSONB NOT NULL CHECK(jsonb_typeof(report)='object' AND octet_length(report::text)<=65536)
);
CREATE INDEX xera_quota_recovery_evidence_history ON xera_quota_recovery_evidence(node_uuid,created_at DESC,request_id DESC);

CREATE TABLE xera_quota_recovery_evidence_parts (
    request_id UUID NOT NULL REFERENCES xera_quota_recovery_evidence(request_id) DEFERRABLE INITIALLY DEFERRED,
    ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 99999),
    section TEXT NOT NULL CHECK(section IN ('STATE','GRANTS','WATERMARKS','EXPOSURES')),
    digest TEXT NOT NULL REFERENCES xera_quota_recovery_artifacts(digest),
    row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 500),
    PRIMARY KEY(request_id,ordinal)
);

CREATE FUNCTION xera_guard_quota_recovery_evidence() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'quota recovery evidence is immutable';
END;
$$;
CREATE TRIGGER xera_quota_recovery_artifacts_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_artifacts
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_evidence_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_evidence
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_parts_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_evidence_parts
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_artifacts_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_artifacts
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_evidence_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_evidence
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_parts_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_evidence_parts
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();

CREATE FUNCTION xera_check_quota_recovery_evidence() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE evidence xera_quota_recovery_evidence%ROWTYPE; count_parts BIGINT; count_rows BIGINT; first_part INTEGER; last_part INTEGER; root TEXT;
BEGIN
    SELECT * INTO evidence FROM xera_quota_recovery_evidence WHERE request_id=NEW.request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'incomplete quota recovery evidence'; END IF;
    SELECT count(*),sum(row_count),min(ordinal),max(ordinal),
        encode(sha256(convert_to(string_agg(section||':'||ordinal||':'||digest||':'||row_count||E'\n','' ORDER BY ordinal),'UTF8')),'hex')
        INTO count_parts,count_rows,first_part,last_part,root FROM xera_quota_recovery_evidence_parts WHERE request_id=NEW.request_id;
    IF count_parts<>evidence.sql_parts OR count_rows<>evidence.sql_rows OR first_part<>0 OR last_part<>count_parts-1 OR root IS DISTINCT FROM evidence.sql_digest
       OR NOT EXISTS(SELECT 1 FROM xera_quota_recovery_artifacts WHERE digest=evidence.journal_digest AND kind='NODE_JOURNAL')
       OR EXISTS(SELECT 1 FROM xera_quota_recovery_evidence_parts p JOIN xera_quota_recovery_artifacts a USING(digest)
                 WHERE p.request_id=NEW.request_id AND a.kind<>'SQL_CHUNK') THEN
        RAISE EXCEPTION 'incomplete quota recovery evidence';
    END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER xera_quota_recovery_evidence_complete AFTER INSERT ON xera_quota_recovery_evidence
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xera_check_quota_recovery_evidence();
CREATE CONSTRAINT TRIGGER xera_quota_recovery_parts_complete AFTER INSERT ON xera_quota_recovery_evidence_parts
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xera_check_quota_recovery_evidence();
