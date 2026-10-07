/*
  Warnings:

  - You are about to drop the column `uuid` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_uuid_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "uuid";
