ALTER TABLE "hosts" ADD COLUMN "always_available" BOOLEAN NOT NULL DEFAULT false;

CREATE FUNCTION era_host_available(p_user_id BIGINT, p_inbound_uuid UUID)
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
      AND NOT EXISTS (SELECT 1 FROM hosts ordinary
                      WHERE ordinary.config_profile_inbound_uuid = p_inbound_uuid
                        AND NOT ordinary.always_available)
  );
$$;
