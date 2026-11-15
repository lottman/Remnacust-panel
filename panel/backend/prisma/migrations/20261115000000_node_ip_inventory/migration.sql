CREATE TABLE "xera_node_ip_inventory" (
    "node_uuid" UUID NOT NULL,
    "addresses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "generated_addresses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "revision" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scanned_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "xera_node_ip_inventory_pkey" PRIMARY KEY ("node_uuid"),
    CONSTRAINT "xera_node_ip_inventory_addresses_limit" CHECK (cardinality("addresses") <= 64),
    CONSTRAINT "xera_node_ip_inventory_generated_limit" CHECK (cardinality("generated_addresses") <= 64),
    CONSTRAINT "xera_node_ip_inventory_node_uuid_fkey" FOREIGN KEY ("node_uuid")
        REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE
);
