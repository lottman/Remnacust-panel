#!/usr/bin/env bash
# Failure-path checks with a Docker stub and temporary files only.
set -Eeuo pipefail
project=$(cd "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/install"
export FIXTURE=$fixture
printf 'services: {}\n' > "$fixture/install/compose.yml"
printf 'APP_SECRET=test-only-original-key\n' > "$fixture/install/.env"
cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$FIXTURE/docker-requests"
case " $* " in
    *' config --services '*) printf 'remnawave\nremnawave-db\n';;
    *' config --no-interpolate --no-env-resolution --format json '*)
        printf '%s\n' '{"services":{"remnawave":{"image":"panel:old"},"remnawave-db":{"container_name":"custom-db"},"background":{"image":"panel:old","environment":{"INSTANCE_TYPE":"processor"}},"clock":{"image":"scheduler:old","environment":{"INSTANCE_TYPE":"scheduler"}}}}';;
    *'com.docker.compose.project'*) printf 'custom-project\n';;
    *' ps --quiet remnawave-db '*) [[ ${MOCK_MISSING_PROJECT:-false} != true ]] || exit 1; printf 'fixture-db-id\n';;
    *' ps --status running --services '*) [[ ${MOCK_WAS_RUNNING:-true} != true ]] || printf 'remnawave\nbackground\n';;
    *' pg_dump '*) [[ ${MOCK_DUMP_FAIL:-false} != true ]] || exit 9; printf 'PGDMP-test-fixture';;
    *' pg_restore --list '*) cat >/dev/null; [[ ${MOCK_INVALID_DUMP:-false} != true ]] || exit 9;;
    *'database-compatibility.js --check '*)
        if [[ -f $FIXTURE/repair-attempted && ${MOCK_POSTCHECK_FAIL:-false} == true ]]; then exit 9; fi
        count=1
        if [[ -f $FIXTURE/repair-attempted && ${MOCK_COMMIT_BUT_FAIL:-false} == true ]]; then count=0; fi
        printf '[{"admin":"admin","legacy_admin":null,"settings":"remnawave_settings","legacy_settings":null,"encrypted_user_count":"%s"}]\n' "$count";;
    *'database-compatibility.js --apply '*)
        touch "$FIXTURE/repair-attempted"
        [[ ${MOCK_REPAIR_FAIL:-false} != true && ${MOCK_COMMIT_BUT_FAIL:-false} != true ]] || exit 9;;
esac
MOCK
chmod +x "$fixture/bin/docker"
export PATH="$fixture/bin:$PATH"
run_repair() {
    rm -f "$fixture/repair-attempted"
    bash "$project/scripts/restore-remnawave-database.sh" --compose "$fixture/install/compose.yml" \
        --backup-dir "$fixture/backups" "$@" > "$fixture/result" 2>&1
}
pass() { printf 'PASS %s\n' "$1"; }
reject() { if run_repair --apply --yes; then cat "$fixture/result"; exit 1; fi; }
run_repair
! grep -q ' stop remnawave\|pg_dump\|--apply' "$fixture/docker-requests"
pass 'default check does not stop the panel or write the database'
MOCK_DUMP_FAIL=true reject
grep -q ' start remnawave background$' "$fixture/docker-requests"
! grep -q 'database-compatibility.js --apply' "$fixture/docker-requests"
pass 'failed backup restarts the same previous container without attempting repair'
> "$fixture/docker-requests"
MOCK_INVALID_DUMP=true reject
grep -q ' start remnawave background$' "$fixture/docker-requests"
! grep -q 'database-compatibility.js --apply' "$fixture/docker-requests"
pass 'invalid dump blocks repair'
> "$fixture/docker-requests"
MOCK_REPAIR_FAIL=true reject
grep -q ' start remnawave background$' "$fixture/docker-requests"
! grep -q ' start .*clock' "$fixture/docker-requests"
pass 'failed transaction restarts the previously running panel'
> "$fixture/docker-requests"
MOCK_WAS_RUNNING=false MOCK_REPAIR_FAIL=true reject
! grep -q ' start ' "$fixture/docker-requests"
pass 'failure never starts a panel that was already stopped'
> "$fixture/docker-requests"
run_repair --apply --yes
grep -q 'database-compatibility.js --apply' "$fixture/docker-requests"
! grep -q ' start ' "$fixture/docker-requests"
grep -q ' --project-name custom-project stop remnawave background clock$' "$fixture/docker-requests"
[[ $(find "$fixture/backups" -name database.dump -size +0c | wc -l) -gt 0 ]]
[[ $(find "$fixture/backups" -name .env -perm 600 | wc -l) -gt 0 ]]
pass 'successful repair saves a protected dump/env and keeps the panel stopped'
> "$fixture/docker-requests"
MOCK_MISSING_PROJECT=true reject
! grep -q ' stop \|pg_dump\|database-compatibility.js --apply' "$fixture/docker-requests"
pass 'a missing Compose project refuses repair before stopping or changing anything'
pass 'all API/processor/scheduler writers stop; failure restarts only previously running services'
> "$fixture/docker-requests"
MOCK_COMMIT_BUT_FAIL=true reject
! grep -q ' start ' "$fixture/docker-requests"
pass 'lost command result after commit never restarts the old backend on a changed database'
> "$fixture/docker-requests"
MOCK_REPAIR_FAIL=true MOCK_POSTCHECK_FAIL=true reject
! grep -q ' start ' "$fixture/docker-requests"
pass 'unavailable post-failure verification keeps writers stopped rather than guessing rollback'
