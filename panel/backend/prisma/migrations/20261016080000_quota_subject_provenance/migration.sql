-- Subscriber credentials can rotate and numeric IDs can be reused after a
-- restore. Quota subjects identify a row incarnation, never an access token.
CREATE TABLE xera_quota_subjects (
    subject_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL CHECK(user_id>0),
    user_created_at TIMESTAMP NOT NULL,
    origin TEXT NOT NULL CHECK(origin IN ('CREATED','MIGRATED')),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX xera_quota_subjects_owner ON xera_quota_subjects(user_id,observed_at,subject_uuid);
CREATE TABLE xera_quota_current_subjects (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    subject_uuid UUID NOT NULL UNIQUE REFERENCES xera_quota_subjects(subject_uuid)
);
INSERT INTO xera_quota_subjects(user_id,user_created_at,origin)
    SELECT id,created_at,'MIGRATED' FROM users;
INSERT INTO xera_quota_current_subjects(user_id,subject_uuid)
    SELECT user_id,subject_uuid FROM xera_quota_subjects;

CREATE FUNCTION xera_register_quota_subject() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE subject UUID;
BEGIN
    INSERT INTO xera_quota_subjects(user_id,user_created_at,origin)
        VALUES(NEW.id,NEW.created_at,'CREATED') RETURNING subject_uuid INTO subject;
    INSERT INTO xera_quota_current_subjects(user_id,subject_uuid) VALUES(NEW.id,subject);
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_quota_subject_registration AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION xera_register_quota_subject();
CREATE FUNCTION xera_guard_current_quota_subject() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'current quota subject cannot be rewritten';
END;
$$;
CREATE TRIGGER xera_quota_current_subjects_guard BEFORE UPDATE OR DELETE ON xera_quota_current_subjects
    FOR EACH ROW EXECUTE FUNCTION xera_guard_current_quota_subject();

-- These records deliberately have no cascading reference to the live owner,
-- pool or grant. Deletion must not erase the identity of an old liability.
CREATE TABLE xera_quota_pool_subjects (
    usage_account UUID PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('USER','HOST','TAG')),
    key TEXT NOT NULL,
    user_id BIGINT NOT NULL CHECK(user_id>0),
    window_start DATE NOT NULL,
    budget_epoch UUID NOT NULL,
    subject_uuid UUID REFERENCES xera_quota_subjects(subject_uuid),
    source TEXT NOT NULL CHECK(source IN ('ISSUED','LEGACY')),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((source='ISSUED')=(subject_uuid IS NOT NULL))
);
CREATE TABLE xera_quota_grant_subjects (
    grant_id UUID PRIMARY KEY,
    usage_account UUID NOT NULL REFERENCES xera_quota_pool_subjects(usage_account),
    kind TEXT NOT NULL CHECK(kind IN ('USER','HOST','TAG')),
    key TEXT NOT NULL,
    user_id BIGINT NOT NULL CHECK(user_id>0),
    window_start DATE NOT NULL,
    budget_epoch UUID NOT NULL,
    node_uuid UUID NOT NULL,
    instance_uuid UUID NOT NULL,
    subject_uuid UUID REFERENCES xera_quota_subjects(subject_uuid),
    source TEXT NOT NULL CHECK(source IN ('ISSUED','LEGACY')),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((source='ISSUED')=(subject_uuid IS NOT NULL))
);
CREATE INDEX xera_quota_grant_subjects_node ON xera_quota_grant_subjects(node_uuid,grant_id);
-- A migration cannot retrospectively prove who owned a physical node's grant.
-- Keep legacy identity explicitly unknown, even when the numeric ID exists.
INSERT INTO xera_quota_pool_subjects(usage_account,kind,key,user_id,window_start,budget_epoch,source)
    SELECT usage_account,kind,key,user_id,window_start,budget_epoch,'LEGACY' FROM xera_quota_reserve_pools;
INSERT INTO xera_quota_grant_subjects(grant_id,usage_account,kind,key,user_id,window_start,budget_epoch,node_uuid,instance_uuid,source)
    SELECT g.id,p.usage_account,g.kind,g.key,g.user_id,g.window_start,g.budget_epoch,g.node_uuid,g.instance_uuid,'LEGACY'
    FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch);

