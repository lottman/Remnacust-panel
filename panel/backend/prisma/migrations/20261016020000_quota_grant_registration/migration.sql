-- Existing grants remain legacy liabilities. Only newly allocated grants can
-- assert never-activated cancellation; history must not be reclassified.
ALTER TABLE xera_quota_reserves ADD COLUMN registration_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE xera_quota_reserves ALTER COLUMN registration_required SET DEFAULT true;
ALTER TABLE xera_quota_reserves
    ADD COLUMN registration_revision BIGINT,
    ADD COLUMN registration_action TEXT,
    ADD COLUMN registered_revision BIGINT,
    ADD COLUMN registered_sequence BIGINT,
    ADD COLUMN activation_revision BIGINT,
    ADD CONSTRAINT xera_quota_registration_intent CHECK (
        (registration_revision IS NULL AND registration_action IS NULL) OR
        (registration_required AND registration_revision IS NOT NULL AND registration_action IS NOT NULL AND registration_revision>0 AND registration_action IN ('prepare','cancel'))),
    ADD CONSTRAINT xera_quota_registration_ack CHECK (
        (registered_revision IS NULL AND registered_sequence IS NULL) OR
        (registration_required AND registered_revision IS NOT NULL AND registered_sequence IS NOT NULL AND registered_revision>0 AND registered_sequence>=0)),
    ADD CONSTRAINT xera_quota_registration_activation CHECK (
        activation_revision IS NULL OR (registration_required AND registered_revision IS NOT NULL AND activation_revision>registered_revision));
ALTER TABLE xera_quota_node_modes ADD COLUMN grant_registration BOOLEAN NOT NULL DEFAULT false;

CREATE FUNCTION xera_guard_quota_registration() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.registration_required IS DISTINCT FROM NEW.registration_required
       OR (OLD.registered_revision IS NOT NULL AND (OLD.registered_revision IS DISTINCT FROM NEW.registered_revision OR OLD.registered_sequence IS DISTINCT FROM NEW.registered_sequence))
       OR (OLD.activation_revision IS NOT NULL AND OLD.activation_revision IS DISTINCT FROM NEW.activation_revision)
       OR (OLD.registration_revision IS NOT NULL AND (NEW.registration_revision IS NULL OR NEW.registration_revision<OLD.registration_revision)) THEN
        RAISE EXCEPTION 'quota registration history cannot be rewritten';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_quota_registration_history BEFORE UPDATE ON xera_quota_reserves
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_registration();
CREATE INDEX xera_quota_registrations_pending ON xera_quota_reserves(node_uuid,id)
    WHERE registration_required AND closed_usage_bytes IS NULL;

-- A durable preparation ACK is not an activation ACK. Keep the UI's reset
-- progress pending until the policy actually containing the grant is applied.
CREATE OR REPLACE FUNCTION xera_ack_quota_epoch(p_node UUID,p_instance UUID,p_revision BIGINT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE acknowledged INTEGER;
BEGIN
    IF p_revision IS NULL OR p_revision<=0 OR NOT EXISTS(
      SELECT 1 FROM xera_node_policy_revisions WHERE node_uuid=p_node AND revision>=p_revision
    ) THEN RAISE EXCEPTION 'quota acknowledgement revision is not committed'; END IF;
    UPDATE xera_quota_node_epochs e SET applied_epoch=desired_epoch,applied_revision=p_revision,updated_at=now()
      WHERE e.node_uuid=p_node AND e.instance_uuid=p_instance AND e.desired_revision=p_revision
      AND NOT EXISTS(SELECT 1 FROM xera_quota_reserves g WHERE
        (g.kind,g.key,g.user_id,g.window_start,g.budget_epoch,g.node_uuid,g.instance_uuid)=
        (e.kind,e.key,e.user_id,e.window_start,e.desired_epoch,e.node_uuid,e.instance_uuid)
        AND g.closed_usage_bytes IS NULL AND g.retired_at IS NULL AND g.registration_required
        AND (g.activation_revision IS NULL OR g.activation_revision>p_revision));
    GET DIAGNOSTICS acknowledged=ROW_COUNT;
    RETURN acknowledged;
END;
$$;
