import type { INodeConnectionOpts } from './axios.interfaces';

import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import { normalizeNodeControlAddress } from '../../../libs/contract/models/node-control-addresses.schema';

export type RouteFailureCode =
    | 'dns'
    | 'refused'
    | 'timeout'
    | 'certificate'
    | 'authorization'
    | 'proxy'
    | 'identity-mismatch'
    | 'identity-unavailable'
    | 'invalid-response'
    | 'cooldown'
    | 'busy'
    | 'transport';
export type ConnectionRoute = {
    status: 'authenticated' | 'unavailable' | 'disabled' | 'unverified';
    activeAddress: string | null;
    port: number | null;
    viaProxy: boolean;
    checkedAt: string | null;
    configurationRevision: string;
    attempts: {
        address: string;
        status: 'authenticated' | 'failed' | 'skipped';
        code: RouteFailureCode | 'authenticated';
    }[];
};
export type NodeRouteConfiguration = INodeConnectionOpts & {
    uuid: string;
    ips: { ip: string; status: string }[];
    controlAddresses?: { address: string; enabled: boolean }[];
    controlRevision?: string;
    isDisabled?: boolean;
    revision?: string;
};
export abstract class NodeRouteRegistry {
    abstract get(opts: INodeConnectionOpts, budgetMs?: number): Promise<NodeRouteConfiguration>;
    abstract isCurrent(
        config: NodeRouteConfiguration,
        allowDisabled?: boolean,
        budgetMs?: number,
    ): Promise<boolean>;
}
export class NodeRouteBusyError extends Error {
    readonly code = 'NODE_ROUTE_BUSY';
    constructor(message = 'Node route probe capacity is temporarily unavailable') {
        super(message);
    }
}
export class NodeRouteCooldownError extends NodeRouteBusyError {
    constructor() {
        super('Node route selection is cooling down');
    }
}
export class NodeRouteDisabledError extends Error {
    readonly code = 'NODE_ROUTE_DISABLED';
    constructor() {
        super('Node management addresses are disabled');
    }
}
export interface RouteCache {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds: number): Promise<unknown>;
    incrementWithTtl(key: string, ttlSeconds: number): Promise<number>;
}
export type RouteProbe = (
    opts: INodeConnectionOpts,
    timeout: number,
) => Promise<{
    healthy: boolean;
    code?: RouteFailureCode;
}>;

export function normalizeNodeAddress(value: string): string | null {
    return normalizeNodeControlAddress(value);
}
export function routeRevision(config: NodeRouteConfiguration): string {
    return createHash('sha256')
        .update(
            JSON.stringify([
                config.uuid,
                config.address,
                config.port,
                config.proxyUrl,
                config.ips,
                config.isDisabled ?? false,
                config.revision ?? '',
                config.controlAddresses,
            ]),
        )
        .digest('hex');
}
export function nodeUsesLegacyHttp(address: string, port: number | null): boolean {
    const normalized = normalizeNodeAddress(address);
    return (process.env.REMNACUST_LEGACY_HTTP_NODES ?? '').split(',').some((entry) => {
        const parsed = /^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/.exec(entry.trim());
        if (!parsed) return false;
        const listedPort = parsed[3] === undefined ? null : Number(parsed[3]);
        return normalizeNodeAddress(parsed[1] ?? parsed[2]) === normalized && listedPort === port;
    });
}
export function nodeEffectivePort(address: string, port: number | null): number {
    return port ?? (nodeUsesLegacyHttp(address, port) ? 80 : 443);
}
export function routeCandidates(config: NodeRouteConfiguration): string[] {
    if (Array.isArray(config.controlAddresses)) {
        return [
            ...new Set(
                config.controlAddresses
                    .slice(0, 65)
                    .filter(
                        (entry) =>
                            entry && entry.enabled === true && typeof entry.address === 'string',
                    )
                    .map((entry) => normalizeNodeAddress(entry.address))
                    .filter((address): address is string => address !== null),
            ),
        ];
    }
    const values = [
        config.address,
        ...(Array.isArray(config.ips) ? config.ips : [])
            .slice(0, 64)
            .filter(
                (entry) =>
                    entry &&
                    typeof entry === 'object' &&
                    typeof entry.ip === 'string' &&
                    isIP(entry.ip) &&
                    (entry.status === 'MANAGEMENT' || entry.status === 'RESERVE'),
            )
            .map((entry) => entry.ip),
    ];
    return [
        ...new Set(
            values.map(normalizeNodeAddress).filter((value): value is string => value !== null),
        ),
    ];
}
export function routeFailure(code?: string, status?: number): RouteFailureCode {
    if (code === 'NODE_PROXY_UNAVAILABLE') return 'proxy';
    if (status === 401 || status === 403) return 'authorization';
    if (/TLS|SSL|CERT|SELF_SIGNED|VERIFY|ALTNAME/.test(code ?? '')) return 'certificate';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
    if (code === 'ECONNREFUSED') return 'refused';
    if (['ETIMEDOUT', 'ECONNABORTED', 'ERR_CANCELED'].includes(code ?? '')) return 'timeout';
    return 'transport';
}
export function emptyConnectionRoute(config: NodeRouteConfiguration): ConnectionRoute {
    return {
        status: config.isDisabled ? 'disabled' : 'unverified',
        activeAddress: null,
        port: config.port,
        viaProxy: !!config.proxyUrl,
        checkedAt: null,
        configurationRevision: routeRevision(config),
        attempts: [],
    };
}

