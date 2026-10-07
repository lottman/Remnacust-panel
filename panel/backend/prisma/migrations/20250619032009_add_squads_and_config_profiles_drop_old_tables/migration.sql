/*
  Warnings:

  - You are about to drop the column `allowinsecure` on the `hosts` table. All the data in the column will be lost.
  - You are about to drop the column `inbound_uuid` on the `hosts` table. All the data in the column will be lost.
  - You are about to drop the column `subscription_uuid` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `active_user_inbounds` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `inbounds` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `node_inbound_exclusions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `xray_config` table. If the table is not empty, all the data it contains will be lost.

*/





-- CreateTable
CREATE TABLE "internal_squads" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "internal_squads_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "internal_squad_members" (
    "internal_squad_uuid" UUID NOT NULL,
    "user_uuid" UUID NOT NULL,

    CONSTRAINT "internal_squad_members_pkey" PRIMARY KEY ("internal_squad_uuid","user_uuid")
);

-- CreateTable
CREATE TABLE "internal_squad_inbounds" (
    "internal_squad_uuid" UUID NOT NULL,
    "inbound_uuid" UUID NOT NULL,

    CONSTRAINT "internal_squad_inbounds_pkey" PRIMARY KEY ("internal_squad_uuid","inbound_uuid")
);

-- CreateTable
CREATE TABLE "config_profiles" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "config_profiles_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "config_profile_inbounds" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_uuid" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "network" TEXT,
    "security" TEXT,
    "port" INTEGER,

    CONSTRAINT "config_profile_inbounds_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "config_profile_inbounds_to_nodes" (
    "config_profile_inbound_uuid" UUID NOT NULL,
    "node_uuid" UUID NOT NULL,

    CONSTRAINT "config_profile_inbounds_to_nodes_pkey" PRIMARY KEY ("config_profile_inbound_uuid","node_uuid")
);

-- AlterTable
ALTER TABLE "hosts"
ADD COLUMN     "config_profile_inbound_uuid" UUID,
ADD COLUMN     "config_profile_uuid" UUID;


-- AlterTable
ALTER TABLE "nodes" ADD COLUMN     "active_config_profile_uuid" UUID,
ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- CreateIndex
CREATE UNIQUE INDEX "internal_squads_name_key" ON "internal_squads"("name");

-- CreateIndex
CREATE INDEX "internal_squad_members_internal_squad_uuid_idx" ON "internal_squad_members"("internal_squad_uuid");

