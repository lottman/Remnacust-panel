#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

COMPOSE_FILE=''
ENV_FILE=''
PROJECT_NAME=''
IMAGE=remnacust-panel:1.1.1
BACKUP_ROOT=/opt/remnacust/backups
APPLY=false
YES=false
STOPPED=false
declare -a RUNNING_WRITERS=()
COMMITTED=false
SAFE_TO_RESUME=true
WORK=''
die() { printf 'Ошибка: %s\n' "$*" >&2; exit 1; }
while (($#)); do
    case "$1" in
        --compose|--env-file|--image|--backup-dir|--project-name)
            (($# >= 2)) || die "После $1 нужно значение"
            case "$1" in --compose) COMPOSE_FILE=$2;; --env-file) ENV_FILE=$2;; --image) IMAGE=$2;; --backup-dir) BACKUP_ROOT=$2;; --project-name) PROJECT_NAME=$2;; esac
            shift;;
        --apply) APPLY=true;; --yes) YES=true;;
        --help|-h)
            printf '%s\n' 'restore-remnawave-database.sh --compose /path/compose.yml [--project-name NAME] [--env-file /path/.env] [--image remnacust-panel:1.1.1] [--apply --yes]' \
                'По умолчанию только проверка. --apply сохраняет копию БД, останавливает панель и исправляет старую схему и ключи.' \
                'После успешного исправления панель остаётся остановленной: запустите новый совместимый образ или Remnawave 3.4.4.'
            exit 0;;
        *) die "Неизвестный параметр: $1";;
    esac
    shift
