-- AlterTable
ALTER TABLE "infra_billing_nodes" ALTER COLUMN "node_uuid" DROP NOT NULL,
ADD COLUMN     "name" TEXT;