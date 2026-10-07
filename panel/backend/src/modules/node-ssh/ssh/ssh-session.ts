import { createHash } from 'node:crypto';
import { Client, ClientChannel } from 'ssh2';
import { WebSocket } from 'ws';

import { Logger } from '@nestjs/common';

import {
    SshClientMessageSchema,
    TSshClientMessage,
    TSshOpenMessage,
    TSshServerMessage,
} from '@libs/contracts/models';

import { ISshSessionOptions } from '../interfaces';
import { BrowserSshAgent } from './browser-ssh-agent';
import { CoreSshTunnel } from './core-ssh-tunnel';
import {
    nodeUpgradeSchema,
    runNodeUpgrade,
    NodeUpgradeEvent,
    NodeUpgradeRequest,
} from './node-upgrade';
import { readOptimizationStatus } from './optimization-status';

const WS_HIGH_WATER_BYTES = 1 << 20;
const KEEPALIVE_INTERVAL_MS = 20_000;
const HANDSHAKE_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 30 * 60_000;
const PING_INTERVAL_MS = 25_000;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

export class SshSession {
    private readonly logger = new Logger(SshSession.name);
    private readonly agent: BrowserSshAgent;
    private upgradingNode = false;
    private readonly upgradeIds = new Set<string>();

    private client: Client | null = null;
    private optimizationTimer: NodeJS.Timeout | null = null;
    private optimizationOutputTimer: NodeJS.Timeout | null = null;
    private checkingOptimization = false;
    private channel: ClientChannel | null = null;
    private hostKeyVerifiers = new Map<number, (accepted: boolean) => void>();
    private nextHostKeyId = 1;
    private inFlightBytes = 0;
    private paused = false;
    private startedAt = 0;
    private opened = false;
    private closed = false;
    private idleTimer: NodeJS.Timeout | null = null;
    private pingTimer: NodeJS.Timeout | null = null;
    private isAlive = true;
    private coreTunnel: CoreSshTunnel | null = null;
    private coreTunnelPort: number | null = null;
    private coreTunnelHeartbeat: NodeJS.Timeout | null = null;
    private tunnelPublication: Promise<void> = Promise.resolve();

    constructor(
        private readonly ws: WebSocket,
        private readonly options: ISshSessionOptions,
    ) {
        this.agent = new BrowserSshAgent({
            requestIdentities: (id) => this.send({ t: 'agent-identities', id }),
            requestSignature: (id, publicKey, data, hash) =>
                this.send({
                    t: 'agent-sign',
                    id,
                    publicKey: publicKey.toString('base64'),
                    data: data.toString('base64'),
                    hash,
                }),
        });

        this.ws.on('message', (raw, isBinary) => this.onMessage(raw as Buffer, isBinary));
        this.ws.on('close', () => this.close('websocket closed'));
        this.ws.on('error', (error) => {
            this.logger.debug(`SSH terminal websocket error: ${error.message}`);
            this.close('websocket error');
        });

        this.ws.on('pong', () => {
            this.isAlive = true;
        });

        this.pingTimer = setInterval(() => {
            if (!this.isAlive) {
                this.terminate('connection lost');
                return;
            }

            this.isAlive = false;
            this.ws.ping();
        }, PING_INTERVAL_MS);
        this.pingTimer.unref();

        this.touch();
    }

    private async refreshOptimization(): Promise<void> {
        if (
            this.closed ||
            !this.client ||
            this.checkingOptimization ||
            !this.options.onOptimizationStatus
        )
            return;
        this.checkingOptimization = true;
        try {
            const level = await readOptimizationStatus(this.client);
            if (!this.closed) await this.options.onOptimizationStatus(level);
        } catch {
            /* Read failure never breaks the administrator's terminal. */
        } finally {
            this.checkingOptimization = false;
        }
    }

    public terminate(reason: string): void {
        this.close(reason, true);
    }

