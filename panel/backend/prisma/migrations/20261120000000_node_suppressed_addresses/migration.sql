CREATE TABLE "xera_node_suppressed_addresses" (
    "node_uuid" UUID NOT NULL,
    "address" VARCHAR(253) NOT NULL,
    CONSTRAINT "xera_node_suppressed_addresses_pkey" PRIMARY KEY ("node_uuid", "address"),
    CONSTRAINT "xera_node_suppressed_addresses_node_uuid_fkey" FOREIGN KEY ("node_uuid")
        REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE
);
