import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { NodeRouteInventoryService } from './node-route-inventory.service';
import { RawCacheService } from '@common/raw-cache';
import { NodeIpSchema } from '../../../libs/contract/models/node-ips.schema';
import { parseSocksProxyUrl } from '../../../libs/contract/models/socks-proxy.schema';

import type { INodeConnectionOpts } from './axios.interfaces';
import { NodeRouteRegistry, NodeRouteBusyError, normalizeNodeAddress, nodeEffectivePort, routeCandidates, routeRevision, type NodeRouteConfiguration } from './node-control-route';

const REVISION_KEY = 'node-route:configuration-generation';

@Injectable()
export class NodeRouteRegistryService extends NodeRouteRegistry {
    private inventory = new Map<string, NodeRouteConfiguration>();
    private generation: string | null = null;
    private expires = 0;
    private pending?: Promise<void>;
    private ambiguous = new Set<string>();

    constructor(private readonly prisma: NodeRouteInventoryService, private readonly cache: RawCacheService) { super(); }

    async invalidate(): Promise<void> {
        this.expires = 0;
        await this.cache.set(REVISION_KEY, randomUUID());
    }

    private async readGeneration(): Promise<string | null> {
        try {
            return await this.cache.get<string>(REVISION_KEY);
        } catch {
            throw new NodeRouteBusyError('Node route registry cache is temporarily unavailable');
        }
    }

    private async refresh(): Promise<void> {
        const generation = await this.readGeneration();
        if (generation === this.generation && Date.now() < this.expires) return;
        if (this.pending) return this.pending;
        this.pending = (async () => {
            const before = await this.readGeneration();
            const rows = await this.prisma.nodes.findMany({
                select: { uuid: true, address: true, port: true, proxyUrl: true, ips: true, isDisabled: true },
                take: 10001,
            }).catch(() => {
                throw new NodeRouteBusyError('Node route registry database is temporarily unavailable');
            });
            if (rows.length > 10000) throw new Error('Node route inventory exceeds limit');
            const after = await this.readGeneration();
            if (before !== after) throw new NodeRouteBusyError('Node route configuration changed during refresh');
            const next = new Map<string, NodeRouteConfiguration>();
            for (const row of rows) {
                const ips = (Array.isArray(row.ips) ? row.ips : []).slice(0, 64).flatMap(entry => {
                    const parsed = NodeIpSchema.safeParse(entry);
                    return parsed.success ? [parsed.data] : [];
                });
                if (!normalizeNodeAddress(row.address) || (row.proxyUrl && !parseSocksProxyUrl(row.proxyUrl))) continue;
                const config: NodeRouteConfiguration = { ...row, ips };
                config.revision = routeRevision(config);
                next.set(row.uuid, config);
            }
            const endpoint = (config: NodeRouteConfiguration, address: string) => {
                const proxy = config.proxyUrl ? parseSocksProxyUrl(config.proxyUrl)! : null;
                const context = proxy ? [normalizeNodeAddress(proxy.hostname), Number(proxy.port),
                    decodeURIComponent(proxy.username), decodeURIComponent(proxy.password)] : null;
                return JSON.stringify([normalizeNodeAddress(address), nodeEffectivePort(address, config.port), context]);
            };
            const primary = new Map<string, Set<string>>(), fallback = new Map<string, Set<string>>();
            for (const config of next.values()) {
                const key = endpoint(config, config.address);
                const owners = primary.get(key) ?? new Set<string>(); owners.add(config.uuid); primary.set(key, owners);
                for (const address of routeCandidates(config).slice(1)) {
                    const candidateKey = endpoint(config, address);
                    const nodes = fallback.get(candidateKey) ?? new Set<string>();
                    nodes.add(config.uuid); fallback.set(candidateKey, nodes);
                }
            }
            this.ambiguous = new Set([...primary.values()].filter(nodes => nodes.size > 1).flatMap(nodes => [...nodes]));
            for (const config of next.values()) {
                config.ips = config.ips.filter(entry => {
                    if (entry.status !== 'MANAGEMENT' && entry.status !== 'RESERVE') return true;
                    const key = endpoint(config, entry.ip);
                    return (!primary.has(key) || primary.get(key)!.has(config.uuid)) && (fallback.get(key)?.size ?? 0) <= 1;
                });
            }
            this.inventory = next;
            this.generation = after;
            this.expires = Date.now() + 10000;
        })().finally(() => { this.pending = undefined; });
        return this.pending;
    }

    async get(opts: INodeConnectionOpts): Promise<NodeRouteConfiguration> {
        await this.refresh();
        if (opts.uuid) {
            const config = this.inventory.get(opts.uuid);
            if (!config) throw new Error('Node route is not registered');
            if (this.ambiguous.has(opts.uuid)) throw new Error('Node API endpoint belongs to multiple registered nodes');
            return config;
        }
        throw new Error('Node UUID required for registered control request');
    }

    async isCurrent(config: NodeRouteConfiguration, allowDisabled = false): Promise<boolean> {
        try {
            const current = await this.get(config);
            return (allowDisabled || !current.isDisabled) && routeRevision(current) === routeRevision(config);
        } catch (error) {
            if (error instanceof NodeRouteBusyError) throw error;
            return false;
        }
    }
}