    public close(reason: string, force = false): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this.optimizationTimer) clearInterval(this.optimizationTimer);
        if (this.optimizationOutputTimer) clearTimeout(this.optimizationOutputTimer);

        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }

        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }

        this.agent.destroy(reason);
        if (this.coreTunnelHeartbeat) clearInterval(this.coreTunnelHeartbeat);
        this.coreTunnelHeartbeat = null;
        this.coreTunnel?.close();
        this.coreTunnel = null;
        if (this.coreTunnelPort !== null) {
            const port = this.coreTunnelPort;
            this.tunnelPublication = this.tunnelPublication
                .catch(() => undefined)
                .then(() => this.options.onTunnelClosed(port))
                .catch((error) => this.logger.warn(`Failed to clear SSH tunnel: ${String(error)}`));
        }
        this.coreTunnelPort = null;

        for (const verify of this.hostKeyVerifiers.values()) {
            try {
                verify(false);
            } catch {
                // silence
            }
        }
        this.hostKeyVerifiers.clear();

        this.channel?.end();
        const client = this.client;
        if (!force && client && this.opened && this.options.onOptimizationStatus) {
            // Closing the terminal immediately after Apply must not lose the
            // last change between polling ticks. The read has a 5-second cap.
            void readOptimizationStatus(client)
                .then((level) =>
                    level === null ? undefined : this.options.onOptimizationStatus?.(level),
                )
                .catch(() => undefined)
                .finally(() => client.end());
        } else {
            client?.end();
        }

        if (force) {
            this.ws.terminate();
        } else if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }

        this.options.onClosed(
            reason,
            this.opened ? Math.round((Date.now() - this.startedAt) / 1000) : null,
        );
    }

    private onMessage(raw: Buffer, isBinary: boolean): void {
        if (this.closed) {
            return;
        }

        this.touch();

        if (isBinary) {
            this.writeToChannel(raw);
            return;
        }

        const input = safeJsonParse(raw);
        if (input && typeof input === 'object' && 't' in input && input.t === 'node-upgrade') {
            const upgrade = nodeUpgradeSchema.safeParse(input);
            if (!upgrade.success) {
                this.fatal('Malformed node upgrade request');
                return;
            }
            void this.upgradeNode(upgrade.data);
            return;
        }
        const parsed = SshClientMessageSchema.safeParse(input);

        if (!parsed.success) {
            this.fatal('Malformed control message');
            return;
        }

        const message = parsed.data;

        try {
            this.dispatch(message);
        } catch (error) {
            this.fatal(error instanceof Error ? error.message : 'Malformed control message');
        }
    }

    private dispatch(message: TSshClientMessage): void {
        switch (message.t) {
            case 'error':
                this.agent.rejectRequest(message.id, message.message);
                break;
            case 'hostkey': {
                const verify = this.hostKeyVerifiers.get(message.id);
                this.hostKeyVerifiers.delete(message.id);
                verify?.(message.accept);
                break;
            }
            case 'identities':
                this.agent.resolveIdentities(message.id, message.keys);
                break;
            case 'open':
                void this.open(message).catch((error: Error) => this.fatal(error.message));
                break;
            case 'resize':
                this.channel?.setWindow(message.rows, message.cols, 0, 0);
                break;
            case 'sign':
                this.agent.resolveSignature(message.id, Buffer.from(message.signature, 'base64'));
                break;
            default:
                this.fatal('Unknown control message');
        }
    }

    private async upgradeNode(request: NodeUpgradeRequest): Promise<void> {
        if (this.upgradeIds.has(request.id)) return;
        if (
            this.upgradingNode ||
            !this.opened ||
            !this.client ||
            !this.options.authorizeNodeUpgrade ||
            this.upgradeIds.size >= 100
        ) {
            this.send({ t: 'node-upgrade', id: request.id, status: 'failed', phase: 'finished' });
            return;
        }
        this.upgradeIds.add(request.id);
        this.upgradingNode = true;
        try {
            await this.options.authorizeNodeUpgrade();
            if (this.closed || !this.client) return;
            await runNodeUpgrade(this.client, request, (event) => {
                this.touch();
                this.send(event);
            });
        } catch {
            this.send({ t: 'node-upgrade', id: request.id, status: 'failed', phase: 'finished' });
        } finally {
            this.upgradingNode = false;
        }
    }

    private async open(message: TSshOpenMessage): Promise<void> {
        if (this.client) {
            this.fatal('Session is already open');
            return;
        }

        const host = message.host.trim();

        if (!this.options.allowedHosts.includes(host)) {
            return this.fatal('Host does not belong to this node');
        }

        const port = message.port;
        const username = message.username.trim();

        const client = new Client();
        this.client = client;

        client.on('ready', () => {
            client.shell(
                { term: 'xterm-256color', cols: message.cols, rows: message.rows },
                (error, channel) => {
                    if (error) {
                        this.fatal(`Failed to open shell: ${error.message}`);
                        return;
                    }

                    this.channel = channel;
                    this.startedAt = Date.now();
                    this.opened = true;

                    this.options.onOpened(`${host}:${port}`, username);
                    void this.openCoreTunnel();
                    this.send({ t: 'ready' });
                    void this.refreshOptimization();
                    this.optimizationTimer = setInterval(
                        () => void this.refreshOptimization(),
                        5000,
                    );
                    this.optimizationTimer.unref();

                    channel.on('data', (chunk: Buffer) => this.pushToBrowser(chunk));
                    channel.stderr.on('data', (chunk: Buffer) => this.pushToBrowser(chunk));
                    channel.on('exit', (code: null | number, signal: null | string) =>
                        this.send({ t: 'exit', code, signal }),
                    );
                    channel.on('close', () => this.close('shell closed'));
                },
            );
        });

        client.on('error', (error) => this.fatal(error.message));
        client.on('close', () => this.close('ssh connection closed'));

        client.connect({
            host,
            port,
            username,
            agent: this.agent,
            keepaliveInterval: KEEPALIVE_INTERVAL_MS,
            readyTimeout: HANDSHAKE_TIMEOUT_MS,
            hostVerifier: (key: Buffer, verify: (accepted: boolean) => void) => {
                const id = this.nextHostKeyId++;
                this.hostKeyVerifiers.set(id, verify);

                this.send({
                    t: 'hostkey',
                    id,
                    algo: readSshString(key),
                    fingerprint: sshFingerprint(key),
                    key: key.toString('base64'),
                });
            },
        });
    }

    private async openCoreTunnel(): Promise<void> {
        if (!this.client || !this.options.nodePort || this.closed) return;
        const tunnel = new CoreSshTunnel(
            this.client,
            this.options.allowedHosts,
            this.options.nodePort,
        );
        try {
            const port = await tunnel.listen();
            if (this.closed) {
                tunnel.close();
                return;
            }
            this.coreTunnel = tunnel;
            this.coreTunnelPort = port;
            await this.publishTunnel(port);
            if (this.closed) return;
            this.coreTunnelHeartbeat = setInterval(() => {
                void this.publishTunnel(port).catch((error) =>
                    this.logger.warn(`Failed to refresh SSH tunnel: ${String(error)}`),
                );
            }, 20_000);
            this.coreTunnelHeartbeat.unref();
        } catch (error) {
            tunnel.close();
            this.logger.warn(`SSH core tunnel unavailable: ${String(error)}`);
        }
    }

    private publishTunnel(port: number): Promise<void> {
        this.tunnelPublication = this.tunnelPublication
            .catch(() => undefined)
            .then(() => {
                if (!this.closed) return this.options.onTunnelReady(port);
            });
        return this.tunnelPublication;
    }

    private pushToBrowser(chunk: Buffer): void {
        // Verify the node after command output settles; never infer the applied
        // profile from terminal text, which a remote command could forge.
        if (!this.closed && this.options.onOptimizationStatus) {
            if (this.optimizationOutputTimer) clearTimeout(this.optimizationOutputTimer);
            this.optimizationOutputTimer = setTimeout(() => void this.refreshOptimization(), 300);
            this.optimizationOutputTimer.unref();
        }
        if (this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        this.touch();

        this.inFlightBytes += chunk.length;
        if (this.inFlightBytes >= WS_HIGH_WATER_BYTES && !this.paused) {
            this.paused = true;
            this.channel?.pause();
            this.channel?.stderr.pause();
        }

        this.ws.send(chunk, { binary: true }, () => {
            this.inFlightBytes -= chunk.length;

            if (this.inFlightBytes < WS_HIGH_WATER_BYTES && this.paused) {
                this.paused = false;
                this.channel?.resume();
                this.channel?.stderr.resume();
            }
        });
    }

    private writeToChannel(data: Buffer): void {
        if (!this.channel) {
            return;
        }

        if (!this.channel.write(data)) {
            this.ws.pause();
            this.channel.once('drain', () => this.ws.resume());
        }
    }

    private touch(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        this.idleTimer = setTimeout(() => this.fatal('Session timed out'), IDLE_TIMEOUT_MS);
        this.idleTimer.unref();
    }

    private fatal(message: string): void {
        this.send({ t: 'error', message });
        this.close(message);
    }

    private send(message: TSshServerMessage | NodeUpgradeEvent): void {
        if (this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        if (this.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
            this.terminate('browser is not reading');
            return;
        }

        this.ws.send(JSON.stringify(message));
    }
}

function readSshString(blob: Buffer): string {
    if (blob.length < 4) {
        return 'unknown';
    }

    const length = blob.readUInt32BE(0);
    if (blob.length < 4 + length) {
        return 'unknown';
    }

    return blob.subarray(4, 4 + length).toString('utf8');
}

function sshFingerprint(blob: Buffer): string {
    return `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;
}

function safeJsonParse(raw: Buffer): unknown {
    try {
        return JSON.parse(raw.toString('utf8'));
    } catch {
        return null;
    }
}
