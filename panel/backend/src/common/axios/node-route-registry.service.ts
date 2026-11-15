import type { INodeConnectionOpts } from './axios.interfaces';

import { Injectable } from '@nestjs/common';

import { NodeControlAddressSchema } from '../../../libs/contract/models/node-control-addresses.schema';
import { NodeIpSchema } from '../../../libs/contract/models/node-ips.schema';
import { parseSocksProxyUrl } from '../../../libs/contract/models/socks-proxy.schema';
import {
    NodeRouteRegistry,
    NodeRouteBusyError,
    normalizeNodeAddress,
    nodeEffectivePort,
    routeCandidates,
    routeRevision,
    type NodeRouteConfiguration,
} from './node-control-route';
import { NodeRouteInventoryService } from './node-route-inventory.service';

@Injectable()
export class NodeRouteRegistryService extends NodeRouteRegistry {
    private inventory = new Map<string, NodeRouteConfiguration>();
    private generation: string | null = null;
    private expires = 0;
    private pending?: Promise<void>;
    private ambiguous = new Set<string>();

    constructor(private readonly prisma: NodeRouteInventoryService) {
        super();
    }

    async invalidate(): Promise<void> {
        this.expires = 0;
    }

    private async bounded<T>(operation: () => Promise<T>, deadline: number): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const remaining = deadline - Date.now();
            if (remaining <= 0) throw new NodeRouteBusyError();
            return await Promise.race([
                operation(),
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(
                        () => reject(new NodeRouteBusyError('Node route registry timed out')),
                        remaining,
                    );
                }),
            ]);
        } catch {
            throw new NodeRouteBusyError('Node route inventory is temporarily unavailable');
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    private async refresh(deadline: number): Promise<void> {
        const generation = await this.bounded(() => this.prisma.readRevision(), deadline);
        if (generation === this.generation && Date.now() < this.expires) return;
        if (this.pending) return this.pending;
        this.pending = (async () => {
            const before = generation;
            const rows = await this.bounded(
                () =>
                    this.prisma.nodes.findMany({
                        select: {
                            uuid: true,
                            address: true,
                            port: true,
                            proxyUrl: true,
                            ips: true,
                            controlAddresses: true,
                            controlRevision: true,
                            isDisabled: true,
                        },
                        take: 10001,
                    }),
                deadline,
            );
            if (rows.length > 10000) throw new Error('Node route inventory exceeds limit');
            const after = await this.bounded(() => this.prisma.readRevision(), deadline);
            if (before !== after)
                throw new NodeRouteBusyError('Node route configuration changed during refresh');
            const next = new Map<string, NodeRouteConfiguration>();
            for (const row of rows) {
                const ips = (Array.isArray(row.ips) ? row.ips : [])
                    .slice(0, 64)
                    .flatMap((entry) => {
                        const parsed = NodeIpSchema.safeParse(entry);
                        return parsed.success ? [parsed.data] : [];
                    });
                if (
                    (row.controlAddresses === undefined && !normalizeNodeAddress(row.address)) ||
                    (row.proxyUrl && !parseSocksProxyUrl(row.proxyUrl))
                )
                    continue;
                const controlAddresses =
                    row.controlAddresses === undefined
                        ? undefined
                        : (Array.isArray(row.controlAddresses) ? row.controlAddresses : [])
                              .slice(0, 65)
                              .flatMap((entry) => {
                                  const parsed = NodeControlAddressSchema.safeParse(entry);
                                  return parsed.success ? [parsed.data] : [];
                              });
                const config: NodeRouteConfiguration = { ...row, ips, controlAddresses };
                config.revision = row.controlRevision ?? routeRevision(config);
                next.set(row.uuid, config);
            }
            const endpoint = (config: NodeRouteConfiguration, address: string) => {
                const proxy = config.proxyUrl ? parseSocksProxyUrl(config.proxyUrl)! : null;
                const context = proxy
                    ? [
                          normalizeNodeAddress(proxy.hostname),
                          Number(proxy.port),
                          decodeURIComponent(proxy.username),
                          decodeURIComponent(proxy.password),
                      ]
                    : null;
                return JSON.stringify([
                    normalizeNodeAddress(address),
                    nodeEffectivePort(address, config.port),
                    context,
                ]);
            };
            const primary = new Map<string, Set<string>>(),
                fallback = new Map<string, Set<string>>();
            for (const config of next.values()) {
                const candidates = routeCandidates(config);
                if (candidates[0]) {
                    const key = endpoint(config, candidates[0]);
                    const owners = primary.get(key) ?? new Set<string>();
                    owners.add(config.uuid);
                    primary.set(key, owners);
                }
                for (const address of candidates.slice(1)) {
                    const candidateKey = endpoint(config, address);
                    const nodes = fallback.get(candidateKey) ?? new Set<string>();
                    nodes.add(config.uuid);
                    fallback.set(candidateKey, nodes);
                }
            }
            this.ambiguous = new Set(
                [...primary.values()]
                    .filter((nodes) => nodes.size > 1)
                    .flatMap((nodes) => [...nodes]),
            );
            for (const config of next.values()) {
                if (config.controlAddresses)
                    config.controlAddresses = config.controlAddresses.map((entry) => {
                        const key = endpoint(config, entry.address);
                        return (primary.has(key) && !primary.get(key)!.has(config.uuid)) ||
                            (fallback.get(key)?.size ?? 0) > 1
                            ? { ...entry, enabled: false }
                            : entry;
                    });
                config.ips = config.ips.filter((entry) => {
                    if (entry.status !== 'MANAGEMENT' && entry.status !== 'RESERVE') return true;
                    const key = endpoint(config, entry.ip);
                    return (
                        (!primary.has(key) || primary.get(key)!.has(config.uuid)) &&
                        (fallback.get(key)?.size ?? 0) <= 1
                    );
                });
            }
            this.inventory = next;
            this.generation = after;
            this.expires = Date.now() + 10000;
        })().finally(() => {
            this.pending = undefined;
        });
        return this.pending;
    }

    async get(opts: INodeConnectionOpts, budgetMs = 2000): Promise<NodeRouteConfiguration> {
        const deadline = Date.now() + Math.max(1, Math.min(2000, budgetMs));
        await this.bounded(() => this.refresh(deadline), deadline);
        if (opts.uuid) {
            const config = this.inventory.get(opts.uuid);
            if (!config) throw new Error('Node route is not registered');
            if (this.ambiguous.has(opts.uuid))
                throw new Error('Node API endpoint belongs to multiple registered nodes');
            return config;
        }
        throw new Error('Node UUID required for registered control request');
    }

    async isCurrent(
        config: NodeRouteConfiguration,
        allowDisabled = false,
        budgetMs = 2000,
    ): Promise<boolean> {
        try {
            const current = await this.get(config, budgetMs);
            return (
                (allowDisabled || !current.isDisabled) &&
                routeRevision(current) === routeRevision(config)
            );
        } catch (error) {
            if (error instanceof NodeRouteBusyError) throw error;
            return false;
        }
    }
}
