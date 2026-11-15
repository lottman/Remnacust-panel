CREATE TABLE "xera_node_health_observations" (
    "node_uuid" UUID NOT NULL PRIMARY KEY,
    "control_revision" UUID NOT NULL,
    "observed_at" BIGINT NOT NULL CHECK ("observed_at" BETWEEN 0 AND 9007199254740991),
    "attempt" INTEGER NOT NULL CHECK ("attempt" IN (1, 2)),
    "healthy" BOOLEAN NOT NULL,
    CONSTRAINT "xera_node_health_observations_node_uuid_fkey" FOREIGN KEY ("node_uuid")
        REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE
);
