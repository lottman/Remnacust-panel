-- Binding UUID and listener ownership identify a port assignment. The source
-- inbound may be reused by independent graphs; its node membership stays unique
-- in config_profile_inbounds_to_nodes.
DO $$
DECLARE restriction RECORD;
BEGIN
    FOR restriction IN
        SELECT c.conname FROM pg_constraint c
        WHERE c.conrelid='xera_node_port_bindings'::regclass AND c.contype='u'
          AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality)
               FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum,ordinality)
               JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum)
              =ARRAY['node_uuid','config_profile_inbound_uuid']::text[]
    LOOP
        EXECUTE format('ALTER TABLE xera_node_port_bindings DROP CONSTRAINT %I',restriction.conname);
    END LOOP;
END $$;
CREATE INDEX xera_node_port_bindings_inbound_membership
    ON xera_node_port_bindings(node_uuid,config_profile_inbound_uuid);
