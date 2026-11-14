CREATE TRIGGER xera_external_squad_cache_revision_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.external_squads
FOR EACH STATEMENT EXECUTE FUNCTION public.xera_advance_template_cache_revision();

CREATE TRIGGER xera_external_squad_template_cache_revision_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.external_squads_templates
FOR EACH STATEMENT EXECUTE FUNCTION public.xera_advance_template_cache_revision();
