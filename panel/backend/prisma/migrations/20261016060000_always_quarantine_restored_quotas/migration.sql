-- A backup from before enrollment has no financial rows to inspect. That is
-- not proof that already running nodes have no grants or outstanding RAM usage.
-- Fresh installation does not call this controlled-restore function.
CREATE OR REPLACE FUNCTION xera_quarantine_restored_quotas() RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO xera_quota_restore_state(singleton,generation,restored_at)
        VALUES(true,gen_random_uuid(),clock_timestamp()) ON CONFLICT(singleton) DO UPDATE
        SET generation=excluded.generation,restored_at=excluded.restored_at,reconciled_at=NULL,reconciliation_note=NULL;
    RETURN true;
END;
$$;
