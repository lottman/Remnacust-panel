import { lookup } from 'node:dns';
import { isIP, Socket } from 'node:net';
import { connect as connectTls, TLSSocket } from 'node:tls';
import { SocksClient } from 'socks';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { parseSocksProxyUrl } from '../../../libs/contract/models/socks-proxy.schema';
import { IMtlsOptions } from './axios.interfaces';

type SocksConnectOpts = Parameters<SocksProxyAgent['connect']>[1];
export type NodeControlSocksConnectOpts = SocksConnectOpts & { nodeControlSignal?: AbortSignal };
const MAX_HANDSHAKE_MS = 5000;
const cancelled = () =>
    Object.assign(new Error('Node SOCKS connection cancelled'), { code: 'ABORT_ERR' });
const proxyUnavailable = () =>
    Object.assign(new Error('Node SOCKS proxy is unavailable'), { code: 'NODE_PROXY_UNAVAILABLE' });

function socksFailure(error: unknown): Error {
    const message = error instanceof Error ? error.message : '';
    const reply = /^Socks5 proxy rejected connection - (\w+)$/.exec(message);
    if (reply) {
        const code =
            (
                {
                    ConnectionRefused: 'ECONNREFUSED',
                    NetworkUnreachable: 'ENETUNREACH',
                    HostUnreachable: 'EHOSTUNREACH',
                    TTLExpired: 'ETIMEDOUT',
                } as Record<string, string>
            )[reply[1]] ?? 'EHOSTUNREACH';
        return Object.assign(new Error('Node SOCKS destination connection failed'), { code });
    }
    if (/^Received invalid Socks5 initial handshake|^Socks5 Authentication failed/.test(message))
        return proxyUnavailable();
    return Object.assign(new Error('Node SOCKS handshake failed'), {
        code: /timed out/i.test(message) ? 'ETIMEDOUT' : 'ECONNRESET',
    });
}

export class MtlsSocksProxyAgent extends SocksProxyAgent {
    private readonly pendingHandshakes = new Set<() => void>();
    private stopped = false;
    constructor(
        uri: string,
        private readonly mtls: IMtlsOptions,
        private readonly sni: string | undefined,
    ) {
        if (!parseSocksProxyUrl(uri)) throw new Error('Invalid node SOCKS5 proxy configuration');
        super(uri, { keepAlive: true });
        const host = this.proxy.host;
        if (host?.startsWith('[') && host.endsWith(']')) this.proxy.host = host.slice(1, -1);
    }

