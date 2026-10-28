import type { Client, ClientChannel } from 'ssh2';

import { isIP } from 'node:net';
import { z } from 'zod';

export const nodeUpgradeSchema = z
    .object({
        t: z.literal('node-upgrade'),
        id: z.uuid(),
        operation: z.enum(['upgrade', 'install']).optional(),
        netAdmin: z.boolean().optional(),
        panelIp: z
            .string()
            .max(45)
            .refine((value) => isIP(value) !== 0)
            .optional(),
        directory: z
            .string()
            .min(2)
            .max(1024)
            .startsWith('/')
            .refine(
                (value) =>
                    !Array.from(value).some(
                        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
                    ),
            ),
    })
    .strict();
export type NodeUpgradeRequest = z.infer<typeof nodeUpgradeSchema>;
export type NodeUpgradeEvent = {
    t: 'node-upgrade';
    id: string;
    status: 'running' | 'succeeded' | 'failed';
    phase: 'preparing' | 'downloading' | 'updating' | 'finished';
    reason?:
        | 'root'
        | 'directory'
        | 'dependencies'
        | 'download'
        | 'installer'
        | 'ssh'
        | 'authorization'
        | 'node'
        | 'busy';
};

export type NodeInstallContext = { port: number; secret: string };

export function nodeUpgradeScript(request: NodeUpgradeRequest, installation?: NodeInstallContext) {
    nodeUpgradeSchema.parse(request);
    const directory = Buffer.from(request.directory).toString('base64');
    const script =
        `set +x\nset -euo pipefail\numask 077\ndirectory=$(printf '%s' '${directory}' | base64 -d)\n` +
        String.raw`
fail() { printf 'REMNACUST_NODE_UPGRADE_ERROR:%s\n' "$1"; exit 1; }
[[ $EUID -eq 0 ]] || fail root
[[ -d "$directory" && ! -L "$directory" ]] || fail directory
directory=$(realpath -- "$directory")
command -v curl >/dev/null || fail dependencies
command -v python3 >/dev/null || fail dependencies
command -v docker >/dev/null || fail dependencies
work=$(mktemp -d -t remnacust-node-upgrade.XXXXXXXX)
failure=download
trap 'rc=$?; if ((rc)); then printf "REMNACUST_NODE_UPGRADE_ERROR:%s\n" "$failure"; fi; rm -rf -- "$work"' EXIT
printf '\nREMNACUST_NODE_UPGRADE_PHASE:downloading\n'
download() { curl -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 900 --retry 2 "$1" -o "$2"; }
download https://api.github.com/repos/lottman/Remnacust-installer/releases/latest "$work/release.json"
tag=$(python3 - "$work/release.json" <<'PY'
import json,re,sys
release=json.load(open(sys.argv[1]))
tag=release.get('tag_name','')
if release.get('draft') or release.get('prerelease') or not re.fullmatch(r'v\d+\.\d+\.\d+',tag):
 raise SystemExit('Invalid published installer release')
assets={item['name']:item for item in release.get('assets',[]) if item.get('state')=='uploaded'}
for name in ['installer.sh','SHA256SUMS']:
 expected=f'https://github.com/lottman/Remnacust-installer/releases/download/{tag}/{name}'
 if assets.get(name,{}).get('browser_download_url')!=expected:
  raise SystemExit('Installer assets unavailable')
print(tag)
PY
)
download "https://github.com/lottman/Remnacust-installer/releases/download/$tag/installer.sh" "$work/installer.sh"
download "https://github.com/lottman/Remnacust-installer/releases/download/$tag/SHA256SUMS" "$work/SHA256SUMS"
python3 - "$work" <<'PY'
from pathlib import Path
import hashlib,json,re,sys
root=Path(sys.argv[1])
script=(root/'installer.sh').read_bytes()
if len(script)>4*1024*1024:raise SystemExit('Installer too large')
matches=[line for line in (root/'SHA256SUMS').read_text().splitlines() if re.fullmatch(r'[a-f0-9]{64}  installer\.sh',line)]
if len(matches)!=1 or hashlib.sha256(script).hexdigest()!=matches[0].split()[0]:
 raise SystemExit('Installer checksum mismatch')
asset=next(item for item in json.loads((root/'release.json').read_text())['assets'] if item['name']=='installer.sh')
if asset.get('digest') and asset['digest']!='sha256:'+hashlib.sha256(script).hexdigest():
 raise SystemExit('Installer release digest mismatch')
PY
bash -n "$work/installer.sh"
printf '\nREMNACUST_NODE_UPGRADE_PHASE:updating\n'
failure=installer
# Shared installer updates Compose and verifies version, environment and readiness.
# Its recovery and cleanup are identical to the command-line update path.
version=$(printf '%s' "$tag" | cut -c2-)
bash "$work/installer.sh" upgrade-node --directory "$directory" --version "$version" --yes
`;
    if (request.operation !== 'install') return script;
    if (
        !installation ||
        !Number.isInteger(installation.port) ||
        installation.port < 1 ||
        installation.port > 65535 ||
        installation.port === 22 ||
        !/^[A-Za-z0-9+/=_-]{64,32768}$/.test(installation.secret)
    )
        throw new Error('Invalid installation context');
    const secret = Buffer.from(installation.secret).toString('base64');
    return script
        .replace(
            '[[ -d "$directory" && ! -L "$directory" ]] || fail directory',
            '[[ ! -L "$directory" ]] || fail directory\nif [[ -e "$directory" ]]; then [[ -d "$directory" && -z $(find "$directory" -mindepth 1 -maxdepth 1 -print -quit) ]] || fail directory; fi',
        )
        .replace(
            'directory=$(realpath -- "$directory")',
            'directory=$(realpath -m -- "$directory")',
        )
        .replace(
            'command -v docker >/dev/null || fail dependencies',
            'command -v apt-get >/dev/null || fail dependencies',
        )
        .replace(
            'bash "$work/installer.sh" upgrade-node --directory "$directory" --version "$version" --yes',
            `export REMNACUST_NODE_SECRET="$(printf '%s' '${secret}' | base64 -d)"\nbash "$work/installer.sh" install-node --directory "$directory" --port ${installation.port} --version "$version" ${request.netAdmin ? '--net-admin' : '--no-net-admin'} ${request.panelIp ? `--panel-ip '${request.panelIp}'` : ''} --yes\nunset REMNACUST_NODE_SECRET`,
        );
}

