ALTER TABLE hosts
    ADD COLUMN traffic_limit_reset_value integer NOT NULL DEFAULT 0,
    ADD COLUMN traffic_limit_reset_unit text NOT NULL DEFAULT 'DAYS',
    ADD COLUMN traffic_limit_reset_anchor_at timestamptz NOT NULL DEFAULT '1970-01-01 00:00:00+00',
    ADD CONSTRAINT hosts_traffic_limit_reset_value_check CHECK (traffic_limit_reset_value BETWEEN 0 AND 3650),
    ADD CONSTRAINT hosts_traffic_limit_reset_unit_check CHECK (traffic_limit_reset_unit IN ('DAYS', 'MONTHS'));

ALTER TABLE xera_host_tag_limits
    ADD COLUMN reset_value integer NOT NULL DEFAULT 0,
    ADD COLUMN reset_unit text NOT NULL DEFAULT 'DAYS',
    ADD COLUMN reset_anchor_at timestamptz NOT NULL DEFAULT '1970-01-01 00:00:00+00',
    ADD CONSTRAINT xera_host_tag_limits_reset_value_check CHECK (reset_value BETWEEN 0 AND 3650),
    ADD CONSTRAINT xera_host_tag_limits_reset_unit_check CHECK (reset_unit IN ('DAYS', 'MONTHS'));

CREATE FUNCTION xera_quota_window_start(
    anchor_at timestamptz,
    reset_value integer,
    reset_unit text,
    current_at timestamptz
) RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    cycles bigint;
    months_delta bigint;
    candidate timestamptz;
BEGIN
    IF reset_value = 0 OR current_at <= anchor_at THEN
        RETURN anchor_at;
    END IF;
    IF reset_unit = 'DAYS' THEN
        cycles := floor(extract(epoch FROM current_at - anchor_at) / (reset_value::bigint * 86400));
        RETURN anchor_at + cycles * reset_value::bigint * 86400 * interval '1 second';
    END IF;
    months_delta := (
        (extract(year FROM current_at AT TIME ZONE 'UTC') - extract(year FROM anchor_at AT TIME ZONE 'UTC')) * 12
        + extract(month FROM current_at AT TIME ZONE 'UTC') - extract(month FROM anchor_at AT TIME ZONE 'UTC')
    )::bigint;
    cycles := greatest(0, floor(months_delta::numeric / reset_value)::bigint);
    candidate := ((anchor_at AT TIME ZONE 'UTC') + (cycles * reset_value) * interval '1 month') AT TIME ZONE 'UTC';
    IF candidate > current_at THEN
        cycles := cycles - 1;
    END IF;
    RETURN ((anchor_at AT TIME ZONE 'UTC') + (cycles * reset_value) * interval '1 month') AT TIME ZONE 'UTC';
END;
$$;
