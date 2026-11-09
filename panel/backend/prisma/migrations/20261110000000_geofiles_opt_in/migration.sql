ALTER TABLE "subscription_settings"
ADD COLUMN "geofiles_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD CONSTRAINT "geofiles_require_base_json" CHECK (NOT "geofiles_enabled" OR "serve_json_at_base_subscription");

CREATE TRIGGER xera_subscription_settings_cache_revision_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON subscription_settings
FOR EACH STATEMENT EXECUTE FUNCTION xera_advance_template_cache_revision();
