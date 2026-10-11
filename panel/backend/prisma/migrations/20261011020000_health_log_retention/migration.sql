ALTER TABLE "xera_node_health_log_settings"
    ALTER COLUMN "retention_days" SET DEFAULT 3;

INSERT INTO "xera_node_health_log_settings" ("id", "retention_days")
VALUES (1, 3)
ON CONFLICT ("id") DO UPDATE
    SET "retention_days" = 3
    WHERE "xera_node_health_log_settings"."retention_days" = 30;

-- Reclaim expired rows in ordinary maintenance, without blocking table readers.
ALTER TABLE "xera_node_health_logs" SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_vacuum_threshold = 500,
    autovacuum_analyze_scale_factor = 0.05,
    autovacuum_analyze_threshold = 1000
);
