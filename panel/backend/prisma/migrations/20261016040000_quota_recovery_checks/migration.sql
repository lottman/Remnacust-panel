-- Diagnostic observations never release reserves or clear a restore barrier.
-- One current result per node and restore generation, not one row per poll.
CREATE TABLE xera_quota_recovery_checks (
    generation UUID NOT NULL,
    node_uuid UUID NOT NULL,
    request_id UUID NOT NULL,
    actor_uuid UUID NOT NULL,
    source_digest TEXT NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    finished_at TIMESTAMPTZ,
    report JSONB CHECK(report IS NULL OR (jsonb_typeof(report)='object' AND octet_length(report::text)<=65536)),
    PRIMARY KEY(generation,node_uuid),
    CHECK((finished_at IS NULL)=(report IS NULL))
);
