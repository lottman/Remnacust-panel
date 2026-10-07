#!/usr/bin/env bash
set -euo pipefail

action="${1:-status}"
level="${2:-balanced}"
config=/etc/sysctl.d/99-z-xera-node-optimizer.conf
state=/var/lib/xera-node-optimizer

if [[ ! -r /proc/sys/kernel/ostype ]] || [[ $(cat /proc/sys/kernel/ostype) != Linux ]]; then
    echo 'Run this command on a Linux node host.' >&2
    exit 1
fi
if [[ -f /.dockerenv ]]; then
    echo 'Run this command on the VPS host, not inside a container.' >&2
    exit 1
fi

keys=(
    net.ipv4.tcp_keepalive_time net.core.somaxconn
    net.ipv4.tcp_max_syn_backlog net.core.rmem_max net.core.wmem_max
    net.ipv4.tcp_rmem net.ipv4.tcp_wmem
    net.ipv4.tcp_congestion_control
)
declare -A baseline=()

has_key() {
    [[ -e /proc/sys/${1//./\/} ]]
}

profile() {
    case "$level" in
        none) return 0 ;;
        safe)
            cat <<'VALUES'
net.ipv4.tcp_keepalive_time=600
VALUES
            ;;
        balanced|performance)
            if [[ $level == balanced ]]; then
                cat <<'VALUES'
net.ipv4.tcp_keepalive_time=600
net.core.somaxconn=4096
net.ipv4.tcp_max_syn_backlog=4096
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.ipv4.tcp_rmem=4096 131072 16777216
net.ipv4.tcp_wmem=4096 65536 16777216
VALUES
            else
                cat <<'VALUES'
net.ipv4.tcp_keepalive_time=600
net.core.somaxconn=8192
net.ipv4.tcp_max_syn_backlog=8192
net.core.rmem_max=33554432
net.core.wmem_max=33554432
net.ipv4.tcp_rmem=4096 131072 33554432
net.ipv4.tcp_wmem=4096 65536 33554432
VALUES
            fi
            if [[ $level == performance ]] &&
                grep -qw bbr /proc/sys/net/ipv4/tcp_available_congestion_control 2>/dev/null; then
                printf '%s\n' 'net.ipv4.tcp_congestion_control=bbr'
            fi
            ;;
        *) echo 'Level must be safe, balanced or performance.' >&2; exit 2 ;;
    esac
}

load_baseline() {
    local key value
    baseline=()
    if [[ -f $state/baseline ]]; then
        while IFS='=' read -r key value; do
            [[ -n "$key" ]] && baseline[$key]=$value
        done < "$state/baseline"
    else
        while IFS='=' read -r key value; do
            [[ -n "$key" ]] && baseline[$key]=$value
        done < <(capture)
    fi
}

desired() {
    local key value current target
    while IFS='=' read -r key value; do
        if ! has_key "$key"; then
            printf 'Skipped unsupported key: %s\n' "$key" >&2
            continue
        fi
        current=${baseline[$key]:-}
        [[ -n $current ]] || continue
        case "$key" in
            net.ipv4.tcp_keepalive_time)
                (( current > value )) || continue
                ;;
            net.ipv4.tcp_rmem|net.ipv4.tcp_wmem)
                read -r -a parts <<< "$current"
                read -r -a target_parts <<< "$value"
                (( ${#parts[@]} == 3 && ${#target_parts[@]} == 3 )) || continue
                (( parts[2] < target_parts[2] )) || continue
                value="${parts[0]} ${parts[1]} ${target_parts[2]}"
                ;;
            net.ipv4.tcp_congestion_control)
                [[ $current != "$value" ]] || continue
                ;;
            *)
                (( current < value )) || continue
                ;;
        esac
        printf '%s=%s\n' "$key" "$value"
    done < <(profile)
}

capture() {
    local key
    for key in "${keys[@]}"; do
        if has_key "$key"; then
            printf '%s=%s\n' "$key" "$(sysctl -n "$key")"
        fi
    done
}

restore_runtime() {
    local key value
    while IFS='=' read -r key value; do
        [[ -n "$key" ]] || continue
        sysctl -w "$key=$value" >/dev/null || return 1
    done < "$1"
}

rollback_profile() {
    [[ -f $state/baseline && ! -L $state && ! -L $state/baseline && ! -L $state/original.conf && ! -L $config ]] || {
        echo 'No safe baseline to restore.' >&2; return 1;
    }
    if [[ ! -e $config ]]; then
        rm -rf -- "$state"
        echo 'No active XERA profile remains.'
        return 0
    fi
    [[ $(head -n 1 "$config") == '# XERA node optimizer:'* ]] || {
        echo 'The sysctl file is no longer managed by XERA; refusing to overwrite it.' >&2
        return 1
    }
    load_baseline
    local key value
    while IFS='=' read -r key value; do
        [[ -n "$key" && -v baseline[$key] ]] || continue
        sysctl -w "$key=${baseline[$key]}" >/dev/null
    done < "$config"
    if [[ -f $state/original.conf ]]; then
        cp -p "$state/original.conf" "$config"
    else
        rm -f "$config"
    fi
    rm -rf -- "$state"
    echo 'Original runtime values and sysctl configuration restored.'
}

