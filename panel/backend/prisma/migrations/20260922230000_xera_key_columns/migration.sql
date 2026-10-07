CREATE TABLE IF NOT EXISTS "xera_keyring" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "key_id" TEXT NOT NULL DEFAULT 'xera-1',
    "rotated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "xera_keyring_pkey" PRIMARY KEY ("id")
);
INSERT INTO "xera_keyring" ("id") VALUES (1) ON CONFLICT DO NOTHING;
