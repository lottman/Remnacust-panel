ALTER TABLE "hosts" ADD COLUMN "user_traffic_limit_bytes" BIGINT;
ALTER TABLE "hosts" ADD COLUMN "speed_limit_mbps" INTEGER;
ALTER TABLE "hosts" ADD COLUMN "domain_rules" JSONB;
ALTER TABLE "hosts" ADD COLUMN "sni_regeneration" JSONB;
ALTER TABLE "hwid_user_devices" ADD COLUMN "blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "remnawave_settings" ADD COLUMN "backup_settings" JSONB;