done
[[ -f $COMPOSE_FILE ]] || die 'Укажите существующий Compose-файл через --compose'
[[ $IMAGE =~ ^[A-Za-z0-9][A-Za-z0-9:./@_-]*$ ]] || die 'Некорректное имя образа'
COMPOSE_FILE=$(realpath -- "$COMPOSE_FILE")
[[ -z $ENV_FILE ]] || { [[ -f $ENV_FILE ]] || die 'Файл окружения не найден'; ENV_FILE=$(realpath -- "$ENV_FILE"); }
command -v docker >/dev/null || die 'Нужен Docker и Compose v2'
docker compose version >/dev/null
docker image inspect "$IMAGE" >/dev/null 2>&1 || die 'Сначала загрузите или соберите новый совместимый образ панели'
WORK=$(mktemp -d -t remnacust-db-repair.XXXXXXXX)
cleanup() {
    if $STOPPED && ((${#RUNNING_WRITERS[@]})) && ! $COMMITTED && $SAFE_TO_RESUME; then
        compose start "${RUNNING_WRITERS[@]}" >&2 || true
    fi
    [[ -z $WORK ]] || rm -rf -- "$WORK"
}
trap cleanup EXIT
declare -a COMPOSE=(docker compose --project-directory "$(dirname "$COMPOSE_FILE")" -f "$COMPOSE_FILE")
[[ -z $ENV_FILE ]] || COMPOSE+=(--env-file "$ENV_FILE")
[[ -z $PROJECT_NAME ]] || COMPOSE+=(--project-name "$PROJECT_NAME")
compose() { "${COMPOSE[@]}" "$@"; }
services=$(compose config --services)
grep -qx remnawave <<< "$services" && grep -qx remnawave-db <<< "$services" || die 'Нужны сервисы remnawave и remnawave-db'
compose config --no-interpolate --no-env-resolution --format json > "$WORK/config.json" ||
    die 'Нужен Compose v2 с --no-env-resolution; база не изменена'
python3 - "$WORK/config.json" "$WORK/writers" "$WORK/db-name" <<'PY'
import json,pathlib,sys
config=json.loads(pathlib.Path(sys.argv[1]).read_text());services=config['services']
image=services['remnawave'].get('image');writers=[]
for name,settings in services.items():
    role=(settings.get('environment') or {}).get('INSTANCE_TYPE')
    if name=='remnawave' or name in {'remnawave-processor','remnawave-scheduler'} or role in {'api','processor','scheduler'} or (image and settings.get('image')==image):
        writers.append(name)
pathlib.Path(sys.argv[2]).write_text('\n'.join(writers)+'\n')
pathlib.Path(sys.argv[3]).write_text(services['remnawave-db'].get('container_name',''))
PY
# A Compose file may have been launched with -p; using its directory name could
# leave the real writers running while repairing their database.
db_name=$(cat "$WORK/db-name")
if [[ -z $PROJECT_NAME && -n $db_name ]]; then
    PROJECT_NAME=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$db_name")
    [[ $PROJECT_NAME =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die 'Не удалось определить проект Compose; укажите --project-name'
    COMPOSE+=(--project-name "$PROJECT_NAME")
fi
db_container=$(compose ps --quiet remnawave-db)
[[ -n $db_container && $db_container != *$'\n'* ]] || die 'В этом проекте не найдена работающая БД; проверьте --project-name'
mapfile -t WRITERS < "$WORK/writers"
printf 'services:\n  remnawave:\n    image: %s\n    pull_policy: never\n' "$IMAGE" > "$WORK/override.yml"
check_or_apply() {
    "${COMPOSE[@]}" -f "$WORK/override.yml" run --rm --no-deps --entrypoint node remnawave \
        /opt/app/dist/database-compatibility.js "$1"
}
check_or_apply --check
if ! $APPLY; then
    printf 'База не изменена. Для исправления повторите с --apply.\n'
    exit 0
fi
[[ $BACKUP_ROOT == /* && $BACKUP_ROOT != / ]] || die 'Для копии нужен отдельный абсолютный каталог'
if ! $YES; then
    [[ -t 0 ]] || die 'Для запуска без терминала явно укажите --yes'
    read -r -p 'Сохранить копию, остановить панель и исправить БД? Введите yes: ' reply
    [[ $reply == yes ]] || exit 0
fi
mkdir -p "$BACKUP_ROOT"
exec 9> "$BACKUP_ROOT/.compatibility.lock"
flock -n 9 || die 'Уже выполняется исправление базы'
backup=$(mktemp -d "$BACKUP_ROOT/compatibility-$(date -u +%Y%m%dT%H%M%SZ).XXXXXXXX")
cp -- "$COMPOSE_FILE" "$backup/compose.yml"
if [[ -n $ENV_FILE ]]; then cp -- "$ENV_FILE" "$backup/.env"
elif [[ -f $(dirname "$COMPOSE_FILE")/.env ]]; then cp -- "$(dirname "$COMPOSE_FILE")/.env" "$backup/.env"; fi
chmod 600 "$backup"/* "$backup"/.env 2>/dev/null || true
running=$(compose ps --status running --services)
for writer in "${WRITERS[@]}"; do
    if grep -Fxq "$writer" <<< "$running"; then RUNNING_WRITERS+=("$writer"); fi
done
STOPPED=true
compose stop "${WRITERS[@]}"
compose exec -T remnawave-db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup/database.dump"
[[ -s $backup/database.dump ]] || die 'Копия базы пуста'
compose exec -T remnawave-db pg_restore --list < "$backup/database.dump" >/dev/null
before_state=$(check_or_apply --check)
printf '%s' "$before_state" | python3 -c '
import json,sys
state=json.load(sys.stdin)
assert isinstance(state,list) and len(state)==1
assert all(key in state[0] for key in ("admin","legacy_admin","settings","legacy_settings"))
count=state[0].get("encrypted_user_count")
assert isinstance(count,str) and count.isdecimal(), "Rebuild the compatible image before repair"
' || die 'Образ не поддерживает проверку результата восстановления; база не изменена'
SAFE_TO_RESUME=false
if ! check_or_apply --apply; then
    if after_state=$(check_or_apply --check) && [[ $after_state == "$before_state" ]]; then
        SAFE_TO_RESUME=true
        die 'Восстановление не выполнено; исходное состояние БД подтверждено'
    fi
    die 'Результат восстановления не подтверждён. Процессы оставлены остановленными; проверьте БД и резервную копию перед запуском'
fi
COMMITTED=true
printf 'Исправлено. Копия: %s\nПанель оставлена остановленной. Сохраните прежний APP_SECRET и подключите совместимый образ.\n' "$backup"