-- CreateIndex
CREATE INDEX "internal_squad_members_user_uuid_idx" ON "internal_squad_members"("user_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "config_profiles_name_key" ON "config_profiles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "config_profile_inbounds_tag_key" ON "config_profile_inbounds"("tag");

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_active_config_profile_uuid_fkey" FOREIGN KEY ("active_config_profile_uuid") REFERENCES "config_profiles"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_config_profile_inbound_uuid_fkey" FOREIGN KEY ("config_profile_inbound_uuid") REFERENCES "config_profile_inbounds"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_config_profile_uuid_fkey" FOREIGN KEY ("config_profile_uuid") REFERENCES "config_profiles"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_squad_members" ADD CONSTRAINT "internal_squad_members_internal_squad_uuid_fkey" FOREIGN KEY ("internal_squad_uuid") REFERENCES "internal_squads"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_squad_members" ADD CONSTRAINT "internal_squad_members_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_squad_inbounds" ADD CONSTRAINT "internal_squad_inbounds_internal_squad_uuid_fkey" FOREIGN KEY ("internal_squad_uuid") REFERENCES "internal_squads"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_squad_inbounds" ADD CONSTRAINT "internal_squad_inbounds_inbound_uuid_fkey" FOREIGN KEY ("inbound_uuid") REFERENCES "config_profile_inbounds"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_profile_inbounds" ADD CONSTRAINT "config_profile_inbounds_profile_uuid_fkey" FOREIGN KEY ("profile_uuid") REFERENCES "config_profiles"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_profile_inbounds_to_nodes" ADD CONSTRAINT "config_profile_inbounds_to_nodes_config_profile_inbound_uu_fkey" FOREIGN KEY ("config_profile_inbound_uuid") REFERENCES "config_profile_inbounds"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_profile_inbounds_to_nodes" ADD CONSTRAINT "config_profile_inbounds_to_nodes_node_uuid_fkey" FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;




-- 1. Make "Default" config profile from old xray_config
INSERT INTO config_profiles (uuid, name, config, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'Default-Profile',
  COALESCE(config, '{}'::jsonb), -- if config NULL, use empty object
  now(),
  now()
FROM xray_config 
LIMIT 1; -- take only first record, if there are multiple

-- Get UUID of created profile for further use
DO $$
DECLARE 
  default_profile_uuid UUID;
  default_squad_uuid UUID;
BEGIN
  -- Get UUID of created profile for further use
  SELECT uuid INTO default_profile_uuid 
  FROM config_profiles 
  WHERE name = 'Default-Profile';

  -- 3. Move all old inbounds to ConfigProfileInbounds (save UUID)
  INSERT INTO config_profile_inbounds (uuid, profile_uuid, tag, type, network, security)
  SELECT 
    uuid,  -- save old UUID
    default_profile_uuid,
    tag,
    type,
    network,
    security
  FROM inbounds;

  -- 4. Create InternalSquad "Default"
  INSERT INTO internal_squads (uuid, name, created_at, updated_at)
  VALUES (gen_random_uuid(), 'Default-Squad', now(), now())
  RETURNING uuid INTO default_squad_uuid;


  -- 5. Move all old inbounds to ConfigProfileInbounds
  INSERT INTO "internal_squad_inbounds" ("internal_squad_uuid", "inbound_uuid")
  SELECT 
    default_squad_uuid,
    uuid
  FROM inbounds;

  -- 6. Move all users to Default squad
  INSERT INTO "internal_squad_members" ("internal_squad_uuid", "user_uuid")
  SELECT default_squad_uuid, uuid
  FROM users;

  -- 7. Assign Default profile to all nodes
  UPDATE nodes 
  SET active_config_profile_uuid = default_profile_uuid;

  -- 8. KEY LOGIC: Move active inbounds for each node
  -- Active = ALL inbounds MINUS those in node_inbound_exclusions
  INSERT INTO "config_profile_inbounds_to_nodes" ("config_profile_inbound_uuid", "node_uuid")
  SELECT DISTINCT
    cpi.uuid as inbound_uuid,  -- A = config_profile_inbounds.uuid
    n.uuid as node_uuid        -- B = nodes.uuid  
  FROM nodes n
  CROSS JOIN config_profile_inbounds cpi  -- all inbounds for all nodes
  WHERE cpi.profile_uuid = default_profile_uuid
    AND NOT EXISTS (
      -- EXCLUDE those inbounds that were in exclusions (inactive)
      SELECT 1 
      FROM node_inbound_exclusions nie
      WHERE nie.node_uuid = n.uuid 
        AND nie.inbound_uuid = cpi.uuid
    );

  -- 9. Update hosts
  UPDATE hosts
  SET config_profile_uuid = default_profile_uuid;

  -- 10. Update hosts
  UPDATE hosts
  SET config_profile_inbound_uuid = inbound_uuid;


END $$;







-- DropForeignKey
ALTER TABLE "active_user_inbounds" DROP CONSTRAINT "active_user_inbounds_inbound_uuid_fkey";

-- DropForeignKey
ALTER TABLE "active_user_inbounds" DROP CONSTRAINT "active_user_inbounds_user_uuid_fkey";

-- DropForeignKey
ALTER TABLE "hosts" DROP CONSTRAINT "hosts_inbound_uuid_fkey";

-- DropForeignKey
ALTER TABLE "node_inbound_exclusions" DROP CONSTRAINT "node_inbound_exclusions_inbound_uuid_fkey";

-- DropForeignKey
ALTER TABLE "node_inbound_exclusions" DROP CONSTRAINT "node_inbound_exclusions_node_uuid_fkey";

-- DropIndex
DROP INDEX "users_subscription_uuid_key";

-- AlterTable
ALTER TABLE "admin" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "api_tokens" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "hosts" DROP COLUMN "allowinsecure",
DROP COLUMN "inbound_uuid";

-- AlterTable
ALTER TABLE "hwid_user_devices" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "keygen" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "nodes_traffic_usage_history" ALTER COLUMN "reset_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "nodes_usage_history" ALTER COLUMN "created_at" SET DEFAULT date_trunc('hour', now());

-- AlterTable
ALTER TABLE "nodes_user_usage_history" ALTER COLUMN "created_at" SET DEFAULT date_trunc('hour', now()),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "subscription_settings" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "subscription_templates" ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "user_traffic_history" ALTER COLUMN "reset_at" SET DEFAULT now();

-- AlterTable
ALTER TABLE "users" DROP COLUMN "subscription_uuid",
ALTER COLUMN "created_at" SET DEFAULT now(),
ALTER COLUMN "updated_at" SET DEFAULT now();

-- DropTable
DROP TABLE "active_user_inbounds";

-- DropTable
DROP TABLE "inbounds";

-- DropTable
DROP TABLE "node_inbound_exclusions";

-- DropTable
DROP TABLE "xray_config";



