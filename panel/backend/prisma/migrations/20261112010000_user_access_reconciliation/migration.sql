CREATE TABLE xera_user_access_reconciliation (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    revision UUID NOT NULL DEFAULT gen_random_uuid(),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX xera_user_access_reconciliation_due_idx ON xera_user_access_reconciliation(next_attempt_at,user_id);

CREATE FUNCTION xera_queue_user_access() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO xera_user_access_reconciliation(user_id) VALUES(NEW.id)
    ON CONFLICT(user_id) DO UPDATE SET revision=gen_random_uuid(),attempts=0,next_attempt_at=now();
    RETURN NULL;
END;
$$;
CREATE TRIGGER xera_user_access_changed AFTER UPDATE ON users
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.expire_at IS DISTINCT FROM NEW.expire_at)
EXECUTE FUNCTION xera_queue_user_access();

INSERT INTO xera_user_access_reconciliation(user_id) SELECT id FROM users WHERE status='FROZEN';
