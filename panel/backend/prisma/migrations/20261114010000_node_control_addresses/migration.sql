ALTER TABLE public.nodes ADD COLUMN control_addresses jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.nodes ADD COLUMN control_revision uuid NOT NULL DEFAULT gen_random_uuid();

CREATE FUNCTION public.xera_migrate_control_address(value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE candidate text := btrim(value);
BEGIN
    IF strpos(candidate, '/') > 0 OR strpos(candidate, '%') > 0 THEN RETURN candidate; END IF;
    IF left(candidate, 1) = '[' AND right(candidate, 1) = ']' THEN
        candidate := substring(candidate FROM 2 FOR length(candidate) - 2);
    END IF;
    BEGIN
        RETURN lower(host(candidate::inet));
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN lower(rtrim(candidate, '.'));
    END;
END;
$$;

UPDATE public.nodes AS n SET control_addresses = (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('address', candidates.address, 'enabled', candidates.enabled)
        ORDER BY candidates.position), '[]'::jsonb)
    FROM (
        SELECT public.xera_migrate_control_address(address) AS address,
            bool_or(enabled) AS enabled, min(position) AS position
        FROM (
            SELECT n.address AS address, true AS enabled, 0::bigint AS position
            UNION ALL
            SELECT item.value->>'ip', COALESCE(item.value->>'status' IN ('MANAGEMENT', 'RESERVE'), false), item.ordinality
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.ips) = 'array' THEN n.ips ELSE '[]'::jsonb END)
                WITH ORDINALITY AS item(value, ordinality)
            WHERE jsonb_typeof(item.value) = 'object' AND jsonb_typeof(item.value->'ip') = 'string'
                AND item.ordinality <= 64 AND length(item.value->>'ip') BETWEEN 1 AND 255
        ) AS source
        GROUP BY public.xera_migrate_control_address(address)
    ) AS candidates
);

DROP FUNCTION public.xera_migrate_control_address(text);

ALTER TABLE public.nodes ADD CONSTRAINT nodes_control_addresses_array
CHECK (jsonb_typeof(control_addresses) = 'array' AND jsonb_array_length(control_addresses) <= 65);

CREATE TABLE public.xera_node_route_revision (
    id integer PRIMARY KEY CHECK (id = 1),
    revision uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO public.xera_node_route_revision(id) VALUES (1);

CREATE FUNCTION public.xera_advance_node_route_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    UPDATE public.xera_node_route_revision SET revision = gen_random_uuid() WHERE id = 1;
    RETURN NULL;
END;
$$;

CREATE FUNCTION public.xera_update_node_control_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    NEW.control_revision := gen_random_uuid();
    RETURN NEW;
END;
$$;

CREATE TRIGGER xera_node_control_revision_changed
BEFORE UPDATE OF address, port, proxy_url, ips, control_addresses, is_disabled,
    active_config_profile_uuid, active_plugin_uuid, integration_uuids ON public.nodes
FOR EACH ROW WHEN (
    (OLD.address, OLD.port, OLD.proxy_url, OLD.ips, OLD.control_addresses, OLD.is_disabled,
        OLD.active_config_profile_uuid, OLD.active_plugin_uuid, OLD.integration_uuids)
        IS DISTINCT FROM
    (NEW.address, NEW.port, NEW.proxy_url, NEW.ips, NEW.control_addresses, NEW.is_disabled,
        NEW.active_config_profile_uuid, NEW.active_plugin_uuid, NEW.integration_uuids)
) EXECUTE FUNCTION public.xera_update_node_control_revision();

CREATE TRIGGER xera_node_route_inventory_changed
AFTER INSERT OR DELETE OR TRUNCATE ON public.nodes
FOR EACH STATEMENT EXECUTE FUNCTION public.xera_advance_node_route_revision();

CREATE TRIGGER xera_node_route_configuration_changed
AFTER UPDATE ON public.nodes
FOR EACH ROW WHEN (OLD.control_revision IS DISTINCT FROM NEW.control_revision)
EXECUTE FUNCTION public.xera_advance_node_route_revision();

CREATE FUNCTION public.xera_node_inbound_control_revision_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE affected uuid[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT array_agg(DISTINCT node_uuid) INTO affected FROM new_rows;
    ELSIF TG_OP = 'DELETE' THEN
        SELECT array_agg(DISTINCT node_uuid) INTO affected FROM old_rows;
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT array_agg(DISTINCT node_uuid) INTO affected
        FROM (SELECT node_uuid FROM new_rows UNION SELECT node_uuid FROM old_rows) AS changed;
    ELSE
        UPDATE public.nodes SET control_revision = gen_random_uuid();
        RETURN NULL;
    END IF;
    UPDATE public.nodes SET control_revision = gen_random_uuid() WHERE uuid = ANY(affected);
    RETURN NULL;
END;
$$;

CREATE TRIGGER xera_node_inbound_control_insert
AFTER INSERT ON public.config_profile_inbounds_to_nodes REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.xera_node_inbound_control_revision_changed();

CREATE TRIGGER xera_node_inbound_control_delete
AFTER DELETE ON public.config_profile_inbounds_to_nodes REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.xera_node_inbound_control_revision_changed();

CREATE TRIGGER xera_node_inbound_control_update
AFTER UPDATE ON public.config_profile_inbounds_to_nodes REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.xera_node_inbound_control_revision_changed();

CREATE TRIGGER xera_node_inbound_control_truncate
AFTER TRUNCATE ON public.config_profile_inbounds_to_nodes
FOR EACH STATEMENT EXECUTE FUNCTION public.xera_node_inbound_control_revision_changed();
