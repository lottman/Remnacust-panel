ALTER TABLE hosts ADD COLUMN only_when_inactive BOOLEAN NOT NULL DEFAULT false;
-- Preserve the exclusive behavior of already configured exception hosts.
UPDATE hosts SET only_when_inactive = true WHERE always_available;
ALTER TABLE hosts ADD CONSTRAINT hosts_inactive_requires_exception
    CHECK (NOT only_when_inactive OR always_available);

CREATE FUNCTION era_inbound_only_when_inactive(p_user_id BIGINT, p_inbound_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM hosts h
        WHERE h.config_profile_inbound_uuid = p_inbound_uuid AND h.only_when_inactive
    );
$$;

CREATE OR REPLACE FUNCTION era_host_subscription_allowed(p_user_id BIGINT, p_inbound_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM users u WHERE u.id = p_user_id
        AND (u.status IN ('EXPIRED', 'DISABLED') OR (u.status = 'ACTIVE' AND u.expire_at <= now()))
        AND era_host_available(p_user_id, p_inbound_uuid)
    );
$$;