CREATE FUNCTION xera_record_quota_pool_subject() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE subject UUID;
BEGIN
    SELECT subject_uuid INTO subject FROM xera_quota_current_subjects WHERE user_id=NEW.user_id;
    IF subject IS NULL THEN RAISE EXCEPTION 'quota pool requires its current subject'; END IF;
    INSERT INTO xera_quota_pool_subjects(usage_account,kind,key,user_id,window_start,budget_epoch,subject_uuid,source)
        VALUES(NEW.usage_account,NEW.kind,NEW.key,NEW.user_id,NEW.window_start,NEW.budget_epoch,subject,'ISSUED');
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_quota_pool_subject_registration AFTER INSERT ON xera_quota_reserve_pools
    FOR EACH ROW EXECUTE FUNCTION xera_record_quota_pool_subject();
CREATE FUNCTION xera_record_quota_grant_subject() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE subject UUID; account UUID;
BEGIN
    SELECT subject_uuid INTO subject FROM xera_quota_current_subjects WHERE user_id=NEW.user_id;
    SELECT usage_account INTO account FROM xera_quota_reserve_pools
        WHERE (kind,key,user_id,window_start,budget_epoch)=(NEW.kind,NEW.key,NEW.user_id,NEW.window_start,NEW.budget_epoch);
    IF subject IS NULL OR account IS NULL THEN RAISE EXCEPTION 'quota grant requires its current subject and pool'; END IF;
    INSERT INTO xera_quota_grant_subjects(grant_id,usage_account,kind,key,user_id,window_start,budget_epoch,node_uuid,instance_uuid,subject_uuid,source)
        VALUES(NEW.id,account,NEW.kind,NEW.key,NEW.user_id,NEW.window_start,NEW.budget_epoch,NEW.node_uuid,NEW.instance_uuid,subject,'ISSUED');
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_quota_grant_subject_registration AFTER INSERT ON xera_quota_reserves
    FOR EACH ROW EXECUTE FUNCTION xera_record_quota_grant_subject();

CREATE FUNCTION xera_guard_quota_pool_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (OLD.usage_account,OLD.kind,OLD.key,OLD.user_id,OLD.window_start,OLD.budget_epoch)
        IS DISTINCT FROM (NEW.usage_account,NEW.kind,NEW.key,NEW.user_id,NEW.window_start,NEW.budget_epoch) THEN
        RAISE EXCEPTION 'quota pool identity cannot be rewritten';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_quota_pool_identity BEFORE UPDATE ON xera_quota_reserve_pools
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_pool_identity();
CREATE FUNCTION xera_guard_quota_grant_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (OLD.id,OLD.kind,OLD.key,OLD.user_id,OLD.window_start,OLD.budget_epoch,OLD.node_uuid,OLD.instance_uuid)
        IS DISTINCT FROM (NEW.id,NEW.kind,NEW.key,NEW.user_id,NEW.window_start,NEW.budget_epoch,NEW.node_uuid,NEW.instance_uuid) THEN
        RAISE EXCEPTION 'quota grant identity cannot be rewritten';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER xera_quota_grant_identity BEFORE UPDATE ON xera_quota_reserves
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_grant_identity();

CREATE TRIGGER xera_quota_subjects_immutable BEFORE UPDATE OR DELETE ON xera_quota_subjects
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_subjects_no_truncate BEFORE TRUNCATE ON xera_quota_subjects
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_current_subjects_no_truncate BEFORE TRUNCATE ON xera_quota_current_subjects
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_pool_subjects_immutable BEFORE UPDATE OR DELETE ON xera_quota_pool_subjects
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_pool_subjects_no_truncate BEFORE TRUNCATE ON xera_quota_pool_subjects
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_grant_subjects_immutable BEFORE UPDATE OR DELETE ON xera_quota_grant_subjects
    FOR EACH ROW EXECUTE FUNCTION xera_guard_quota_recovery_evidence();
CREATE TRIGGER xera_quota_grant_subjects_no_truncate BEFORE TRUNCATE ON xera_quota_grant_subjects
    EXECUTE FUNCTION xera_guard_quota_recovery_evidence();

ALTER TABLE xera_quota_recovery_evidence_parts DROP CONSTRAINT xera_quota_recovery_evidence_parts_section_check;
ALTER TABLE xera_quota_recovery_evidence_parts ADD CONSTRAINT xera_quota_recovery_evidence_parts_section_check
    CHECK(section IN ('STATE','GRANTS','WATERMARKS','EXPOSURES','IDENTITIES'));
