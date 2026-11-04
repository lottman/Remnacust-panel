CREATE TABLE xera_autoselect_routes (
    uuid UUID PRIMARY KEY,
    owner_host_uuid UUID NOT NULL REFERENCES hosts(uuid) ON DELETE CASCADE,
    source_host_uuid UUID REFERENCES hosts(uuid) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(owner_host_uuid, source_host_uuid),
    CHECK (owner_host_uuid IS DISTINCT FROM source_host_uuid),
    CHECK (uuid <> owner_host_uuid AND uuid IS DISTINCT FROM source_host_uuid)
);
CREATE INDEX xera_autoselect_routes_source ON xera_autoselect_routes(source_host_uuid);

CREATE TABLE xera_autoselect_identities (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_uuid UUID NOT NULL REFERENCES xera_autoselect_routes(uuid) ON DELETE CASCADE,
    device_key TEXT NOT NULL,
    hwid TEXT,
    parent_vless_uuid UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, route_uuid, device_key),
    CHECK (device_key = COALESCE(hwid, ''))
);
CREATE INDEX xera_autoselect_identities_route ON xera_autoselect_identities(route_uuid);

CREATE FUNCTION xera_subscription_identity_allowed(p_user BIGINT, p_host UUID, p_hwid TEXT, p_parent UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT xera_host_identity_allowed(p_user,p_host,p_hwid,p_parent)
      OR EXISTS (SELECT 1 FROM xera_autoselect_routes r
          WHERE r.uuid=p_host AND r.source_host_uuid IS NOT NULL
            AND xera_host_identity_allowed(p_user,r.owner_host_uuid,p_hwid,p_parent)
            AND xera_host_user_allowed(p_user,r.source_host_uuid));
$$;
