/*
  Warnings:

  - You are about to drop the `nodes_traffic_usage_history` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "nodes_traffic_usage_history" DROP CONSTRAINT "nodes_traffic_usage_history_node_uuid_fkey";

-- DropTable
DROP TABLE "nodes_traffic_usage_history";