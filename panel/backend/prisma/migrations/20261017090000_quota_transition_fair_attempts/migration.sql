-- Persist scheduling progress, not financial progress. A failed/offline node
-- must not monopolize every bounded batch after a coordinator restart.
ALTER TABLE xera_quota_transition_nodes ADD COLUMN last_attempted_at TIMESTAMPTZ;
CREATE INDEX xera_quota_transition_attempt_order
    ON xera_quota_transition_nodes(transition_id,last_attempted_at ASC NULLS FIRST,node_uuid);
ALTER TABLE xera_quota_node_progress ADD COLUMN last_attempted_at TIMESTAMPTZ;
