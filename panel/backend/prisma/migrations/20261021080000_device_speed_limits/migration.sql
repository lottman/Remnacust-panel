ALTER TABLE hosts
    ADD COLUMN device_speed_limit_mbps integer,
    ADD COLUMN use_tag_device_speed_limit boolean NOT NULL DEFAULT true,
    ADD CONSTRAINT hosts_device_speed_limit_check
        CHECK (device_speed_limit_mbps IS NULL OR device_speed_limit_mbps BETWEEN 0 AND 10000);

ALTER TABLE xera_host_tag_limits
    ADD COLUMN device_speed_limit_mbps integer,
    ADD CONSTRAINT host_tag_device_speed_limit_check
        CHECK (device_speed_limit_mbps IS NULL OR device_speed_limit_mbps BETWEEN 0 AND 10000);
