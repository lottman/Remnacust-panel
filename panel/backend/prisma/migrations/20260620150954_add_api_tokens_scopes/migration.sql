-- AlterTable
ALTER TABLE "api_tokens" ADD COLUMN     "scopes" TEXT[] DEFAULT ARRAY['*']::TEXT[];