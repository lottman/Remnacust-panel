CREATE TABLE xera_device_reconciliation (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hwid TEXT NOT NULL,
    revision UUID NOT NULL DEFAULT gen_random_uuid(),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, hwid)
);
CREATE INDEX xera_device_reconciliation_due_idx ON xera_device_reconciliation(next_attempt_at);

CREATE TABLE xera_device_state (
    id INTEGER PRIMARY KEY CHECK (id=1),
    revision BIGINT NOT NULL DEFAULT 1
);
INSERT INTO xera_device_state(id) VALUES(1);
CREATE FUNCTION xera_bump_device_state() RETURNS TRIGGER AS $$
BEGIN
    UPDATE xera_device_state SET revision=revision+1 WHERE id=1;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER xera_device_state_changed
    AFTER INSERT OR DELETE OR UPDATE OF blocked ON hwid_user_devices
    FOR EACH STATEMENT EXECUTE FUNCTION xera_bump_device_state();
