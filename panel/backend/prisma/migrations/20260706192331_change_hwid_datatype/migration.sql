-- Drop 
DELETE FROM "hwid_user_devices"
WHERE "hwid" !~ '^[a-zA-Z0-9=-]{10,64}$';

-- AlterTable
ALTER TABLE "hwid_user_devices"
    DROP CONSTRAINT "hwid_user_devices_pkey",
    ALTER COLUMN "hwid" SET DATA TYPE VARCHAR(64),
    ADD CONSTRAINT "hwid_user_devices_pkey" PRIMARY KEY ("hwid", "user_id");