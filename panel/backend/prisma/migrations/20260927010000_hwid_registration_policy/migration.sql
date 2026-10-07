CREATE TABLE xera_hwid_registration_policy (
    user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    registration_allowed boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);
