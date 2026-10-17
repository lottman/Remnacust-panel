-- A pause is restrictive admission control, never a financial approval or a
-- reason to clear the restore barrier. Keep the intent even if an RPC is lost.
CREATE TABLE xera_quota_recovery_actions (
    request_id UUID NOT NULL,
    phase TEXT NOT NULL CHECK(phase IN ('REQUESTED','OBSERVED')),
    generation UUID NOT NULL,
    node_uuid UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    action TEXT NOT NULL CHECK(action='PAUSE'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    details JSONB NOT NULL CHECK(jsonb_typeof(details)='object' AND octet_length(details::text)<=65536),
    PRIMARY KEY(request_id,phase)
);
CREATE INDEX xera_quota_recovery_actions_history ON xera_quota_recovery_actions(node_uuid,created_at DESC,request_id DESC);
CREATE TRIGGER xera_quota_recovery_actions_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_actions
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_recovery_actions_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_actions
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE FUNCTION xera_check_quota_recovery_action() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.phase='OBSERVED' AND NOT EXISTS(SELECT 1 FROM xera_quota_recovery_actions a
        WHERE a.request_id=NEW.request_id AND a.phase='REQUESTED' AND a.generation=NEW.generation
            AND a.node_uuid=NEW.node_uuid AND a.actor_uuid=NEW.actor_uuid AND a.action=NEW.action) THEN
        RAISE EXCEPTION 'quota recovery observation requires its original intent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_quota_recovery_action_context BEFORE INSERT ON xera_quota_recovery_actions
    FOR EACH ROW EXECUTE FUNCTION xera_check_quota_recovery_action();
