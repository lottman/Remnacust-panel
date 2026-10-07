CREATE TABLE "xera_host_tag_limits" (
    "tag" TEXT PRIMARY KEY,
    "user_traffic_limit_bytes" BIGINT NOT NULL CHECK ("user_traffic_limit_bytes" > 0),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
