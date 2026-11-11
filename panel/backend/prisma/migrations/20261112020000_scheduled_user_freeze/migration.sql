ALTER TABLE users ADD COLUMN frozen_until timestamp(3);
ALTER TABLE users ADD CONSTRAINT users_freeze_deadline_status CHECK (frozen_until IS NULL OR status='FROZEN');
CREATE INDEX users_frozen_until_due_idx ON users(frozen_until,id) WHERE status='FROZEN' AND frozen_until IS NOT NULL;

CREATE OR REPLACE FUNCTION remnacust_freeze_user_lifetime() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    at_time timestamp(3) := statement_timestamp() AT TIME ZONE 'UTC';
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = 'FROZEN' AND NEW.status NOT IN ('FROZEN', 'ACTIVE') THEN
        NEW.status := 'FROZEN';
    END IF;
    IF NEW.status = 'FROZEN' THEN
        IF TG_OP = 'UPDATE' AND OLD.status = 'FROZEN' AND OLD.frozen_until IS NOT NULL THEN
            IF NEW.frozen_until IS DISTINCT FROM OLD.frozen_until THEN
                RAISE EXCEPTION 'Saved freeze deadline is immutable' USING ERRCODE='23514',CONSTRAINT='users_freeze_deadline_immutable';
            END IF;
        ELSIF TG_OP = 'INSERT' OR OLD.status <> 'FROZEN' OR NEW.frozen_until IS DISTINCT FROM OLD.frozen_until THEN
            IF NEW.frozen_until IS NULL OR NEW.frozen_until <= at_time THEN
                RAISE EXCEPTION 'A future freeze deadline is required' USING ERRCODE='23514',CONSTRAINT='users_freeze_deadline_valid';
            END IF;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.status = 'FROZEN' THEN
            NEW.frozen_at := OLD.frozen_at;
        ELSE
            NEW.frozen_at := at_time;
            NEW.expire_at := greatest(NEW.expire_at, at_time);
        END IF;
    ELSE
        IF TG_OP = 'UPDATE' AND OLD.status = 'FROZEN' THEN
            IF NEW.expire_at IS NOT DISTINCT FROM OLD.expire_at THEN
                NEW.expire_at := least(at_time,coalesce(OLD.frozen_until,at_time)) + greatest(OLD.expire_at - OLD.frozen_at, interval '0 seconds');
            END IF;
            IF NEW.status = 'ACTIVE' THEN
                IF NEW.expire_at <= at_time THEN
                    NEW.status := 'EXPIRED';
                ELSIF NEW.traffic_limit_bytes > 0 AND coalesce((SELECT used_traffic_bytes FROM user_traffic WHERE id = NEW.id), 0) >= NEW.traffic_limit_bytes THEN
                    NEW.status := 'LIMITED';
                END IF;
            END IF;
        END IF;
        NEW.frozen_at := NULL;
        NEW.frozen_until := NULL;
    END IF;
    RETURN NEW;
END;
$$;

ALTER TABLE xera_user_access_reconciliation ADD COLUMN base_pending boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION xera_queue_user_access() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO xera_user_access_reconciliation(user_id,base_pending)
    VALUES(NEW.id,OLD.status IS DISTINCT FROM NEW.status)
    ON CONFLICT(user_id) DO UPDATE SET revision=gen_random_uuid(),attempts=0,next_attempt_at=now(),
        base_pending=xera_user_access_reconciliation.base_pending OR EXCLUDED.base_pending;
    RETURN NULL;
END;
$$;
