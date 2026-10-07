-- AlterTable
ALTER TABLE "admin" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "api_tokens" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "config_profiles" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "hwid_user_devices" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "internal_squads" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "keygen" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "nodes" ADD COLUMN     "provider_uuid" UUID,
ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "nodes_traffic_usage_history" ALTER COLUMN "reset_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "nodes_usage_history" ALTER COLUMN "created_at" SET DEFAULT date_trunc('hour', now());

-- AlterTable
ALTER TABLE "nodes_user_usage_history" ALTER COLUMN "created_at" SET DEFAULT date_trunc('hour', now()),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "subscription_settings" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "subscription_templates" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "user_traffic_history" ALTER COLUMN "reset_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- CreateTable
CREATE TABLE "infra_providers" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "favicon_link" TEXT,
    "login_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "infra_providers_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "infra_billing_nodes" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_uuid" UUID NOT NULL,
    "provider_uuid" UUID NOT NULL,
    "next_billing_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "infra_billing_nodes_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "infra_billing_history" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_uuid" UUID NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "billed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "infra_billing_history_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "infra_providers_name_key" ON "infra_providers"("name");

-- CreateIndex
CREATE INDEX "infra_billing_nodes_next_billing_at_idx" ON "infra_billing_nodes"("next_billing_at");

-- CreateIndex
CREATE UNIQUE INDEX "infra_billing_nodes_node_uuid_provider_uuid_key" ON "infra_billing_nodes"("node_uuid", "provider_uuid");

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_provider_uuid_fkey" FOREIGN KEY ("provider_uuid") REFERENCES "infra_providers"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_billing_nodes" ADD CONSTRAINT "infra_billing_nodes_provider_uuid_fkey" FOREIGN KEY ("provider_uuid") REFERENCES "infra_providers"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_billing_nodes" ADD CONSTRAINT "infra_billing_nodes_node_uuid_fkey" FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "infra_billing_history" ADD CONSTRAINT "infra_billing_history_provider_uuid_fkey" FOREIGN KEY ("provider_uuid") REFERENCES "infra_providers"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
