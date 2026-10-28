CREATE OR REPLACE FUNCTION remnacust_freeze_user_lifetime() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    at_time timestamp(3) := statement_timestamp() AT TIME ZONE 'UTC';
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = 'FROZEN' AND NEW.status NOT IN ('FROZEN', 'ACTIVE') THEN
        NEW.status := 'FROZEN';
    END IF;
    IF NEW.status = 'FROZEN' THEN
        IF TG_OP = 'UPDATE' AND OLD.status = 'FROZEN' THEN
            NEW.frozen_at := OLD.frozen_at;
        ELSIF NEW.expire_at <= at_time OR (TG_OP = 'UPDATE' AND OLD.status = 'EXPIRED') THEN
            -- Bulk updates and imports must not turn expired accounts into paused accounts.
            NEW.status := 'EXPIRED';
            NEW.frozen_at := NULL;
        ELSE
            NEW.frozen_at := at_time;
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
