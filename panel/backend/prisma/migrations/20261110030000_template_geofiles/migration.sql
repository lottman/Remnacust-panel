ALTER TABLE public.subscription_templates
ADD COLUMN geofiles_enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE public.subscription_templates
SET geofiles_enabled = EXISTS (
    SELECT 1 FROM public.subscription_settings WHERE geofiles_enabled
);

CREATE FUNCTION public.rc_template_geofiles_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    PERFORM uuid FROM public.subscription_settings ORDER BY uuid FOR UPDATE;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    IF NEW.geofiles_enabled AND NOT EXISTS (
        SELECT 1 FROM public.subscription_settings WHERE serve_json_at_base_subscription
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'GEOFILES_REQUIRE_BASE_JSON';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER rc_template_geofiles_guard
BEFORE INSERT OR UPDATE OF geofiles_enabled OR DELETE ON public.subscription_templates
FOR EACH ROW EXECUTE FUNCTION public.rc_template_geofiles_guard();

CREATE FUNCTION public.rc_template_geofiles_summary() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    UPDATE public.subscription_settings
    SET geofiles_enabled = EXISTS (
        SELECT 1 FROM public.subscription_templates WHERE geofiles_enabled
    )
    WHERE geofiles_enabled IS DISTINCT FROM EXISTS (
        SELECT 1 FROM public.subscription_templates WHERE geofiles_enabled
    );
    RETURN NULL;
END;
$$;

CREATE TRIGGER rc_template_geofiles_summary
AFTER INSERT OR UPDATE OF geofiles_enabled OR DELETE OR TRUNCATE ON public.subscription_templates
FOR EACH STATEMENT EXECUTE FUNCTION public.rc_template_geofiles_summary();

CREATE FUNCTION public.rc_geofiles_summary_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.geofiles_enabled IS DISTINCT FROM EXISTS (
        SELECT 1 FROM public.subscription_templates WHERE geofiles_enabled
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'GEOFILES_PER_TEMPLATE';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER rc_geofiles_summary_guard
BEFORE INSERT OR UPDATE OF geofiles_enabled, serve_json_at_base_subscription
ON public.subscription_settings
FOR EACH ROW EXECUTE FUNCTION public.rc_geofiles_summary_guard();

UPDATE public.subscription_settings
SET geofiles_enabled = EXISTS (
    SELECT 1 FROM public.subscription_templates WHERE geofiles_enabled
)
WHERE geofiles_enabled IS DISTINCT FROM EXISTS (
    SELECT 1 FROM public.subscription_templates WHERE geofiles_enabled
);