// A separate exec channel has no terminal echo or shell history. Remote output is
// deliberately not forwarded: only fixed progress phases and exit status reach the browser.
export function runNodeUpgrade(
    client: Client,
    request: NodeUpgradeRequest,
    emit: (event: NodeUpgradeEvent) => void,
    installation?: NodeInstallContext,
): Promise<void> {
    const script = nodeUpgradeScript(request, installation);
    return new Promise((resolve) => {
        let channel: ClientChannel | undefined;
        let settled = false;
        let buffer = '';
        let reason: NodeUpgradeEvent['reason'] = 'ssh';
        const finish = (success: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            channel?.destroy();
            emit({
                t: 'node-upgrade',
                id: request.id,
                status: success ? 'succeeded' : 'failed',
                phase: 'finished',
                ...(!success && reason ? { reason } : {}),
            });
            resolve();
        };
        const timer = setTimeout(() => finish(false), 45 * 60_000);
        emit({ t: 'node-upgrade', id: request.id, status: 'running', phase: 'preparing' });
        const start = () =>
            client.exec(
                'if [ "$(id -u)" -eq 0 ]; then exec bash -s; else exec sudo -n bash -s; fi',
                (error, stream) => {
                    if (error || !stream) {
                        finish(false);
                        return;
                    }
                    channel = stream;
                    if (settled) {
                        stream.destroy();
                        return;
                    }
                    stream.on('data', (chunk: Buffer) => {
                        buffer = (buffer + chunk.toString()).slice(-4096);
                        const lines = buffer.split('\n');
                        buffer = lines.pop() ?? '';
                        for (const line of lines) {
                            const failure = line.match(
                                /^REMNACUST_NODE_UPGRADE_ERROR:(root|directory|dependencies|download|installer)\s*$/,
                            );
                            if (failure) reason = failure[1] as NodeUpgradeEvent['reason'];
                            const phase = line.replace(/^REMNACUST_NODE_UPGRADE_PHASE:/, '').trim();
                            if (
                                line.startsWith('REMNACUST_NODE_UPGRADE_PHASE:') &&
                                ['downloading', 'updating'].includes(phase)
                            ) {
                                reason = phase === 'downloading' ? 'download' : 'installer';
                                emit({
                                    t: 'node-upgrade',
                                    id: request.id,
                                    status: 'running',
                                    phase: phase as 'downloading' | 'updating',
                                });
                            }
                        }
                    });
                    stream.stderr.on('data', () => undefined);
                    stream.on('error', () => finish(false));
                    stream.on('close', (code: number | null) => finish(code === 0));
                    try {
                        stream.end(script);
                    } catch {
                        finish(false);
                    }
                },
            );
        try {
            start();
        } catch {
            finish(false);
        }
    });
}
