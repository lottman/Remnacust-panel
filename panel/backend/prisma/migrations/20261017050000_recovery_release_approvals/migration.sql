-- Authorization, exact Node delivery inputs and their post-intent bank commit
-- together. The deferred FK permits the bank to include its own authorization
-- UUID without placing the bank digest inside the data being hashed.
CREATE TABLE xera_quota_recovery_release_approvals (
    request_id UUID PRIMARY KEY,
    generation UUID NOT NULL UNIQUE,
    actor_uuid UUID NOT NULL,
    bank_request UUID NOT NULL REFERENCES xera_quota_recovery_banks(request_id),
    baseline_request UUID NOT NULL UNIQUE REFERENCES xera_quota_recovery_banks(request_id) DEFERRABLE INITIALLY DEFERRED,
    request_digest TEXT NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
    plan_digest TEXT NOT NULL CHECK(plan_digest ~ '^[a-f0-9]{64}$'),
    plan_text TEXT NOT NULL CHECK(octet_length(plan_text) BETWEEN 1 AND 33554432),
    observations JSONB NOT NULL CHECK(jsonb_typeof(observations)='array' AND octet_length(observations::text)<=16777216),
    queue_proof JSONB NOT NULL CHECK(jsonb_typeof(queue_proof)='object' AND octet_length(queue_proof::text)<=16384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK(plan_digest=encode(sha256(convert_to(plan_text,'UTF8')),'hex')),
    CHECK((plan_text::jsonb->>'version'='remnacust-recovery-release-plan-v1'
        AND plan_text::jsonb->>'requestId'=request_id::text
        AND plan_text::jsonb->>'generation'=generation::text
        AND plan_text::jsonb->>'bankRequest'=bank_request::text
        AND jsonb_array_length(plan_text::jsonb->'nodes') BETWEEN 1 AND 10000
        AND queue_proof->>'scope'='recovery') IS TRUE)
);
CREATE TRIGGER xera_recovery_release_approval_immutable BEFORE UPDATE OR DELETE ON xera_quota_recovery_release_approvals
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_recovery_release_approval_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_release_approvals
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();

CREATE TABLE xera_quota_recovery_release_jobs (
    request_id UUID PRIMARY KEY,
    approval_request UUID NOT NULL REFERENCES xera_quota_recovery_release_approvals(request_id),
    node_uuid UUID NOT NULL,
    evidence_request UUID NOT NULL REFERENCES xera_quota_recovery_evidence(request_id),
    connection_hash TEXT NOT NULL CHECK(connection_hash ~ '^[a-f0-9]{64}$'),
    payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=4096),
    previous JSONB NOT NULL CHECK(jsonb_typeof(previous)='object' AND octet_length(previous::text)<=2048),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    lease_owner UUID,
    lease_until TIMESTAMPTZ,
    result JSONB CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND octet_length(result::text)<=16384)),
    UNIQUE(approval_request,node_uuid),
    CHECK((lease_owner IS NULL)=(lease_until IS NULL)),
    CHECK((payload->>'requestId'=request_id::text AND payload->>'previous'=previous->>'digest'
        AND previous->>'state'='FENCED' AND payload->>'generation'=previous->>'generation') IS TRUE)
);
CREATE INDEX xera_recovery_release_jobs_node ON xera_quota_recovery_release_jobs(node_uuid,approval_request);
CREATE FUNCTION xera_guard_recovery_release_job() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        IF NEW.result IS NOT NULL OR NEW.lease_owner IS NOT NULL THEN RAISE EXCEPTION 'release job must start pending'; END IF;
        RETURN NEW;
    END IF;
    IF TG_OP='DELETE' OR (NEW.request_id,NEW.approval_request,NEW.node_uuid,NEW.evidence_request,NEW.connection_hash,NEW.payload,NEW.previous,NEW.created_at)
        IS DISTINCT FROM (OLD.request_id,OLD.approval_request,OLD.node_uuid,OLD.evidence_request,OLD.connection_hash,OLD.payload,OLD.previous,OLD.created_at)
        OR (OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result) THEN
        RAISE EXCEPTION 'recovery release intent is immutable';
    END IF;
    IF NEW.result IS NOT NULL AND NOT COALESCE(
        NEW.result->>'requestId'=NEW.payload->>'requestId'
        AND NEW.result->>'generation'=NEW.payload->>'generation'
        AND NEW.result->>'coreProcessId'=NEW.payload->>'coreProcessId'
        AND NEW.result->>'instance'=NEW.payload->>'instance'
        AND NEW.result->>'policyRevision'=NEW.payload->>'policyRevision'
        AND NEW.result->>'policyGeneration'=NEW.payload->>'policyGeneration'
        AND NEW.result->>'journalDigest'=NEW.payload->>'journalDigest'
        AND NEW.result->>'witnessDigest'=NEW.payload->>'witnessDigest'
        AND NEW.result->'quotaRecovery'->'record'->>'state'='RELEASED'
        AND NEW.result->'quotaRecovery'->'record'->>'generation'=NEW.payload->>'generation'
        AND NEW.result->'quotaRecovery'->'record'->>'token'=NEW.request_id::text
        AND NEW.result->'quotaRecovery'->'record'->>'previous'=NEW.previous->>'digest'
        AND (NEW.result->'quotaRecovery'->'record'->>'sequence')::numeric=(NEW.previous->>'sequence')::numeric+1,false) THEN
        RAISE EXCEPTION 'invalid recovery release acknowledgement';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_recovery_release_job_guard BEFORE INSERT OR UPDATE OR DELETE ON xera_quota_recovery_release_jobs
    FOR EACH ROW EXECUTE FUNCTION xera_guard_recovery_release_job();
