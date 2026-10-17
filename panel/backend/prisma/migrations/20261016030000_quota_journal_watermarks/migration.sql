-- One monotonic observation per historical node journal, not per refresh.
-- Node deletion and a new incarnation must not erase the old boundary.
CREATE TABLE xera_quota_journal_watermarks (
    node_uuid UUID NOT NULL,
    instance_uuid UUID NOT NULL UNIQUE,
    sequence BIGINT NOT NULL CHECK(sequence>=0 AND sequence<=9007199254740991),
    policy_revision BIGINT NOT NULL CHECK(policy_revision>=0),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(node_uuid,instance_uuid)
);
CREATE FUNCTION xera_observe_quota_journal(p_node UUID,p_instance UUID,p_sequence BIGINT,p_revision BIGINT)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE previous xera_quota_journal_watermarks%ROWTYPE; bound_instance UUID;
BEGIN
    IF p_node IS NULL OR p_instance IS NULL OR p_sequence IS NULL OR p_sequence<0 OR p_sequence>9007199254740991 OR p_revision IS NULL OR p_revision<0 THEN
        RAISE EXCEPTION 'QUOTA_JOURNAL_INVALID_CHECKPOINT';
    END IF;
    -- Same lock order as policy delivery and receipt commits.
    SELECT instance_uuid INTO bound_instance FROM xera_quota_node_modes WHERE node_uuid=p_node FOR UPDATE;
    IF (FOUND AND bound_instance IS DISTINCT FROM p_instance) OR
       (NOT FOUND AND NOT EXISTS(SELECT 1 FROM xera_quota_reserves WHERE node_uuid=p_node AND instance_uuid=p_instance)) THEN
        RAISE EXCEPTION 'QUOTA_JOURNAL_INSTANCE_REQUIRES_RECOVERY';
    END IF;
    IF EXISTS(SELECT 1 FROM xera_quota_journal_watermarks WHERE instance_uuid=p_instance AND node_uuid<>p_node) THEN
        RAISE EXCEPTION 'QUOTA_JOURNAL_ALREADY_ENROLLED';
    END IF;
    SELECT * INTO previous FROM xera_quota_journal_watermarks WHERE node_uuid=p_node AND instance_uuid=p_instance FOR UPDATE;
    IF FOUND AND (p_sequence<previous.sequence OR p_revision<previous.policy_revision) THEN
        RAISE EXCEPTION 'QUOTA_JOURNAL_BEHIND_CHECKPOINT';
    END IF;
    INSERT INTO xera_quota_journal_watermarks(node_uuid,instance_uuid,sequence,policy_revision)
        VALUES(p_node,p_instance,p_sequence,p_revision)
        ON CONFLICT(node_uuid,instance_uuid) DO UPDATE SET sequence=excluded.sequence,policy_revision=excluded.policy_revision,
            observed_at=CASE WHEN excluded.sequence>xera_quota_journal_watermarks.sequence OR excluded.policy_revision>xera_quota_journal_watermarks.policy_revision
                THEN clock_timestamp() ELSE xera_quota_journal_watermarks.observed_at END;
    RETURN p_sequence;
END;
$$;
CREATE FUNCTION xera_guard_quota_journal_watermark() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.node_uuid IS DISTINCT FROM NEW.node_uuid OR OLD.instance_uuid IS DISTINCT FROM NEW.instance_uuid
       OR NEW.sequence<OLD.sequence OR NEW.policy_revision<OLD.policy_revision THEN
        RAISE EXCEPTION 'quota journal watermark cannot move backwards';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_quota_journal_watermark_history BEFORE UPDATE ON xera_quota_journal_watermarks
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_journal_watermark();

CREATE TABLE xera_quota_restore_state (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
    generation UUID NOT NULL,
    restored_at TIMESTAMPTZ NOT NULL,
    reconciled_at TIMESTAMPTZ,
    reconciliation_note TEXT
);
CREATE FUNCTION xera_quarantine_restored_quotas() RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM xera_quota_node_modes) AND NOT EXISTS(SELECT 1 FROM xera_quota_reserves)
       AND NOT EXISTS(SELECT 1 FROM xera_quota_usage_exposures)
       AND NOT EXISTS(SELECT 1 FROM xera_quota_journal_watermarks) THEN RETURN false; END IF;
    INSERT INTO xera_quota_restore_state(singleton,generation,restored_at)
        VALUES(true,gen_random_uuid(),clock_timestamp()) ON CONFLICT(singleton) DO UPDATE
        SET generation=excluded.generation,restored_at=excluded.restored_at,reconciled_at=NULL,reconciliation_note=NULL;
    RETURN true;
END;
$$;
CREATE FUNCTION xera_assert_quota_restore_reconciled() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS(SELECT 1 FROM xera_quota_restore_state WHERE reconciled_at IS NULL) THEN
        RAISE EXCEPTION 'QUOTA_RESTORE_REQUIRES_RECONCILIATION';
    END IF;
END;
$$;
CREATE FUNCTION xera_guard_restored_quota_credit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (TG_OP='INSERT' AND NEW.ceiling_bytes>0) OR
       (TG_OP='UPDATE' AND (NEW.ceiling_bytes>OLD.ceiling_bytes OR
            (OLD.activation_revision IS NULL AND NEW.activation_revision IS NOT NULL))) THEN
        PERFORM xera_assert_quota_restore_reconciled();
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_quota_restored_credit BEFORE INSERT OR UPDATE OF ceiling_bytes,activation_revision ON xera_quota_reserves
    FOR EACH ROW EXECUTE FUNCTION xera_guard_restored_quota_credit();
