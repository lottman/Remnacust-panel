CREATE TABLE xera_xray_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'custom' CHECK (mode IN ('custom', 'default')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    apply_pending BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO xera_xray_settings(id) VALUES (1);

CREATE FUNCTION xera_xray_config_requires_custom(value JSONB)
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE AS $$
    SELECT COALESCE(jsonb_path_exists(value, '$.**.network ? (@ like_regex "^xera(-http)?$" flag "i")')
        OR jsonb_path_exists(value, '$.**.method ? (@ like_regex "^xera(-http)?$" flag "i")')
        OR jsonb_path_exists(value, '$.**.protocol ? (@ == "olcrtc")')
        OR jsonb_path_exists(value, '$.**.remnacustUserQuotaRequired ? (@ == true)')
        OR jsonb_path_exists(value, '$.routing.rules[*].webhook')
        OR jsonb_path_exists(value, '$.**.xeraHttpSettings')
        OR jsonb_path_exists(value, '$.**.remnacustProfileGraphs')
        OR jsonb_path_exists(value, '$.**.hostPolicy')
        OR jsonb_path_exists(value, '$.**.xeraHostPolicy'),false)
$$;

CREATE FUNCTION xera_xray_non_neutral(value JSONB, field TEXT)
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE AS $$
    SELECT value IS NOT NULL AND value NOT IN ('null'::jsonb,'false'::jsonb,'""'::jsonb)
        AND CASE WHEN field='traffic_multiplier' THEN value<>'1'::jsonb
                 WHEN field='domain_rules' THEN value->>'mode' IS DISTINCT FROM 'OFF'
                 WHEN field='reset_base' THEN value<>'{}'::jsonb
                 ELSE value<>'0'::jsonb END
$$;

CREATE FUNCTION xera_xray_config_uses_custom_snippets(config JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE expanded JSONB:=config; merged JSONB:='{}'; payload JSONB; part JSONB; entry RECORD;
    target TEXT; target_path TEXT[]; items JSONB; replaced JSONB; reference_count BIGINT:=0; payload_bytes BIGINT:=0;
    part_count INTEGER:=0; extra_count BIGINT; extra_bytes BIGINT;
BEGIN
    IF xera_xray_config_requires_custom(config) THEN RETURN true; END IF;
    IF jsonb_typeof(config) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF NOT (COALESCE(jsonb_typeof(config->'snippets')='array' AND config->'snippets'<>'[]'::jsonb,false)
        OR jsonb_path_exists(config,'$.outbounds[*].snippet')
        OR jsonb_path_exists(config,'$.routing.rules[*].snippet')
        OR jsonb_path_exists(config,'$.routing.balancers[*].snippet')) THEN RETURN false; END IF;
    IF pg_column_size(config)>1048576 THEN RETURN true; END IF;
    IF jsonb_typeof(config->'snippets')='array' THEN
        IF jsonb_array_length(config->'snippets')>128 THEN RETURN true; END IF;
        FOR entry IN SELECT value FROM jsonb_array_elements(config->'snippets') LOOP
            reference_count:=reference_count+1;
            SELECT snippet INTO payload FROM config_profile_snippets
                WHERE name=CASE WHEN jsonb_typeof(entry.value)='string' THEN entry.value#>>'{}' END;
            IF payload IS NULL THEN CONTINUE; END IF;
            payload_bytes:=payload_bytes+pg_column_size(payload);
            IF payload_bytes>2097152 THEN RETURN true; END IF;
            IF jsonb_typeof(payload)<>'array' THEN payload:=jsonb_build_array(payload); END IF;
            IF jsonb_array_length(payload)>512 THEN RETURN true; END IF;
            FOR part IN SELECT value FROM jsonb_array_elements(payload) LOOP
                part_count:=part_count+1;
                IF part_count>512 THEN RETURN true; END IF;
                IF jsonb_typeof(part)='object' THEN merged:=merged||part; END IF;
            END LOOP;
        END LOOP;
        merged:=merged-ARRAY['api','inbounds','metrics','snippets','stats'];
        expanded:=merged||config;
    END IF;
    expanded:=expanded-'snippets';
    FOREACH target IN ARRAY ARRAY['outbounds','rules','balancers'] LOOP
        target_path:=CASE WHEN target='outbounds' THEN ARRAY[target] ELSE ARRAY['routing',target] END;
        items:=expanded#>target_path;
        IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
        IF jsonb_array_length(items)>4096 THEN RETURN true; END IF;
        SELECT count(*),COALESCE(sum(pg_column_size(s.snippet)),0) INTO extra_count,extra_bytes
            FROM jsonb_array_elements(items) item
            LEFT JOIN config_profile_snippets s ON s.name=CASE WHEN jsonb_typeof(item->'snippet')='string' THEN item->>'snippet' END
            WHERE COALESCE(item->'snippet','null'::jsonb) NOT IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb);
        reference_count:=reference_count+extra_count; payload_bytes:=payload_bytes+extra_bytes;
        IF reference_count>256 OR payload_bytes>2097152 THEN RETURN true; END IF;
        SELECT COALESCE(jsonb_agg(flat.value ORDER BY original.ordinality,flat.ordinality),'[]'::jsonb) INTO replaced
            FROM jsonb_array_elements(items) WITH ORDINALITY original(value,ordinality)
            LEFT JOIN config_profile_snippets s ON s.name=CASE WHEN jsonb_typeof(original.value->'snippet')='string' THEN original.value->>'snippet' END
            CROSS JOIN LATERAL jsonb_array_elements(CASE
                WHEN COALESCE(original.value->'snippet','null'::jsonb) IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)
                    THEN jsonb_build_array(original.value)
                WHEN s.snippet IS NULL OR s.snippet IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb) THEN '[]'::jsonb
                WHEN jsonb_typeof(s.snippet)='array' THEN s.snippet
                ELSE jsonb_build_array(s.snippet) END) WITH ORDINALITY flat(value,ordinality);
        expanded:=jsonb_set(expanded,target_path,replaced);
    END LOOP;
    RETURN xera_xray_config_requires_custom(expanded);
