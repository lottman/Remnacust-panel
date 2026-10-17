CREATE TABLE "subscription_template_revisions" (
  "id" SERIAL PRIMARY KEY,
  "uuid" UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  "template_uuid" UUID NOT NULL REFERENCES "subscription_templates"("uuid") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "template_json" JSONB,
  "template_yaml" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "subscription_template_revisions_template_uuid_id_idx"
  ON "subscription_template_revisions" ("template_uuid", "id" DESC);
-- Existing content is the first recoverable version. No historical migration is modified.
INSERT INTO "subscription_template_revisions" ("template_uuid", "name", "template_json", "template_yaml")
SELECT "uuid", "name", "template_json", "template_yaml" FROM "subscription_templates";