CREATE TRIGGER xera_recovery_release_job_no_truncate BEFORE TRUNCATE ON xera_quota_recovery_release_jobs
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();


CREATE FUNCTION xera_check_recovery_release_graph() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE approval UUID; item xera_quota_recovery_release_approvals%ROWTYPE; expected INTEGER;
BEGIN
    IF TG_TABLE_NAME='xera_quota_recovery_release_approvals' THEN approval:=NEW.request_id;
    ELSE approval:=NEW.approval_request; END IF;
    SELECT * INTO item FROM xera_quota_recovery_release_approvals WHERE request_id=approval;
    IF NOT FOUND THEN RAISE EXCEPTION 'missing release approval'; END IF;
    expected:=jsonb_array_length(item.plan_text::jsonb->'nodes');
    IF (SELECT count(*) FROM xera_quota_recovery_release_jobs WHERE approval_request=approval)<>expected
        OR jsonb_array_length(item.observations)<>expected
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(item.plan_text::jsonb->'nodes') n
            LEFT JOIN xera_quota_recovery_release_jobs j ON j.approval_request=approval AND j.request_id=(n->'payload'->>'requestId')::uuid
            WHERE j.request_id IS NULL OR j.node_uuid::text IS DISTINCT FROM n->>'node'
                OR j.connection_hash IS DISTINCT FROM n->>'connectionHash' OR j.payload IS DISTINCT FROM n->'payload'
                OR j.previous IS DISTINCT FROM n->'previous'
                OR j.payload->>'generation' IS DISTINCT FROM item.generation::text
                OR (SELECT count(*) FROM jsonb_array_elements(item.observations) o
                    WHERE o->>'node'=j.node_uuid::text AND o->>'checkRequest'=j.evidence_request::text)<>1)
        THEN RAISE EXCEPTION 'release delivery graph differs from approved plan'; END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER xera_recovery_release_graph_approval AFTER INSERT ON xera_quota_recovery_release_approvals
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xera_check_recovery_release_graph();
CREATE CONSTRAINT TRIGGER xera_recovery_release_graph_job AFTER INSERT ON xera_quota_recovery_release_jobs
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xera_check_recovery_release_graph();
