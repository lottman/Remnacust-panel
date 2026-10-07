-- 
ALTER TABLE "external_squads"
ADD COLUMN     "response_headers_add" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "response_headers_remove" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 
UPDATE "external_squads"
SET "response_headers_add" = "response_headers"
WHERE "response_headers" IS NOT NULL
  AND jsonb_typeof("response_headers") = 'object';

-- 
ALTER TABLE "external_squads" DROP COLUMN "response_headers";
