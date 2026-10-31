CREATE TABLE "subscription_domains" (
 "uuid" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name" VARCHAR(100) NOT NULL,
 "domain" VARCHAR(253) NOT NULL UNIQUE, "path" VARCHAR(240) NOT NULL DEFAULT '', "kind" VARCHAR(7) NOT NULL,
 "parent_uuid" UUID REFERENCES "subscription_domains"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
 "is_default" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "subscription_domains_kind" CHECK (kind IN ('PRIMARY', 'CDN')),
 CONSTRAINT "subscription_domains_shape" CHECK ((kind = 'PRIMARY' AND parent_uuid IS NULL) OR (kind = 'CDN' AND parent_uuid IS NOT NULL AND NOT is_default)),
 CONSTRAINT "subscription_domains_not_self" CHECK (parent_uuid IS DISTINCT FROM uuid)
);
CREATE UNIQUE INDEX "subscription_domains_one_default" ON "subscription_domains" ((true)) WHERE "is_default";
CREATE INDEX "subscription_domains_parent_uuid_idx" ON "subscription_domains" ("parent_uuid");
ALTER TABLE "users" ADD COLUMN "subscription_domain_uuid" UUID;
ALTER TABLE "users" ADD CONSTRAINT "users_subscription_domain_uuid_fkey" FOREIGN KEY ("subscription_domain_uuid") REFERENCES "subscription_domains"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "users_subscription_domain_uuid_idx" ON "users"("subscription_domain_uuid");

CREATE OR REPLACE FUNCTION "remnacust_validate_subscription_domain_parent"() RETURNS trigger AS $$
BEGIN
  IF NEW.kind = 'CDN' AND NOT EXISTS (
    SELECT 1 FROM "subscription_domains" parent
    WHERE parent.uuid = NEW.parent_uuid AND parent.kind = 'PRIMARY'
  ) THEN
    RAISE EXCEPTION 'CDN subscription domain must reference a primary domain';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "subscription_domains_validate_parent"
BEFORE INSERT OR UPDATE OF "kind", "parent_uuid" ON "subscription_domains"
FOR EACH ROW EXECUTE FUNCTION "remnacust_validate_subscription_domain_parent"();
