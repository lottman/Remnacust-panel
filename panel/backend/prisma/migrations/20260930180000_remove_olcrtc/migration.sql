-- Retire the removed panel integration. Earlier migration checksums are preserved.
ALTER TABLE "hosts" DROP COLUMN IF EXISTS "olcrtc";
