CREATE TABLE xera_template_cache_revision (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    revision UUID NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO xera_template_cache_revision(id) VALUES (1);

CREATE FUNCTION xera_advance_template_cache_revision()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.xera_template_cache_revision SET revision = gen_random_uuid() WHERE id = 1;
    RETURN NULL;
END
$$;

CREATE TRIGGER xera_template_cache_revision_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON subscription_templates
FOR EACH STATEMENT EXECUTE FUNCTION xera_advance_template_cache_revision();
