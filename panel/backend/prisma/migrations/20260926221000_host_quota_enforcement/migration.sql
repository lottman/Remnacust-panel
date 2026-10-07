ALTER TABLE xera_host_tag_limits ADD COLUMN speed_limit_mbps INTEGER;
ALTER TABLE xera_host_tag_limits DROP CONSTRAINT xera_host_tag_limits_user_traffic_limit_bytes_check;
ALTER TABLE xera_host_tag_limits ADD CONSTRAINT tag_has_limit
    CHECK (user_traffic_limit_bytes >= 0 AND (user_traffic_limit_bytes > 0 OR COALESCE(speed_limit_mbps, 0) > 0));
ALTER TABLE hosts ADD COLUMN server_speed_limit_mbps INTEGER
    CHECK (server_speed_limit_mbps IS NULL OR server_speed_limit_mbps BETWEEN 0 AND 10000);
ALTER TABLE xera_host_tag_limits ADD CONSTRAINT tag_speed_range
    CHECK (speed_limit_mbps IS NULL OR speed_limit_mbps BETWEEN 0 AND 10000);

-- Billing history retention must not reset a host's long-running quota.
CREATE TABLE xera_quota_usage (
    node_id BIGINT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATE NOT NULL,
    total_bytes BIGINT NOT NULL CHECK (total_bytes >= 0),
    PRIMARY KEY (node_id, user_id, created_at)
);
CREATE INDEX xera_quota_usage_user_day ON xera_quota_usage(user_id, created_at);
INSERT INTO xera_quota_usage SELECT node_id, user_id, created_at, total_bytes
FROM nodes_user_usage_history;

CREATE FUNCTION xera_record_quota_usage() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE delta BIGINT;
BEGIN
    delta := NEW.total_bytes - CASE WHEN TG_OP = 'UPDATE' THEN OLD.total_bytes ELSE 0 END;
    IF delta > 0 THEN
        INSERT INTO xera_quota_usage (node_id, user_id, created_at, total_bytes)
        VALUES (NEW.node_id, NEW.user_id, NEW.created_at, delta)
        ON CONFLICT (node_id, user_id, created_at) DO UPDATE
        SET total_bytes = xera_quota_usage.total_bytes + EXCLUDED.total_bytes;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_record_quota_usage AFTER INSERT OR UPDATE ON nodes_user_usage_history
FOR EACH ROW EXECUTE FUNCTION xera_record_quota_usage();
