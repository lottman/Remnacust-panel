UPDATE "xera_remnawave_settings"
SET "branding_settings" = jsonb_set("branding_settings", '{title}', '"Remnacust"'::jsonb)
WHERE "branding_settings"->>'title' IN ('Remnawave', 'Remna<color color="#0fb3bd">wave</color>');
