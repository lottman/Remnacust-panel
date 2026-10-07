-- AlterTable
ALTER TABLE "hosts" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Migrate existing data from "tag" into "tags"
UPDATE "hosts"
SET "tags" = ARRAY["tag"]
WHERE "tag" IS NOT NULL AND "tag" <> '';

-- AlterTable
ALTER TABLE "hosts" DROP COLUMN "tag";