/*
  Warnings:

  - You are about to drop the column `allow_insecure` on the `hosts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "hosts" DROP COLUMN "allow_insecure",
ADD COLUMN     "pinned_peer_cert_sha256" TEXT;