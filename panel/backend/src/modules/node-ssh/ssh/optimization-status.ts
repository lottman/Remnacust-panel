import type { Client } from 'ssh2';

export type OptimizationLevel = 'none' | 'safe' | 'balanced' | 'performance';
// Read only a fixed file and fixed sysctl keys. Never source a remotely editable file.
export const OPTIMIZATION_STATUS_SCRIPT = `
set -eu
config=/etc/sysctl.d/99-z-xera-node-optimizer.conf
if [ ! -e "$config" ]; then printf 'none'; exit 0; fi
[ ! -L "$config" ] && [ -r "$config" ] || exit 1
IFS= read -r header < "$config"
case "$header" in
  '# XERA node optimizer: safe') level=safe ;;
  '# XERA node optimizer: balanced') level=balanced ;;
  '# XERA node optimizer: performance') level=performance ;;
  *) exit 1 ;;
esac
while IFS='=' read -r key value; do
  case "$key" in ''|'#'*) continue ;; esac
  case "$key" in
    net.ipv4.tcp_keepalive_time|net.core.somaxconn|net.ipv4.tcp_max_syn_backlog|net.core.rmem_max|net.core.wmem_max|net.ipv4.tcp_rmem|net.ipv4.tcp_wmem|net.ipv4.tcp_congestion_control) ;;
    *) exit 1 ;;
  esac
  actual=$(sysctl -n "$key") || exit 1
  [ "$(printf '%s' "$actual" | tr -s '[:space:]' ' ')" = "$(printf '%s' "$value" | tr -s '[:space:]' ' ')" ] || exit 1
done < "$config"
printf '%s' "$level"
`;

export async function readOptimizationStatus(client: Client): Promise<OptimizationLevel | null> {
    return new Promise(resolve => {
        let settled = false;
        let channel: import('ssh2').ClientChannel | undefined;
        const finish = (value: OptimizationLevel | null) => {
            if (settled) return;
            settled = true; clearTimeout(timer); channel?.destroy(); resolve(value);
        };
        const timer = setTimeout(() => finish(null), 5000);
        client.exec('bash -s', (error, stream) => {
            if (error || !stream) return finish(null);
            if (settled) { stream.destroy(); return; }
            channel = stream;
            let output = '';
            stream.on('data', (data: Buffer) => { output += data.toString(); if (output.length > 128) finish(null); });
            stream.stderr.on('data', () => undefined);
            stream.on('error', () => finish(null));
            stream.on('close', (code: number) => {
                const value = output.trim();
                finish(code === 0 && /^(none|safe|balanced|performance)$/.test(value) ? value as OptimizationLevel : null);
            });
            stream.end(OPTIMIZATION_STATUS_SCRIPT);
        });
    });
}
