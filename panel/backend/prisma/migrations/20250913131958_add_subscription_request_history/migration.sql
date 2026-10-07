-- AlterTable
ALTER TABLE "public"."admin" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."api_tokens" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."config_profiles" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."hwid_user_devices" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."infra_billing_nodes" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."infra_providers" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."internal_squads" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."keygen" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."nodes" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."nodes_traffic_usage_history" ALTER COLUMN "reset_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."nodes_usage_history" ALTER COLUMN "created_at" SET DEFAULT date_trunc('hour', now()),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."nodes_user_usage_history" ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."subscription_settings" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."subscription_templates" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."user_traffic_history" ALTER COLUMN "reset_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "public"."users" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- CreateTable
CREATE TABLE "public"."user_subscription_request_history" (
    "id" BIGSERIAL NOT NULL,
    "user_uuid" UUID NOT NULL,
    "request_ip" TEXT,
    "user_agent" TEXT,
    "request_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "user_subscription_request_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_subscription_request_history_user_uuid_idx" ON "public"."user_subscription_request_history"("user_uuid");

-- CreateIndex
CREATE INDEX "user_subscription_request_history_request_at_idx" ON "public"."user_subscription_request_history"("request_at" ASC);

-- AddForeignKey
ALTER TABLE "public"."user_subscription_request_history" ADD CONSTRAINT "user_subscription_request_history_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "public"."users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