case "$action" in
    diagnose)
        printf 'Kernel: '; uname -sr
        printf 'Uptime: '; uptime -p
        printf 'Load: '; cat /proc/loadavg
        awk '/MemTotal:|MemAvailable:/ {printf "%s %s %s\n", $1, $2, $3}' /proc/meminfo
        if [[ -r /proc/net/sockstat ]]; then
            grep -E '^(sockets:|TCP:)' /proc/net/sockstat || true
        fi
        if command -v ss >/dev/null 2>&1; then ss -s; fi
        if command -v docker >/dev/null 2>&1; then
            docker ps --filter name=remnanode --format 'Node container: {{.Names}} {{.Status}}' 2>/dev/null || true
        fi
        ;;
    status)
        if [[ -r $config ]]; then
            head -n 1 "$config"
        else
            echo 'Profile: not applied'
        fi
        capture
        ;;
    preview)
        profile >/dev/null
        load_baseline
        echo "Profile: $level"
        if [[ $level == none ]]; then
            if [[ -f $state/baseline ]]; then
                echo 'Applying this level will restore the original values captured before XERA optimization.'
            else
                echo 'No XERA optimization is applied; nothing will change.'
            fi
            exit 0
        fi
        desired_values=$(desired)
        while IFS='=' read -r key value; do
            [[ -n "$key" ]] || continue
            printf '%s: %s -> %s\n' "$key" "$(sysctl -n "$key")" "$value"
        done <<< "$desired_values"
        if [[ -f $config && $(head -n 1 "$config") == '# XERA node optimizer:'* ]]; then
            while IFS='=' read -r key value; do
                [[ -n "$key" && -v baseline[$key] ]] || continue
                if ! grep -Fq "${key}=" <<< "$desired_values"; then
                    printf '%s: %s -> %s (restore previous profile)\n' "$key" "$(sysctl -n "$key")" "${baseline[$key]}"
                fi
            done < "$config"
        fi
        echo 'Only sysctl values change; Xray, Docker, routes, firewall and SSH are untouched.'
        ;;
    apply)
        [[ $EUID -eq 0 ]] || { echo 'Root is required.' >&2; exit 1; }
        command -v flock >/dev/null || { echo 'flock is required.' >&2; exit 1; }
        exec 9>/run/xera-node-optimizer.lock
        flock -x 9
        if [[ $level == none ]]; then
            if [[ -f $state/baseline ]]; then rollback_profile; else echo 'No XERA optimization is applied.'; fi
            exit 0
        fi
        [[ ! -L $config && ! -L $state && ! -L $state/baseline && ! -L $state/original.conf ]] || {
            echo 'Symlink in state path.' >&2; exit 1;
        }
        if [[ -f $state/baseline && -f $config &&
            $(head -n 1 "$config") != '# XERA node optimizer:'* ]]; then
            echo 'The sysctl file is no longer managed by XERA; refusing to overwrite it.' >&2
            exit 1
        fi
        profile >/dev/null
        install -d -m 700 "$state"
        if [[ ! -e $state/baseline ]]; then
            capture > "$state/baseline"
            chmod 600 "$state/baseline"
            if [[ -e $config ]]; then
                cp -p "$config" "$state/original.conf"
            fi
        fi
        load_baseline
        previous=$(mktemp)
        staged=$(mktemp /etc/sysctl.d/.xera-node-optimizer.XXXXXX)
        plan=$(mktemp)
        trap 'rm -f "$previous" "$staged" "$plan"' EXIT
        capture > "$previous"
        if [[ -f $config ]]; then
            while IFS='=' read -r key value; do
                [[ -n "$key" && -v baseline[$key] ]] || continue
                if ! grep -Fq "${key}=" "$previous" && has_key "$key"; then
                    printf '%s=%s\n' "$key" "$(sysctl -n "$key")" >> "$previous"
                fi
            done < "$config"
        fi
        { printf '# XERA node optimizer: %s\n' "$level"; desired; } > "$staged"
        cp "$staged" "$plan"
        if [[ -f $config ]]; then
            while IFS='=' read -r key value; do
                [[ -n "$key" && -v baseline[$key] ]] || continue
                if ! grep -Fq "${key}=" "$staged"; then
                    printf '%s=%s\n' "$key" "${baseline[$key]}" >> "$plan"
                fi
            done < "$config"
        fi
        chmod 644 "$staged"
        if ! sysctl -p "$plan"; then
            restore_runtime "$previous" || true
            echo 'Apply failed; previous runtime values restored.' >&2
            exit 1
        fi
        if ! mv -f "$staged" "$config"; then
            restore_runtime "$previous" || true
            echo 'Could not save the sysctl profile; previous runtime values restored.' >&2
            exit 1
        fi
        echo "Applied $level. Run rollback to restore the original values."
        ;;
    rollback)
        [[ $EUID -eq 0 ]] || { echo 'Root is required.' >&2; exit 1; }
        command -v flock >/dev/null || { echo 'flock is required.' >&2; exit 1; }
        exec 9>/run/xera-node-optimizer.lock
        flock -x 9
        rollback_profile
        ;;
    *) echo 'Usage: optimizer.sh {diagnose|status|preview|apply|rollback} [none|safe|balanced|performance]' >&2; exit 2 ;;
esac