    connect(
        req: Parameters<SocksProxyAgent['connect']>[0],
        opts: NodeControlSocksConnectOpts,
    ): ReturnType<SocksProxyAgent['connect']> {
        if (this.stopped) return Promise.reject(cancelled());
        return new Promise((resolve, reject) => {
            const signal = opts.nodeControlSignal;
            const timeout = Math.min(
                this.timeout && this.timeout > 0 ? this.timeout : MAX_HANDSHAKE_MS,
                MAX_HANDSHAKE_MS,
            );
            let socket: Socket | undefined;
            let secure: TLSSocket | undefined;
            let settled = false;
            let stage: 'target-dns' | 'proxy-connect' | 'socks' | 'tls' = 'target-dns';
            let cancelStage: ((error: Error) => void) | undefined;
            const cleanup = () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                req.removeListener('close', abort);
                req.removeListener('abort', abort);
            };
            const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                cleanup();
                cancelStage?.(error);
                secure?.destroy();
                socket?.destroy();
                reject(error);
            };
            const abort = () => fail(cancelled());
            const timer = setTimeout(
                () =>
                    fail(
                        stage === 'proxy-connect'
                            ? proxyUnavailable()
                            : Object.assign(new Error('Node SOCKS connection timed out'), {
                                  code: 'ETIMEDOUT',
                              }),
                    ),
                timeout,
            );
            timer.unref();
            this.pendingHandshakes.add(abort);
            signal?.addEventListener('abort', abort, { once: true });
            req.once('close', abort);
            req.once('abort', abort);
            const interrupted = () => settled || req.destroyed || signal?.aborted || this.stopped;
            const waitSocket = (
                connection: Socket,
                event: 'connect' | 'secureConnect',
                start?: () => void,
            ) =>
                new Promise<void>((done, failed) => {
                    const finish = (error?: Error) => {
                        connection.removeListener(event, ready);
                        connection.removeListener('error', broken);
                        connection.removeListener('close', closed);
                        if (cancelStage === broken) cancelStage = undefined;
                        if (error) failed(error);
                        else done();
                    };
                    const ready = () => finish();
                    const broken = (error: Error) => finish(error);
                    const closed = () =>
                        finish(
                            Object.assign(new Error('Node SOCKS socket closed'), {
                                code: 'ECONNRESET',
                            }),
                        );
                    connection.once(event, ready);
                    connection.once('error', broken);
                    connection.once('close', closed);
                    cancelStage = broken;
                    if (start) {
                        try {
                            start();
                        } catch (error) {
                            broken(
                                error instanceof Error
                                    ? error
                                    : new Error('Node SOCKS connection failed'),
                            );
                        }
                    }
                });
            const establish = async () => {
                if (interrupted()) {
                    abort();
                    return;
                }
                if (!opts.host) throw new Error('No host defined for node SOCKS connection');
                let host = opts.host;
                if (this.shouldLookup && !isIP(host))
                    host = await new Promise<string>((done, failed) => {
                        const stop = (error: Error) => failed(error);
                        cancelStage = stop;
                        (opts.lookup ?? lookup)(host, {}, (error, address) => {
                            if (cancelStage === stop) cancelStage = undefined;
                            if (interrupted()) return;
                            if (error) failed(error);
                            else {
                                const resolved =
                                    typeof address === 'string' ? address : address?.[0]?.address;
                                if (resolved) done(resolved);
                                else
                                    failed(
                                        Object.assign(
                                            new Error('Node DNS lookup returned no address'),
                                            { code: 'ENOTFOUND' },
                                        ),
                                    );
                            }
                        });
                    });
                if (interrupted()) {
                    abort();
                    return;
                }
                stage = 'proxy-connect';
                const plain = new Socket();
                socket = plain;
                await waitSocket(plain, 'connect', () =>
                    plain.connect({
                        ...this.socketOptions,
                        host: this.proxy.host ?? this.proxy.ipaddress,
                        port: this.proxy.port,
                    }),
                );
                if (interrupted()) {
                    abort();
                    return;
                }
                stage = 'socks';
                await SocksClient.createConnection({
                    proxy: this.proxy,
                    command: 'connect',
                    destination: {
                        host,
                        port: typeof opts.port === 'number' ? opts.port : Number(opts.port),
                    },
                    existing_socket: socket,
                    timeout,
                });
                if (interrupted()) {
                    abort();
                    return;
                }
                req.emit('proxy', { proxy: this.proxyUrl, socket });
                if (interrupted()) {
                    abort();
                    return;
                }
                let result: Socket = socket;
                if (opts.secureEndpoint) {
                    stage = 'tls';
                    const {
                        host: _host,
                        port: _port,
                        path: _path,
                        nodeControlSignal: _signal,
                        ...options
                    } = opts;
                    secure = connectTls({
                        ...options,
                        ...this.mtls,
                        socket,
                        checkServerIdentity: () => undefined,
                        minVersion: 'TLSv1.3',
                        rejectUnauthorized: true,
                        servername: this.sni ?? (isIP(opts.host) ? undefined : opts.host),
                    });
                    await waitSocket(secure, 'secureConnect');
                    result = secure;
                }
                if (interrupted()) {
                    abort();
                    return;
                }
                settled = true;
                cleanup();
                resolve(result);
            };
            void establish()
                .catch((error: unknown) => {
                    if (interrupted()) {
                        abort();
                        return;
                    }
                    if (stage === 'socks') fail(socksFailure(error));
                    else if (stage === 'proxy-connect' && error instanceof Error && 'code' in error)
                        fail(proxyUnavailable());
                    else
                        fail(
                            error instanceof Error
                                ? error
                                : new Error('Node SOCKS connection failed'),
                        );
                })
                .finally(() => {
                    this.pendingHandshakes.delete(abort);
                });
        });
    }

    override destroy(): void {
        this.stopped = true;
        for (const abort of this.pendingHandshakes) abort();
        super.destroy();
    }
}
