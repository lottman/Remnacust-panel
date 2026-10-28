// Runs only against an explicitly selected disposable loopback database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const databaseUrl = process.env.FROZEN_TEST_DATABASE_URL;
if (databaseUrl) {
    const target = new URL(databaseUrl);
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '55439');
} else assert.equal(process.env.FROZEN_TEST_CONTAINER, 'remnacust-deep-audit-pg');
const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261027190000_frozen_user_lifetime/migration.sql'), 'utf8');
const schema = `frozen_test_${process.pid}`;
const input = `
BEGIN;
CREATE SCHEMA ${schema};
SET LOCAL search_path TO ${schema};
SET LOCAL TIME ZONE 'Asia/Tokyo';
CREATE TABLE users(id bigint PRIMARY KEY, status text NOT NULL, expire_at timestamp(3) NOT NULL, traffic_limit_bytes bigint NOT NULL DEFAULT 0);
CREATE TABLE user_traffic(id bigint PRIMARY KEY, used_traffic_bytes bigint NOT NULL DEFAULT 0);
${migration}
DO $test$
DECLARE row users%ROWTYPE; current_utc timestamp := statement_timestamp() AT TIME ZONE 'UTC';
BEGIN
 INSERT INTO users VALUES (1,'ACTIVE',current_utc + interval '2 days',0,NULL);
 INSERT INTO user_traffic VALUES (1,0);
 UPDATE users SET status='FROZEN' WHERE id=1;
 SELECT * INTO row FROM users WHERE id=1;
 IF row.expire_at-row.frozen_at <> interval '2 days' THEN RAISE EXCEPTION 'wrong initial remainder'; END IF;
 ALTER TABLE users DISABLE TRIGGER a_remnacust_freeze_user_lifetime;
 UPDATE users SET frozen_at=frozen_at-interval '10 days', expire_at=expire_at-interval '10 days' WHERE id=1;
 ALTER TABLE users ENABLE TRIGGER a_remnacust_freeze_user_lifetime;
 UPDATE users SET status='FROZEN' WHERE id=1;
 UPDATE users SET status='DISABLED' WHERE id=1;
 SELECT * INTO row FROM users WHERE id=1;
 IF row.status <> 'FROZEN' OR row.expire_at-row.frozen_at <> interval '2 days' THEN RAISE EXCEPTION 'pause changed or resumed early'; END IF;
 UPDATE users SET expire_at=expire_at+interval '1 day' WHERE id=1;
 UPDATE users SET status='ACTIVE' WHERE id=1;
 SELECT * INTO row FROM users WHERE id=1;
 IF row.status <> 'ACTIVE' OR row.frozen_at IS NOT NULL OR abs(extract(epoch FROM (row.expire_at-current_utc-interval '3 days'))) > 0.002 THEN RAISE EXCEPTION 'resume failed: %, expiry %, now %', row.status, row.expire_at, current_utc; END IF;
 INSERT INTO users VALUES (2,'FROZEN',current_utc-interval '1 day',0,NULL);
 INSERT INTO user_traffic VALUES (2,0);
 UPDATE users SET status='ACTIVE' WHERE id=2;
 IF (SELECT status FROM users WHERE id=2) <> 'EXPIRED' THEN RAISE EXCEPTION 'empty pause granted access'; END IF;
 INSERT INTO users VALUES (3,'FROZEN',current_utc+interval '2 days',100,NULL);
 INSERT INTO user_traffic VALUES (3,100);
 UPDATE users SET status='ACTIVE' WHERE id=3;
 IF (SELECT status FROM users WHERE id=3) <> 'LIMITED' THEN RAISE EXCEPTION 'quota bypass'; END IF;
END $test$;
${fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261028190000_reject_expired_freeze/migration.sql'), 'utf8')}
DO $test$
DECLARE at_time timestamp := statement_timestamp() AT TIME ZONE 'UTC';
BEGIN
 INSERT INTO users VALUES (4,'ACTIVE',at_time-interval '1 second',0,NULL);
 INSERT INTO users VALUES (5,'ACTIVE',at_time+interval '2 days',0,NULL);
 INSERT INTO users VALUES (6,'EXPIRED',at_time+interval '2 days',0,NULL);
 UPDATE users SET status='FROZEN' WHERE id IN (4,5,6);
 IF (SELECT status FROM users WHERE id=4) <> 'EXPIRED' OR (SELECT frozen_at FROM users WHERE id=4) IS NOT NULL THEN RAISE EXCEPTION 'expired freeze accepted'; END IF;
 IF (SELECT status FROM users WHERE id=5) <> 'FROZEN' THEN RAISE EXCEPTION 'valid bulk freeze rejected'; END IF;
 IF (SELECT status FROM users WHERE id=6) <> 'EXPIRED' THEN RAISE EXCEPTION 'expired status freeze accepted'; END IF;
 INSERT INTO users VALUES (7,'FROZEN',at_time,0,NULL);
 IF (SELECT status FROM users WHERE id=7) <> 'EXPIRED' THEN RAISE EXCEPTION 'expired import freeze accepted'; END IF;
 UPDATE users SET status='FROZEN' WHERE id=5;
 IF (SELECT expire_at-frozen_at FROM users WHERE id=5) <> interval '2 days' THEN RAISE EXCEPTION 'repeated freeze changed lifetime'; END IF;
END $test$;
ROLLBACK;
`;
const result = databaseUrl
    ? spawnSync('docker', ['run', '--rm', '-i', '--network', 'host', 'mirror.gcr.io/library/postgres:17.6', 'psql', databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', timeout: 60000 })
    : spawnSync('wsl.exe', ['-d', 'Ubuntu-24.04', '-u', 'root', '--', 'docker', 'exec', '-i', process.env.FROZEN_TEST_CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input, encoding: 'utf8', timeout: 60000 });
assert.equal(result.status, 0, result.stderr || result.stdout);
console.log('PASS real PostgreSQL: frozen clock, repeated freeze, extension, resume, zero lifetime, quota and non-UTC timezone');
