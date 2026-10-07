/*
  Warnings:

  - A unique constraint covering the columns `[t_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/

-- 1. Add t_id column
ALTER TABLE "users" ADD COLUMN "t_id" BIGINT;

-- 2. Fill t_id in correct order
WITH numbered AS (
  SELECT uuid, ROW_NUMBER() OVER (ORDER BY created_at ASC, uuid ASC) as row_num
  FROM users
)
UPDATE users 
SET t_id = numbered.row_num
FROM numbered
WHERE users.uuid = numbered.uuid;

-- 3. Create sequence and set current value
CREATE SEQUENCE IF NOT EXISTS users_t_id_seq;
SELECT setval('users_t_id_seq', GREATEST(COALESCE((SELECT MAX(t_id) FROM users), 0), 1));

-- 4. Make field NOT NULL with default
ALTER TABLE "users" 
ALTER COLUMN "t_id" SET NOT NULL,
ALTER COLUMN "t_id" SET DEFAULT nextval('users_t_id_seq');

-- 5. Set sequence ownership
ALTER SEQUENCE users_t_id_seq OWNED BY users.t_id;

-- 6. Create unique index
CREATE UNIQUE INDEX "users_t_id_key" ON "users"("t_id");