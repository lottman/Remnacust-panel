CREATE TABLE xera_node_port_plans (
    node_uuid UUID PRIMARY KEY REFERENCES nodes(uuid) ON DELETE CASCADE,
    revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),
    enabled BOOLEAN NOT NULL DEFAULT true,
    applied_revision BIGINT CHECK(applied_revision>0 AND applied_revision<=revision),
    applied_hash TEXT CHECK(applied_hash ~ '^[a-f0-9]{64}$'),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPLIED','ERROR')),
    error_code TEXT CHECK(length(error_code)<=100),
    last_request_id UUID,
    last_request_hash TEXT CHECK(last_request_hash ~ '^[a-f0-9]{64}$'),
    apply_after TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    apply_attempts INTEGER NOT NULL DEFAULT 0 CHECK(apply_attempts>=0),
    delivery_owner UUID,
    delivery_until TIMESTAMPTZ,
    delivery_epoch BIGINT NOT NULL DEFAULT 0 CHECK(delivery_epoch>=0),
    CHECK((delivery_owner IS NULL)=(delivery_until IS NULL)),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- The pair is logically unique already through uuid. The explicit constraint
-- lets PostgreSQL enforce that a selected inbound belongs to its given profile.
ALTER TABLE config_profile_inbounds ADD CONSTRAINT xera_port_profile_inbound_pair UNIQUE(profile_uuid,uuid);
CREATE TABLE xera_node_port_bindings (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_uuid UUID NOT NULL REFERENCES xera_node_port_plans(node_uuid) ON DELETE CASCADE,
    config_profile_uuid UUID NOT NULL REFERENCES config_profiles(uuid) ON DELETE RESTRICT,
    config_profile_inbound_uuid UUID NOT NULL,
    listen_address INET NOT NULL,
    port INTEGER NOT NULL CHECK(port BETWEEN 1 AND 65535),
    networks TEXT[] NOT NULL CHECK(array_ndims(networks)=1 AND array_lower(networks,1)=1 AND cardinality(networks) BETWEEN 1 AND 2 AND networks<@ARRAY['tcp','udp']::text[]
      AND array_position(networks,NULL) IS NULL AND (cardinality(networks)=1 OR networks[1]<>networks[2])),
    FOREIGN KEY(config_profile_uuid,config_profile_inbound_uuid) REFERENCES config_profile_inbounds(profile_uuid,uuid) ON DELETE RESTRICT,
    FOREIGN KEY(config_profile_inbound_uuid,node_uuid) REFERENCES config_profile_inbounds_to_nodes(config_profile_inbound_uuid,node_uuid)
      DEFERRABLE INITIALLY DEFERRED,
    UNIQUE(node_uuid,config_profile_inbound_uuid),
    CHECK(masklen(listen_address)=CASE family(listen_address) WHEN 4 THEN 32 ELSE 128 END)
);
CREATE INDEX xera_node_port_bindings_profile ON xera_node_port_bindings(config_profile_uuid,node_uuid);
CREATE INDEX xera_node_port_bindings_node ON xera_node_port_bindings(node_uuid,uuid);
CREATE INDEX xera_node_port_plans_due ON xera_node_port_plans(apply_after,node_uuid) WHERE status<>'APPLIED';

CREATE TABLE xera_node_port_plan_revisions (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_uuid UUID NOT NULL REFERENCES nodes(uuid) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK(revision>=0),
    snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(node_uuid,revision)
);
CREATE INDEX xera_node_port_plan_revisions_recent ON xera_node_port_plan_revisions(node_uuid,created_at DESC,uuid);

CREATE TRIGGER xera_port_plan_revision_changed AFTER INSERT OR DELETE OR UPDATE OF revision ON xera_node_port_plans
    FOR EACH STATEMENT EXECUTE FUNCTION xera_bump_device_state();

-- A plan revision includes its source profiles, not only its socket bindings.
-- Otherwise an ACK for an older profile body could complete a newer edit.
CREATE FUNCTION xera_port_profile_changed() RETURNS TRIGGER AS $$
BEGIN
    UPDATE xera_node_port_plans p SET revision=p.revision+1,status='PENDING',error_code=NULL,apply_after=clock_timestamp(),apply_attempts=0,updated_at=clock_timestamp()
    WHERE EXISTS(SELECT 1 FROM xera_node_port_bindings b WHERE b.node_uuid=p.node_uuid
      AND b.config_profile_uuid=NEW.uuid) OR (NOT p.enabled AND EXISTS(SELECT 1 FROM nodes n WHERE n.uuid=p.node_uuid AND n.active_config_profile_uuid=NEW.uuid));
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER xera_port_profile_changed AFTER UPDATE OF config ON config_profiles
    FOR EACH ROW WHEN(OLD.config IS DISTINCT FROM NEW.config) EXECUTE FUNCTION xera_port_profile_changed();

-- Snippets can include other snippets; invalidating all plans also covers
-- indirect dependencies without relying on a frontend dependency cache.
CREATE FUNCTION xera_port_snippets_changed() RETURNS TRIGGER AS $$
BEGIN
    UPDATE xera_node_port_plans SET revision=revision+1,status='PENDING',error_code=NULL,apply_after=clock_timestamp(),apply_attempts=0,updated_at=clock_timestamp();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER xera_port_snippets_changed AFTER INSERT OR UPDATE OR DELETE ON config_profile_snippets
    FOR EACH STATEMENT EXECUTE FUNCTION xera_port_snippets_changed();

