-- The stock Remnawave binary expects remnawave_settings. Preserve the row and
-- constraints while moving the authentication settings to the XERA schema name.
-- Custom releases apply this migration automatically before the new image starts.
ALTER TABLE "remnawave_settings" RENAME TO "xera_remnawave_settings";
-- Every authenticated admin request in the stock binary also relies on admin.
ALTER TABLE "admin" RENAME TO "xera_admin";
