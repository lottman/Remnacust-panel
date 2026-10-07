#!/usr/bin/env bash
set -Eeuo pipefail
image=${1:?Usage: test-production-startup.sh PANEL_IMAGE}
test_project="remnacust-smoke-$$-$(date +%s)"
test_root=$(mktemp -d)
umask 077
cleanup() {
 local status=$?
 if [ "$status" != 0 ]; then docker logs --tail 60 "$test_project-app" 2>&1 || true; fi
 docker rm -f "$test_project-app" "$test_project-db" "$test_project-redis" >/dev/null 2>&1 || true
 docker network rm "$test_project" >/dev/null 2>&1 || true
 # Only files created by this test are removed.
 rm -f "$test_root/app.env" "$test_root/processes.json"
 rmdir "$test_root" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM
test_secret=$(python3 -c 'import secrets;print(secrets.token_hex(32))')
test_password=$(python3 -c 'import secrets;print(secrets.token_hex(24))')
docker network create "$test_project" >/dev/null
docker run -d --name "$test_project-db" --network "$test_project" --network-alias remnacust-smoke-db \
 -e POSTGRES_USER=smoke -e POSTGRES_DB=remnacust_startup_test -e POSTGRES_PASSWORD="$test_password" postgres:17.6 >/dev/null
docker run -d --name "$test_project-redis" --network "$test_project" --network-alias remnacust-smoke-redis valkey/valkey:8.1-alpine >/dev/null
for attempt in $(seq 1 30); do
 if docker exec "$test_project-db" pg_isready -U smoke -d remnacust_startup_test >/dev/null 2>&1;then break;fi
 sleep 1
done
cat > "$test_root/app.env" <<EOF
APP_SECRET=$test_secret
DATABASE_URL=postgresql://smoke:$test_password@remnacust-smoke-db:5432/remnacust_startup_test
REDIS_HOST=remnacust-smoke-redis
REDIS_PORT=6379
API_INSTANCES=2
WORKER_INSTANCES=1
APP_PORT=3000
METRICS_PORT=3001
FRONT_END_DOMAIN=panel.example.com
SUB_PUBLIC_DOMAIN=sub.example.com
METRICS_USER=smoke
METRICS_PASS=$test_password
HWID_ENABLED_DEFAULT=true
EOF
docker run -d --name "$test_project-app" --network "$test_project" --env-file "$test_root/app.env" "$image" >/dev/null
ready=0
for attempt in $(seq 1 60); do
 if docker exec "$test_project-app" node -e 'fetch("http://127.0.0.1:3000/api/auth/status",{headers:{"X-Forwarded-For":"127.0.0.1","X-Forwarded-Proto":"https"}}).then(async r=>{if(r.status!==200)throw Error("API unavailable");await r.json()}).catch(()=>process.exitCode=1)' >/dev/null 2>&1;then ready=1;break;fi
 sleep 2
done
test "$ready" = 1
# Give every process enough time to expose a boot failure and PM2 restart.
sleep 20
docker exec "$test_project-app" pm2 jlist > "$test_root/processes.json"
python3 - "$test_root/processes.json" <<'PY'
import json,sys
apps=json.load(open(sys.argv[1]));names=[a['name'] for a in apps]
assert names.count('remnawave-api')==2 and names.count('remnawave-jobs')==1 and names.count('remnawave-scheduler')==1, names
assert all(a['pm2_env']['status']=='online' and a['pm2_env']['restart_time']==0 for a in apps),'A production process failed during startup'
print('PASS: both API instances, worker and scheduler started without restarts')
PY
