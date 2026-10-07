-- Issued identities contain no derived authentication secrets. The parent key
-- snapshot makes subscription rotation invalidate old identities immediately.
CREATE TABLE xera_host_identities (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    host_uuid UUID NOT NULL REFERENCES hosts(uuid) ON DELETE CASCADE,
    device_key TEXT NOT NULL,
    hwid TEXT,
    parent_vless_uuid UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, host_uuid, device_key),
    CHECK (device_key = COALESCE(hwid, ''))
);
CREATE INDEX xera_host_identities_host ON xera_host_identities(host_uuid);

CREATE TABLE xera_host_quota_usage (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    host_uuid UUID NOT NULL REFERENCES hosts(uuid) ON DELETE CASCADE,
    node_id BIGINT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    created_at DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
    total_bytes BIGINT NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
    PRIMARY KEY (user_id, host_uuid, node_id, created_at)
);
CREATE INDEX xera_host_quota_usage_host ON xera_host_quota_usage(host_uuid, created_at);

CREATE FUNCTION xera_host_user_allowed(p_user_id BIGINT, p_host_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS (
    SELECT 1 FROM hosts h JOIN users u ON u.id = p_user_id
    JOIN internal_squad_inbounds si ON si.inbound_uuid = h.config_profile_inbound_uuid
    JOIN internal_squad_members sm ON sm.internal_squad_uuid = si.internal_squad_uuid AND sm.user_id = u.id
    WHERE h.uuid = p_host_uuid AND NOT h.is_disabled AND NOT h.is_hidden
      AND (EXISTS (SELECT 1 FROM internal_squad_host_links hl
                   WHERE hl.host_uuid = h.uuid AND hl.squad_uuid = si.internal_squad_uuid)
           = (h.internal_squads_mode = 'ALLOW_ONLY'))
      AND ((u.status = 'ACTIVE' AND u.expire_at > now() AND NOT h.only_when_inactive)
        OR (h.always_available AND (u.status IN ('EXPIRED','DISABLED') OR (u.status = 'ACTIVE' AND u.expire_at <= now()))))
 );
$$;

CREATE FUNCTION xera_host_identity_allowed(p_user_id BIGINT, p_host_uuid UUID, p_hwid TEXT, p_parent UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT xera_host_user_allowed(p_user_id, p_host_uuid)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.vless_uuid = p_parent)
    AND CASE WHEN p_hwid IS NULL THEN
        NOT EXISTS (SELECT 1 FROM hwid_user_devices d WHERE d.user_id = p_user_id AND d.blocked)
        AND NOT EXISTS (SELECT 1 FROM xera_hwid_registration_policy r WHERE r.user_id=p_user_id AND NOT r.registration_allowed)
      ELSE EXISTS (SELECT 1 FROM hwid_user_devices d WHERE d.user_id = p_user_id AND d.hwid = p_hwid AND NOT d.blocked)
    END;
$$;

-- Shared inbounds are allowed: host identity policy enforces each host's access.
CREATE OR REPLACE FUNCTION era_host_available(p_user_id BIGINT, p_inbound_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS (
    SELECT 1 FROM hosts h
    JOIN internal_squad_inbounds si ON si.inbound_uuid = h.config_profile_inbound_uuid
    JOIN internal_squad_members sm ON sm.internal_squad_uuid = si.internal_squad_uuid
    WHERE sm.user_id = p_user_id AND h.config_profile_inbound_uuid = p_inbound_uuid
      AND h.always_available AND NOT h.is_disabled AND NOT h.is_hidden
      AND (EXISTS (SELECT 1 FROM internal_squad_host_links hl
                   WHERE hl.host_uuid = h.uuid AND hl.squad_uuid = si.internal_squad_uuid)
           = (h.internal_squads_mode = 'ALLOW_ONLY'))
 );
$$;

CREATE OR REPLACE FUNCTION era_inbound_only_when_inactive(p_user_id BIGINT, p_inbound_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM hosts WHERE config_profile_inbound_uuid = p_inbound_uuid AND only_when_inactive)
    AND NOT EXISTS (SELECT 1 FROM hosts WHERE config_profile_inbound_uuid = p_inbound_uuid AND NOT only_when_inactive);
$$;

ALTER TABLE hosts ADD COLUMN total_speed_limit_mbps INTEGER CHECK (total_speed_limit_mbps >= 0 AND total_speed_limit_mbps <= 10000);
ALTER TABLE hosts ADD COLUMN traffic_multiplier DOUBLE PRECISION CHECK (traffic_multiplier BETWEEN 0.01 AND 100 AND round(traffic_multiplier::numeric,2)=traffic_multiplier::numeric);

ALTER TABLE xera_host_tag_limits ADD COLUMN total_speed_limit_mbps INTEGER CHECK(total_speed_limit_mbps BETWEEN 0 AND 10000);
ALTER TABLE xera_host_tag_limits ADD COLUMN traffic_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (traffic_multiplier BETWEEN 0.01 AND 100 AND round(traffic_multiplier::numeric,2)=traffic_multiplier::numeric);

-- Idempotent replay after a database outage or a worker stopping before Redis acknowledgement.
CREATE TABLE xera_host_usage_receipts (id UUID PRIMARY KEY,node_id BIGINT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX xera_host_usage_receipts_created ON xera_host_usage_receipts(created_at);

ALTER TABLE xera_host_tag_limits DROP CONSTRAINT tag_has_limit;
ALTER TABLE xera_host_tag_limits ADD CONSTRAINT tag_nonnegative_limit CHECK(user_traffic_limit_bytes>=0);

-- Preserve existing quotas where the former node-based data identifies one host.
WITH owners AS (
 SELECT n.id AS node_id, min(h.uuid::text)::uuid AS host_uuid
 FROM nodes n JOIN hosts_to_nodes hn ON hn.node_uuid=n.uuid JOIN hosts h ON h.uuid=hn.host_uuid
 GROUP BY n.id HAVING count(DISTINCT h.uuid)=1
)
INSERT INTO xera_host_quota_usage(user_id,host_uuid,node_id,created_at,total_bytes)
SELECT q.user_id,o.host_uuid,q.node_id,q.created_at,q.total_bytes FROM xera_quota_usage q JOIN owners o ON o.node_id=q.node_id;

-- Shared tag history cannot be honestly assigned to one host. Keep that baseline
-- in its original group, separate from the new accurately attributed journal.
CREATE TABLE xera_legacy_tag_quota_usage (
 tag TEXT NOT NULL REFERENCES xera_host_tag_limits(tag) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 node_id BIGINT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
 created_at DATE NOT NULL,total_bytes BIGINT NOT NULL CHECK(total_bytes>=0),
 PRIMARY KEY(tag,user_id,node_id,created_at)
);
INSERT INTO xera_legacy_tag_quota_usage(tag,user_id,node_id,created_at,total_bytes)
SELECT DISTINCT l.tag,q.user_id,q.node_id,q.created_at,q.total_bytes
FROM xera_host_tag_limits l JOIN hosts h ON l.tag=ANY(h.tags)
JOIN hosts_to_nodes hn ON hn.host_uuid=h.uuid JOIN nodes n ON n.uuid=hn.node_uuid
JOIN xera_quota_usage q ON q.node_id=n.id
WHERE (SELECT count(DISTINCT other.host_uuid) FROM hosts_to_nodes other WHERE other.node_uuid=n.uuid)>1;