CREATE FUNCTION xera_port_legacy_node_changed() RETURNS TRIGGER AS $$
BEGIN
    UPDATE xera_node_port_plans SET revision=revision+1,status='PENDING',error_code=NULL,apply_after=clock_timestamp(),apply_attempts=0,updated_at=clock_timestamp()
    WHERE node_uuid=NEW.uuid AND NOT enabled;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER xera_port_legacy_node_changed AFTER UPDATE OF active_config_profile_uuid ON nodes
    FOR EACH ROW WHEN(OLD.active_config_profile_uuid IS DISTINCT FROM NEW.active_config_profile_uuid) EXECUTE FUNCTION xera_port_legacy_node_changed();

CREATE FUNCTION xera_port_legacy_inbounds_changed() RETURNS TRIGGER AS $$
DECLARE changed UUID[];
BEGIN
    IF TG_OP='INSERT' THEN SELECT array_agg(DISTINCT node_uuid) INTO changed FROM new_rows;
    ELSIF TG_OP='DELETE' THEN SELECT array_agg(DISTINCT node_uuid) INTO changed FROM old_rows;
    ELSE SELECT array_agg(DISTINCT node_uuid) INTO changed FROM (SELECT node_uuid FROM new_rows UNION SELECT node_uuid FROM old_rows) all_rows;
    END IF;
    UPDATE xera_node_port_plans SET revision=revision+1,status='PENDING',error_code=NULL,apply_after=clock_timestamp(),apply_attempts=0,updated_at=clock_timestamp()
    WHERE node_uuid=ANY(changed) AND NOT enabled;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER xera_port_legacy_inbounds_insert AFTER INSERT ON config_profile_inbounds_to_nodes REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION xera_port_legacy_inbounds_changed();
CREATE TRIGGER xera_port_legacy_inbounds_delete AFTER DELETE ON config_profile_inbounds_to_nodes REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION xera_port_legacy_inbounds_changed();
CREATE TRIGGER xera_port_legacy_inbounds_update AFTER UPDATE ON config_profile_inbounds_to_nodes REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION xera_port_legacy_inbounds_changed();

-- Desired delivery includes plugin and integration inputs. Their queue events
-- may arrive while a worker owns the node, or be lost during a Redis outage.
CREATE FUNCTION xera_port_node_settings_changed() RETURNS TRIGGER AS $$
BEGIN
    UPDATE xera_node_port_plans SET revision=revision+1,status='PENDING',error_code=NULL,
      apply_after=clock_timestamp(),apply_attempts=0,updated_at=clock_timestamp() WHERE node_uuid=NEW.uuid;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER xera_port_node_settings_changed
  AFTER UPDATE OF active_plugin_uuid,integration_uuids,name,country_code,tags ON nodes
  FOR EACH ROW WHEN(OLD.active_plugin_uuid IS DISTINCT FROM NEW.active_plugin_uuid OR
    OLD.integration_uuids IS DISTINCT FROM NEW.integration_uuids OR OLD.name IS DISTINCT FROM NEW.name OR
    OLD.country_code IS DISTINCT FROM NEW.country_code OR OLD.tags IS DISTINCT FROM NEW.tags)
  EXECUTE FUNCTION xera_port_node_settings_changed();

CREATE FUNCTION xera_port_plugin_changed() RETURNS TRIGGER AS $$
BEGIN
    UPDATE xera_node_port_plans p SET revision=p.revision+1,status='PENDING',error_code=NULL,
      apply_after=clock_timestamp(),apply_attempts=0,updated_at=clock_timestamp()
    WHERE EXISTS(SELECT 1 FROM nodes n WHERE n.uuid=p.node_uuid AND n.active_plugin_uuid=NEW.uuid);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER xera_port_plugin_changed AFTER UPDATE OF plugin_config ON node_plugin
    FOR EACH ROW WHEN(OLD.plugin_config IS DISTINCT FROM NEW.plugin_config) EXECUTE FUNCTION xera_port_plugin_changed();
CREATE TRIGGER xera_port_shared_lists_changed AFTER INSERT OR UPDATE OR DELETE ON shared_lists
    FOR EACH STATEMENT EXECUTE FUNCTION xera_port_snippets_changed();

CREATE FUNCTION xera_port_integration_changed() RETURNS TRIGGER AS $$
DECLARE changed UUID;
BEGIN
    IF TG_OP='DELETE' THEN changed=OLD.uuid; ELSE changed=NEW.uuid; END IF;
    UPDATE xera_node_port_plans p SET revision=p.revision+1,status='PENDING',error_code=NULL,
      apply_after=clock_timestamp(),apply_attempts=0,updated_at=clock_timestamp()
    WHERE EXISTS(SELECT 1 FROM nodes n WHERE n.uuid=p.node_uuid AND changed=ANY(n.integration_uuids));
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER xera_port_integration_updated AFTER UPDATE OF config ON integrations
    FOR EACH ROW WHEN(OLD.config IS DISTINCT FROM NEW.config) EXECUTE FUNCTION xera_port_integration_changed();
CREATE TRIGGER xera_port_integration_created AFTER INSERT ON integrations FOR EACH ROW EXECUTE FUNCTION xera_port_integration_changed();
CREATE TRIGGER xera_port_integration_deleted AFTER DELETE ON integrations FOR EACH ROW EXECUTE FUNCTION xera_port_integration_changed();
