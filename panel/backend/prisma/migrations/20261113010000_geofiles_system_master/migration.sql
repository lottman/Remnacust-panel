BEGIN;

LOCK TABLE public.subscription_templates IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.subscription_settings
ADD COLUMN geofiles_system_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.subscription_settings
DROP CONSTRAINT geofiles_require_base_json,
ADD CONSTRAINT geofiles_system_require_base_json
CHECK (NOT geofiles_system_enabled OR serve_json_at_base_subscription);

CREATE OR REPLACE FUNCTION public.rc_template_geofiles_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    PERFORM uuid FROM public.subscription_settings ORDER BY uuid FOR UPDATE;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    IF NEW.geofiles_enabled THEN
        IF TG_OP = 'UPDATE' THEN
            IF OLD.geofiles_enabled THEN
                RETURN NEW;
            END IF;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.subscription_settings WHERE geofiles_system_enabled
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'GEOFILES_SYSTEM_DISABLED';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.subscription_settings
            WHERE geofiles_system_enabled AND serve_json_at_base_subscription
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'GEOFILES_REQUIRE_BASE_JSON';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

COMMIT;
