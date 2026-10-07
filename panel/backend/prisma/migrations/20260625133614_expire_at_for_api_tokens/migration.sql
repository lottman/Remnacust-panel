/*
  Warnings:

  - You are about to drop the column `token` on the `api_tokens` table. All the data in the column will be lost.
  - The `token_name` column on the `api_tokens` table is renamed to `name`. Existing data is preserved.

*/
-- DropIndex
DROP INDEX "api_tokens_token_key";

-- AlterTable
ALTER TABLE "api_tokens" DROP COLUMN "token",
ADD COLUMN     "expire_at" TIMESTAMP(3) NOT NULL DEFAULT now() + interval '99999 days';

-- RenameColumn
ALTER TABLE "api_tokens" RENAME COLUMN "token_name" TO "name";