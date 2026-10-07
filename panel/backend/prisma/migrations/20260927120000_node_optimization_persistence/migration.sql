CREATE TABLE "xera_node_optimization" (
    "node_uuid" UUID PRIMARY KEY REFERENCES "nodes"("uuid") ON DELETE CASCADE,
    "level" TEXT CHECK ("level" IN ('none','safe','balanced','performance')),
    "verified_at" TIMESTAMPTZ,
    "checked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    CHECK (NOT "verified" OR ("level" IS NOT NULL AND "verified_at" IS NOT NULL))
);
