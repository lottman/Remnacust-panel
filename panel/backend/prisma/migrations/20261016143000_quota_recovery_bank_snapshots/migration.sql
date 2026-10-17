CREATE TABLE xera_quota_recovery_banks (
    request_id UUID PRIMARY KEY,
    generation UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    version TEXT NOT NULL CHECK(version='remnacust-quota-bank-v1'),
    catalog_text TEXT NOT NULL CHECK(octet_length(catalog_text)<=8192
        AND jsonb_typeof(catalog_text::jsonb)='array' AND jsonb_array_length(catalog_text::jsonb) BETWEEN 1 AND 128),
    source_digest TEXT NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
    part_count INTEGER NOT NULL CHECK(part_count BETWEEN 1 AND 100000),
    row_count BIGINT NOT NULL CHECK(row_count>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX xera_quota_recovery_bank_history ON xera_quota_recovery_banks(created_at DESC,request_id DESC);
CREATE TABLE xera_quota_recovery_bank_parts (
    request_id UUID NOT NULL REFERENCES xera_quota_recovery_banks(request_id) DEFERRABLE INITIALLY DEFERRED,
    ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 99999),
    section TEXT NOT NULL CHECK(section ~ '^[a-z_]{1,100}$'),
    digest TEXT NOT NULL REFERENCES xera_quota_recovery_artifacts(digest),
    row_count INTEGER NOT NULL CHECK(row_count BETWEEN 0 AND 500),
    PRIMARY KEY(request_id,ordinal)
);
CREATE TRIGGER xera_quota_recovery_banks_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_banks
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_banks_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_banks
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_bank_parts_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_bank_parts
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_bank_parts_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_bank_parts
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();

CREATE FUNCTION xera_check_quota_recovery_bank() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE bank xera_quota_recovery_banks%ROWTYPE; parts BIGINT; count_rows BIGINT; first_part INTEGER; last_part INTEGER; sections BIGINT; root TEXT;
BEGIN
    SELECT * INTO bank FROM xera_quota_recovery_banks WHERE request_id=NEW.request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'incomplete recovery bank'; END IF;
    SELECT count(*),COALESCE(sum(row_count),0),min(ordinal),max(ordinal),count(DISTINCT section),
      encode(sha256(convert_to(bank.version||E'\n'||bank.catalog_text||E'\n'||
        string_agg(section||':'||ordinal||':'||digest||':'||row_count||E'\n','' ORDER BY ordinal),'UTF8')),'hex')
      INTO parts,count_rows,first_part,last_part,sections,root FROM xera_quota_recovery_bank_parts WHERE request_id=NEW.request_id;
    IF parts<>bank.part_count OR count_rows<>bank.row_count OR first_part<>0 OR last_part<>parts-1
      OR root IS DISTINCT FROM bank.source_digest OR sections<>jsonb_array_length(bank.catalog_text::jsonb)
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(bank.catalog_text::jsonb))<>sections
      OR EXISTS(SELECT 1 FROM xera_quota_recovery_bank_parts p JOIN xera_quota_recovery_artifacts a USING(digest)
          WHERE p.request_id=NEW.request_id AND (a.kind<>'SQL_CHUNK' OR NOT (bank.catalog_text::jsonb ? p.section))) THEN
        RAISE EXCEPTION 'incomplete recovery bank';
    END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER xera_quota_recovery_bank_complete AFTER INSERT ON xera_quota_recovery_banks
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xera_check_quota_recovery_bank();
CREATE CONSTRAINT TRIGGER xera_quota_recovery_bank_parts_complete AFTER INSERT ON xera_quota_recovery_bank_parts
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xera_check_quota_recovery_bank();
