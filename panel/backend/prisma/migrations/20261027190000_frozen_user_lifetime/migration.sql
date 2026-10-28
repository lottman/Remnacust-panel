ALTER TABLE users ADD COLUMN frozen_at timestamp(3);

CREATE FUNCTION remnacust_freeze_user_lifetime() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    at_time timestamp(3) := statement_timestamp() AT TIME ZONE 'UTC';
BEGIN
    -- Only activation resumes the clock. Bulk changes to other statuses leave it paused.
    IF TG_OP = 'UPDATE' AND OLD.status = 'FROZEN' AND NEW.status NOT IN ('FROZEN', 'ACTIVE') THEN
        NEW.status := 'FROZEN';
    END IF;
    IF NEW.status = 'FROZEN' THEN
        IF TG_OP = 'UPDATE' AND OLD.status = 'FROZEN' THEN
            NEW.frozen_at := OLD.frozen_at;
        ELSE
            NEW.frozen_at := at_time;
            NEW.expire_at := greatest(NEW.expire_at, at_time);
        END IF;
    ELSE
        IF TG_OP = 'UPDATE' AND OLD.status = 'FROZEN' THEN
            IF NEW.expire_at IS NOT DISTINCT FROM OLD.expire_at THEN
                NEW.expire_at := at_time + greatest(OLD.expire_at - OLD.frozen_at, interval '0 seconds');
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
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER a_remnacust_freeze_user_lifetime
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION remnacust_freeze_user_lifetime();

ALTER TABLE users ADD CONSTRAINT users_frozen_lifetime_check
CHECK ((status = 'FROZEN') = (frozen_at IS NOT NULL));
