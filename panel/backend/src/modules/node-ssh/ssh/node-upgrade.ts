import type { Client, ClientChannel } from 'ssh2';

import { z } from 'zod';

export const nodeUpgradeSchema = z
    .object({
        t: z.literal('node-upgrade'),
        id: z.uuid(),
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
};

export function nodeUpgradeScript(request: NodeUpgradeRequest) {
    nodeUpgradeSchema.parse(request);
    const directory = Buffer.from(request.directory).toString('base64');
    return (
        `set +x\nset -euo pipefail\numask 077\ndirectory=$(printf '%s' '${directory}' | base64 -d)\n` +
        String.raw`
[[ $EUID -eq 0 ]] || exit 1
[[ -d "$directory" && -f "$directory/docker-compose.yml" ]] || exit 1
directory=$(realpath -- "$directory")
compose() { docker compose --project-directory "$directory" -f "$directory/docker-compose.yml" "$@"; }
compose config --services | grep -Fx remnanode >/dev/null
printf '\nREMNACUST_NODE_UPGRADE_PHASE:downloading\n'
compose pull remnanode
printf '\nREMNACUST_NODE_UPGRADE_PHASE:updating\n'
compose up -d --no-deps --wait --wait-timeout 120 remnanode
container=$(compose ps -q remnanode)
[[ -n "$container" ]] || exit 1
[[ $(docker inspect --format '{{.State.Running}}' "$container") == true ]] || exit 1
`
    );
}

// A separate exec channel has no terminal echo or shell history. Remote output is
// deliberately not forwarded: only fixed progress phases and exit status reach the browser.
export function runNodeUpgrade(
    client: Client,
    request: NodeUpgradeRequest,
    emit: (event: NodeUpgradeEvent) => void,
): Promise<void> {
    const script = nodeUpgradeScript(request);
    return new Promise((resolve) => {
        let channel: ClientChannel | undefined;
        let settled = false;
        let buffer = '';
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
                            const phase = line.replace(/^REMNACUST_NODE_UPGRADE_PHASE:/, '').trim();
                            if (
                                line.startsWith('REMNACUST_NODE_UPGRADE_PHASE:') &&
                                ['downloading', 'updating'].includes(phase)
                            )
                                emit({
                                    t: 'node-upgrade',
                                    id: request.id,
                                    status: 'running',
                                    phase: phase as 'downloading' | 'updating',
                                });
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
