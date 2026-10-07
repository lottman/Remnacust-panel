BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(642119804);

-- Restore upstream names without copying rows or changing foreign keys.
DO $$
BEGIN
    IF to_regclass('public.xera_remnawave_settings') IS NOT NULL THEN
        IF to_regclass('public.remnawave_settings') IS NOT NULL THEN
            RAISE EXCEPTION 'Both settings tables exist; resolve the conflict before migrating';
        END IF;
        ALTER TABLE public.xera_remnawave_settings RENAME TO remnawave_settings;
    END IF;
    IF to_regclass('public.xera_admin') IS NOT NULL THEN
        IF to_regclass('public.admin') IS NOT NULL THEN
            RAISE EXCEPTION 'Both admin tables exist; resolve the conflict before migrating';
        END IF;
        ALTER TABLE public.xera_admin RENAME TO admin;
    END IF;
    IF to_regclass('public.remnawave_settings') IS NULL OR to_regclass('public.admin') IS NULL THEN
        RAISE EXCEPTION 'Settings or admin table is missing; refusing to create empty replacements';
    END IF;
END $$;
COMMIT;