export class NodeControlRouteResolver {
    private readonly inFlight = new Map<string, Promise<INodeConnectionOpts>>();
    private readonly reports = new Map<string, ConnectionRoute>();
    private active = 0;
    private readonly waiting: { accept: () => boolean; reject: () => void }[] = [];
    private readonly cache: RouteCache;
    constructor(cache: RouteCache) {
        this.cache = cache;
    }
    private async cacheOperation<T>(
        operation: () => Promise<T>,
        deadline = Date.now() + 250,
    ): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const remaining = Math.min(250, deadline - Date.now());
            if (remaining <= 0) throw new NodeRouteBusyError();
            return await Promise.race([
                operation(),
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(
                        () => reject(new NodeRouteBusyError('Node route cache timed out')),
                        remaining,
                    );
                }),
            ]);
        } catch {
            throw new NodeRouteBusyError('Node route cache is temporarily unavailable');
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    private async admit(deadline: number): Promise<void> {
        if (Date.now() >= deadline || this.waiting.length >= 128) throw new NodeRouteBusyError();
        if (this.active < 8 && this.waiting.length === 0) {
            this.active++;
            return;
        }
        await new Promise<void>((resolve, reject) => {
            const entry = {
                accept: () => {
                    clearTimeout(timer);
                    if (Date.now() >= deadline) {
                        reject(new NodeRouteBusyError());
                        return false;
                    }
                    this.active++;
                    resolve();
                    return true;
                },
                reject: () => {
                    clearTimeout(timer);
                    reject(new NodeRouteBusyError());
                },
            };
            const timer = setTimeout(
                () => {
                    const index = this.waiting.indexOf(entry);
                    if (index >= 0) this.waiting.splice(index, 1);
                    entry.reject();
                },
                Math.max(1, deadline - Date.now()),
            );
            this.waiting.push(entry);
        });
    }
    private release(): void {
        this.active--;
        while (this.active < 8 && this.waiting.length) this.waiting.shift()!.accept();
    }

    diagnostics(config: NodeRouteConfiguration): ConnectionRoute {
        return this.reports.get(routeRevision(config)) ?? emptyConnectionRoute(config);
    }
    private remember(revision: string, report: ConnectionRoute) {
        this.reports.delete(revision);
        if (this.reports.size >= 1000) this.reports.delete(this.reports.keys().next().value!);
        this.reports.set(revision, report);
    }
    confirmed(config: NodeRouteConfiguration, address: string): void {
        const revision = routeRevision(config);
        this.remember(revision, {
            ...emptyConnectionRoute(config),
            status: 'authenticated',
            activeAddress: address,
            checkedAt: new Date().toISOString(),
            attempts: [{ address, status: 'authenticated', code: 'authenticated' }],
        });
    }
    async failed(
        config: NodeRouteConfiguration,
        address: string,
        code: RouteFailureCode = 'transport',
    ): Promise<void> {
        const revision = routeRevision(config);
        const report = this.reports.get(revision) ?? emptyConnectionRoute(config);
        const anotherActive = report.status === 'authenticated' && report.activeAddress !== address;
        this.remember(revision, {
            ...report,
            status: anotherActive ? 'authenticated' : 'unavailable',
            activeAddress: anotherActive ? report.activeAddress : null,
            checkedAt: new Date().toISOString(),
            attempts: [...report.attempts.slice(-7), { address, status: 'failed', code }],
        });
        await this.cacheOperation(() =>
            this.cache.set(`node-route:failure:${revision}:${address}`, true, 30),
        );
    }
    select(
        config: NodeRouteConfiguration,
        probe: RouteProbe,
        budgetMs = 6000,
        allowDisabled = false,
    ): Promise<INodeConnectionOpts> {
        const revision = routeRevision(config);
        if (config.isDisabled && !allowDisabled) {
            this.remember(revision, emptyConnectionRoute(config));
            return Promise.reject(new Error('Node is disabled'));
        }
        const existing = this.inFlight.get(revision);
        if (existing) return existing;
        const pending = this.choose(
            config,
            probe,
            Math.min(budgetMs, 15_000),
            allowDisabled,
        ).finally(() => this.inFlight.delete(revision));
        this.inFlight.set(revision, pending);
        return pending;
    }
    private async choose(
        config: NodeRouteConfiguration,
        probe: RouteProbe,
        budgetMs: number,
        allowDisabled: boolean,
    ) {
        const revision = routeRevision(config);
        const report = emptyConnectionRoute(config);
        if (config.isDisabled && !allowDisabled) {
            this.remember(revision, report);
            throw new Error('Node is disabled');
        }
        const deadline = Date.now() + budgetMs;
        const cache: RouteCache = {
            get: <T>(key: string) => this.cacheOperation(() => this.cache.get<T>(key), deadline),
            set: <T>(key: string, value: T, ttl: number) =>
                this.cacheOperation(() => this.cache.set(key, value, ttl), deadline),
            incrementWithTtl: (key, ttl) =>
                this.cacheOperation(() => this.cache.incrementWithTtl(key, ttl), deadline),
        };
        const candidates = routeCandidates(config);
        if (!candidates.length) {
            this.remember(revision, { ...report, status: 'disabled' });
            throw new NodeRouteDisabledError();
        }
        const cursor = await cache.get<number>(`node-route:cursor:${revision}`);
        const start =
            Number.isInteger(cursor) && cursor! >= 0 && cursor! < candidates.length ? cursor! : 0;
        const ordered = [...candidates.slice(start), ...candidates.slice(0, start)];
        const cached = await cache.get<{ address: string; checkedAt: string }>(
            `node-route:active:${revision}`,
        );
        if (
            cached &&
            candidates.includes(cached.address) &&
            Date.now() - Date.parse(cached.checkedAt) >= 0 &&
            Date.now() - Date.parse(cached.checkedAt) < 10_000 &&
            !(await cache.get<boolean>(`node-route:failure:${revision}:${cached.address}`))
        ) {
            this.remember(revision, {
                ...report,
                status: 'authenticated',
                activeAddress: cached.address,
                checkedAt: cached.checkedAt,
            });
            return { ...config, address: cached.address };
        }
        if (await cache.get<boolean>(`node-route:round-failure:${revision}`)) {
            throw new NodeRouteCooldownError();
        }
        await this.admit(deadline);
        try {
            if (Date.now() >= deadline) throw new NodeRouteBusyError();
            let probes = 0;
            for (const address of ordered) {
                if (probes >= 3 || Date.now() >= deadline) break;
                if (await cache.get<boolean>(`node-route:failure:${revision}:${address}`)) {
                    if (report.attempts.length < 8)
                        report.attempts.push({ address, status: 'skipped', code: 'cooldown' });
                    continue;
                }
                let admitted = false;
                while (Date.now() < deadline) {
                    const bucket = Math.floor(Date.now() / 1000);
                    const global = await cache.incrementWithTtl(
                        `node-route:probes:global:${bucket}`,
                        2,
                    );
                    if (global <= 32) {
                        admitted = true;
                        break;
                    }
                    await delay(
                        Math.max(1, Math.min(1001 - (Date.now() % 1000), deadline - Date.now())),
                    );
                }
                if (!admitted) throw new NodeRouteBusyError();
                const nodeBucket = Math.floor(Date.now() / 10_000);
                const node = await cache.incrementWithTtl(
                    `node-route:probes:${config.uuid}:${revision}:${nodeBucket}`,
                    20,
                );
                if (node > 3) throw new NodeRouteBusyError();
                const timeout = Math.min(
                    Math.floor(budgetMs / Math.min(3, candidates.length)),
                    deadline - Date.now(),
                );
                if (timeout <= 0) break;
                probes++;
                let result: Awaited<ReturnType<RouteProbe>>;
                try {
                    result = await probe({ ...config, address }, timeout);
                } catch {
                    result = { healthy: false, code: config.proxyUrl ? 'proxy' : 'transport' };
                }
                report.checkedAt = new Date().toISOString();
                report.attempts.push({
                    address,
                    status: result.healthy ? 'authenticated' : 'failed',
                    code: result.healthy ? 'authenticated' : (result.code ?? 'transport'),
                });
                if (result.healthy === true) {
                    report.status = 'authenticated';
                    report.activeAddress = address;
                    await cache.set(
                        `node-route:active:${revision}`,
                        { address, checkedAt: report.checkedAt },
                        10,
                    );
                    this.remember(revision, report);
                    return { ...config, address };
                }
                await cache.set(`node-route:failure:${revision}:${address}`, true, 30);
                await cache.set(
                    `node-route:cursor:${revision}`,
                    (candidates.indexOf(address) + 1) % candidates.length,
                    86400,
                );
                if (result.code === 'proxy') break;
            }
            if (probes === 0) {
                if (Date.now() >= deadline) throw new NodeRouteBusyError();
                throw new NodeRouteCooldownError();
            }
            this.remember(revision, { ...report, status: 'unavailable' });
            await cache.set(`node-route:round-failure:${revision}`, true, 5);
            throw new Error('No authenticated node API route available');
        } finally {
            this.release();
        }
    }
}
