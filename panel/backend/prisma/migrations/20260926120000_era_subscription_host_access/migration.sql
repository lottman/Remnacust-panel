CREATE FUNCTION era_host_subscription_allowed(p_user_id BIGINT, p_inbound_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = p_user_id
      AND (u.status = 'EXPIRED' OR (u.status = 'ACTIVE' AND u.expire_at <= now()))
      AND era_host_available(p_user_id, p_inbound_uuid)
  );
$$;
