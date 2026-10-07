CREATE TABLE "config_profile_revisions" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_uuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "config_profile_revisions_pkey" PRIMARY KEY ("uuid")
);

CREATE INDEX "config_profile_revisions_profile_uuid_created_at_idx"
    ON "config_profile_revisions"("profile_uuid", "created_at" DESC);

ALTER TABLE "config_profile_revisions"
    ADD CONSTRAINT "config_profile_revisions_profile_uuid_fkey"
    FOREIGN KEY ("profile_uuid") REFERENCES "config_profiles"("uuid")
    ON DELETE CASCADE ON UPDATE CASCADE;
