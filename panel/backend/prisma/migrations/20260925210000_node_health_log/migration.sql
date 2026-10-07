CREATE TABLE "xera_node_health_log_settings" (
    "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
    "retention_days" INTEGER NOT NULL DEFAULT 30 CHECK ("retention_days" BETWEEN 1 AND 365)
);

INSERT INTO "xera_node_health_log_settings" ("id", "retention_days") VALUES (1, 30);

CREATE TABLE "xera_node_health_logs" (
    "id" BIGSERIAL PRIMARY KEY,
    "node_uuid" UUID NOT NULL REFERENCES "nodes"("uuid") ON DELETE CASCADE,
    "checked_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "status" VARCHAR(24) NOT NULL,
    "attempt" SMALLINT NOT NULL DEFAULT 1,
    "message" VARCHAR(500),
    "metrics" JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX "xera_node_health_logs_node_recent_idx"
    ON "xera_node_health_logs" ("node_uuid", "checked_at" DESC, "id" DESC);

CREATE INDEX "xera_node_health_logs_retention_idx"
    ON "xera_node_health_logs" ("checked_at");

CREATE INDEX "xera_node_health_logs_node_page_idx"
    ON "xera_node_health_logs" ("node_uuid", "id" DESC);
