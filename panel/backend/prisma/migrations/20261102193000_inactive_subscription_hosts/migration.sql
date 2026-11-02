CREATE OR REPLACE FUNCTION xera_host_user_allowed(p_user_id BIGINT, p_host_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS (
    SELECT 1 FROM hosts h JOIN users u ON u.id = p_user_id
    JOIN internal_squad_inbounds si ON si.inbound_uuid = h.config_profile_inbound_uuid
    JOIN internal_squad_members sm ON sm.internal_squad_uuid = si.internal_squad_uuid AND sm.user_id = u.id
    WHERE h.uuid = p_host_uuid AND NOT h.is_disabled
      AND (EXISTS (SELECT 1 FROM internal_squad_host_links hl
                   WHERE hl.host_uuid = h.uuid AND hl.squad_uuid = si.internal_squad_uuid)
           = (h.internal_squads_mode = 'ALLOW_ONLY'))
      AND ((u.status = 'ACTIVE' AND u.expire_at > now() AND NOT h.only_when_inactive)
        OR (h.always_available AND (u.status IN ('EXPIRED','DISABLED','FROZEN','LIMITED')
             OR (u.status = 'ACTIVE' AND u.expire_at <= now()))))
 );
$$;

UPDATE subscription_settings
SET custom_remarks = jsonb_set(custom_remarks, '{frozenUsers}', '["❄ Subscription frozen","Contact support"]'::jsonb)
WHERE jsonb_typeof(custom_remarks) = 'object' AND NOT custom_remarks ? 'frozenUsers';

UPDATE external_squads
SET custom_remarks = jsonb_set(custom_remarks, '{frozenUsers}', '["❄ Subscription frozen","Contact support"]'::jsonb)
WHERE jsonb_typeof(custom_remarks) = 'object' AND NOT custom_remarks ? 'frozenUsers';
