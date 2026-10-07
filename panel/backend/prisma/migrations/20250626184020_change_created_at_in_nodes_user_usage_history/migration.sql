/*
  Warnings:

  - The primary key for the `nodes_user_usage_history` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/


-- 1. Create new table with correct structure
CREATE UNLOGGED TABLE nodes_user_usage_history_new (
    node_uuid UUID NOT NULL,
    user_uuid UUID NOT NULL,
    download_bytes BIGINT NOT NULL DEFAULT 0,
    upload_bytes BIGINT NOT NULL DEFAULT 0,
    total_bytes BIGINT NOT NULL DEFAULT 0,
    created_at DATE NOT NULL DEFAULT CURRENT_DATE,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Create index for GROUP BY
CREATE INDEX temp_group_idx ON nodes_user_usage_history_new 
(node_uuid, user_uuid, created_at);

-- 3. Aggregate data
INSERT INTO nodes_user_usage_history_new (
    node_uuid,
    user_uuid,
    download_bytes,
    upload_bytes,
    total_bytes,
    created_at,
    updated_at
)
SELECT 
    node_uuid,
    user_uuid,
    SUM(download_bytes) as download_bytes,
    SUM(upload_bytes) as upload_bytes,
    SUM(total_bytes) as total_bytes,
    DATE(created_at) as created_at,
    MAX(updated_at) as updated_at
FROM nodes_user_usage_history
GROUP BY 
    node_uuid, 
    user_uuid, 
    DATE(created_at);

-- 4. Drop all constraints and indexes from old table
ALTER TABLE nodes_user_usage_history DROP CONSTRAINT IF EXISTS nodes_user_usage_history_pkey;
ALTER TABLE nodes_user_usage_history DROP CONSTRAINT IF EXISTS nodes_user_usage_history_node_uuid_fkey;
ALTER TABLE nodes_user_usage_history DROP CONSTRAINT IF EXISTS nodes_user_usage_history_user_uuid_fkey;

DROP INDEX IF EXISTS nodes_user_usage_history_user_uuid_updated_at_idx;
DROP INDEX IF EXISTS nodes_user_usage_history_node_uuid_created_at_idx;

-- 5. Instant rename
DROP INDEX IF EXISTS temp_group_idx;

DROP TABLE nodes_user_usage_history;

ALTER TABLE nodes_user_usage_history_new RENAME TO nodes_user_usage_history;

-- 6. Enable WAL logging for production
ALTER TABLE nodes_user_usage_history SET LOGGED;

-- 7. Create PRIMARY KEY
ALTER TABLE nodes_user_usage_history 
ADD CONSTRAINT nodes_user_usage_history_pkey 
PRIMARY KEY (node_uuid, user_uuid, created_at);

-- 8. Create foreign keys
ALTER TABLE nodes_user_usage_history 
ADD CONSTRAINT nodes_user_usage_history_node_uuid_fkey 
FOREIGN KEY (node_uuid) REFERENCES nodes(uuid) ON DELETE CASCADE;

ALTER TABLE nodes_user_usage_history 
ADD CONSTRAINT nodes_user_usage_history_user_uuid_fkey 
FOREIGN KEY (user_uuid) REFERENCES users(uuid) ON DELETE CASCADE;

-- 9. Create indexes
CREATE INDEX nodes_user_usage_history_user_uuid_updated_at_idx 
ON nodes_user_usage_history (user_uuid, updated_at DESC);

CREATE INDEX nodes_user_usage_history_node_uuid_created_at_idx 
ON nodes_user_usage_history (node_uuid, created_at DESC);

COMMIT;


-- AlterTable
ALTER TABLE "nodes_usage_history" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
ALTER COLUMN "created_at" SET DEFAULT date_trunc('hour', now());

-- Update nodes_usage_history table
UPDATE "nodes_usage_history" SET "updated_at" = date_trunc('hour', "created_at") + INTERVAL '1 hour' - INTERVAL '1 second';


