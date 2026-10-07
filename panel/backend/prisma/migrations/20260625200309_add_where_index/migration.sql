--
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_pending_expire_idx
    ON users (expire_at)
    WHERE status IN ('ACTIVE', 'LIMITED');
