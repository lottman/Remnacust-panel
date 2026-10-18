CREATE TABLE "xera_session_recordings" (
    "id" UUID PRIMARY KEY,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "ends_at" TIMESTAMPTZ NOT NULL,
    "interval_seconds" INTEGER NOT NULL CHECK (interval_seconds BETWEEN 10 AND 300),
    "status" TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed')),
    "snapshot" JSONB NOT NULL,
    "next_poll_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "lease_until" TIMESTAMPTZ,
    "token" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "xera_session_recordings_expires_at_idx" ON "xera_session_recordings" ("expires_at");