END;
$$;

CREATE FUNCTION xera_xray_snippet_requires_custom(payload JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE parts JSONB; part JSONB;
BEGIN
    IF xera_xray_config_requires_custom(payload) OR COALESCE(jsonb_path_exists(payload,'$.**.webhook'),false) THEN RETURN true; END IF;
    IF NOT COALESCE(jsonb_path_exists(payload,'$.**.snippet') OR jsonb_path_exists(payload,'$.**.snippets[*]'),false) THEN RETURN false; END IF;
    IF pg_column_size(payload)>1048576 THEN RETURN true; END IF;
    parts:=CASE WHEN jsonb_typeof(payload)='array' THEN payload ELSE jsonb_build_array(payload) END;
    IF jsonb_array_length(parts)>128 THEN RETURN true; END IF;
    FOR part IN SELECT value FROM jsonb_array_elements(parts) LOOP
        IF xera_xray_config_uses_custom_snippets(part) THEN RETURN true; END IF;
    END LOOP;
    RETURN xera_xray_config_uses_custom_snippets(jsonb_build_object('outbounds',parts))
        OR xera_xray_config_uses_custom_snippets(jsonb_build_object('routing',jsonb_build_object('rules',parts)));
END;
$$;

CREATE FUNCTION xera_xray_guard_writer()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE selected_mode TEXT; after_row JSONB; before_row JSONB; field TEXT; needs_custom BOOLEAN:=false; profile JSONB;
BEGIN
    SELECT mode INTO selected_mode FROM xera_xray_settings WHERE id=1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0C02',MESSAGE='XRAY_SETTINGS_UNAVAILABLE'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    after_row:=to_jsonb(NEW);
    before_row:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
    IF selected_mode='custom' THEN RETURN NEW; END IF;
    CASE TG_TABLE_NAME
    WHEN 'hosts','xera_host_tag_limits' THEN
        FOREACH field IN ARRAY ARRAY['user_traffic_limit_bytes','server_speed_limit_mbps','speed_limit_mbps',
            'device_speed_limit_mbps','total_speed_limit_mbps','traffic_multiplier','always_available','only_when_inactive','domain_rules'] LOOP
            needs_custom:=needs_custom OR (after_row->field IS DISTINCT FROM before_row->field AND xera_xray_non_neutral(after_row->field,field));
        END LOOP;
        FOREACH field IN ARRAY ARRAY['traffic_limit_reset_anchor_at','traffic_limit_reset_value','traffic_limit_reset_unit','reset_anchor_at','reset_value','reset_unit'] LOOP
            needs_custom:=needs_custom OR (TG_OP='UPDATE' AND after_row->field IS DISTINCT FROM before_row->field
                AND (xera_xray_non_neutral(after_row->'user_traffic_limit_bytes','user_traffic_limit_bytes')
                    OR xera_xray_non_neutral(after_row->'speed_limit_mbps','speed_limit_mbps')
                    OR xera_xray_non_neutral(after_row->'total_speed_limit_mbps','total_speed_limit_mbps')));
        END LOOP;
    WHEN 'config_profiles' THEN
        needs_custom:=after_row->'config' IS DISTINCT FROM before_row->'config' AND xera_xray_config_uses_custom_snippets(after_row->'config');
    WHEN 'config_profile_snippets' THEN
        needs_custom:=(after_row->'snippet' IS DISTINCT FROM before_row->'snippet' OR after_row->'name' IS DISTINCT FROM before_row->'name')
            AND xera_xray_snippet_requires_custom(after_row->'snippet');
    WHEN 'config_profile_inbounds' THEN
        needs_custom:=after_row->'raw_inbound' IS DISTINCT FROM before_row->'raw_inbound' AND xera_xray_config_requires_custom(after_row->'raw_inbound');
    WHEN 'subscription_templates' THEN
        needs_custom:=after_row->>'template_type'='XRAY_JSON' AND
            (after_row->'template_json' IS DISTINCT FROM before_row->'template_json' OR after_row->'template_type' IS DISTINCT FROM before_row->'template_type')
            AND xera_xray_config_requires_custom(after_row->'template_json');
    WHEN 'nodes' THEN
        IF NOT COALESCE((after_row->>'is_disabled')::boolean,false) AND
            (TG_OP='INSERT' OR COALESCE((before_row->>'is_disabled')::boolean,false)
                OR after_row->'active_config_profile_uuid' IS DISTINCT FROM before_row->'active_config_profile_uuid') THEN
            SELECT config INTO profile FROM config_profiles WHERE uuid=(after_row->>'active_config_profile_uuid')::uuid;
            needs_custom:=xera_xray_config_uses_custom_snippets(profile)
                OR EXISTS(SELECT 1 FROM xera_node_port_plans WHERE node_uuid=(after_row->>'uuid')::uuid AND enabled)
                OR EXISTS(SELECT 1 FROM xera_quota_node_modes WHERE node_uuid=(after_row->>'uuid')::uuid);
        END IF;
    WHEN 'xera_node_port_plans' THEN
        needs_custom:=COALESCE((after_row->>'enabled')::boolean,false) AND
            (TG_OP='INSERT' OR after_row->'enabled' IS DISTINCT FROM before_row->'enabled' OR after_row->'revision' IS DISTINCT FROM before_row->'revision')
            AND NOT (TG_OP='UPDATE' AND pg_trigger_depth()>1 AND after_row->'enabled' IS NOT DISTINCT FROM before_row->'enabled'
                AND EXISTS(SELECT 1 FROM nodes WHERE uuid=(after_row->>'node_uuid')::uuid AND is_disabled));
    WHEN 'xera_node_port_bindings' THEN
        SELECT enabled INTO needs_custom FROM xera_node_port_plans WHERE node_uuid=(after_row->>'node_uuid')::uuid;
    WHEN 'xera_quota_node_modes' THEN
        needs_custom:=TG_OP='INSERT' OR after_row->'phase' IS DISTINCT FROM before_row->'phase';
    WHEN 'xera_quota_reserves' THEN
        needs_custom:=after_row->'closed_usage_bytes'='null'::jsonb AND after_row->'retired_at'='null'::jsonb
            AND (TG_OP='INSERT' OR (after_row->>'ceiling_bytes')::bigint>(before_row->>'ceiling_bytes')::bigint);
    WHEN 'xera_limit_scopes' THEN
        needs_custom:=after_row->'paused'='true'::jsonb AND after_row->'paused' IS DISTINCT FROM before_row->'paused';
    WHEN 'xera_limit_user_adjustments' THEN
        FOREACH field IN ARRAY ARRAY['bonus_bytes','paused','unlimited','reset_base'] LOOP
            needs_custom:=needs_custom OR (after_row->field IS DISTINCT FROM before_row->field AND xera_xray_non_neutral(after_row->field,field));
        END LOOP;
    WHEN 'xera_limit_actions' THEN
        needs_custom:=TG_OP='INSERT' AND after_row->>'action' NOT IN ('RESUME','LIMITED');
    ELSE
        RAISE EXCEPTION 'Unknown Xray guard relation';
    END CASE;
    IF needs_custom THEN RAISE EXCEPTION USING ERRCODE='P0C01',MESSAGE='CUSTOM_XRAY_REQUIRED'; END IF;
    RETURN NEW;
END;
$$;

DO $$ DECLARE relation TEXT; BEGIN
    FOREACH relation IN ARRAY ARRAY['hosts','xera_host_tag_limits','config_profiles','config_profile_snippets',
        'config_profile_inbounds','subscription_templates','nodes','xera_node_port_plans','xera_node_port_bindings',
        'xera_quota_node_modes','xera_quota_reserves','xera_limit_scopes','xera_limit_user_adjustments','xera_limit_actions'] LOOP
        EXECUTE format('CREATE TRIGGER xera_xray_mode_writer BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION xera_xray_guard_writer()',relation);
    END LOOP;
END $$;
