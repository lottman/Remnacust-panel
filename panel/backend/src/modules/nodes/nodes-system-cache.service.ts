import { CACHE_KEYS } from '@contract/constants';

import { Injectable } from '@nestjs/common';

import { RawCacheService } from '@common/raw-cache';

import { INodeHotCache, INodeSystem } from './interfaces';

interface NodeTelemetrySnapshot {
    controlRevision: string | null;
    stats: INodeSystem['stats'] | null;
    xrayUptime: number;
}

@Injectable()
export class NodesSystemCacheService {
    constructor(private readonly rawCacheService: RawCacheService) {}

    async getMany(nodes: { uuid: string }[]): Promise<Map<string, INodeHotCache>> {
        const pipe = this.rawCacheService.createPipeline();
        for (const node of nodes) {
            pipe.get(CACHE_KEYS.NODE_SYSTEM_INFO(node.uuid));
            pipe.get(CACHE_KEYS.NODE_SYSTEM_STATS(node.uuid));
            pipe.get(CACHE_KEYS.NODE_USERS_ONLINE(node.uuid));
            pipe.get(CACHE_KEYS.NODE_VERSIONS(node.uuid));
            pipe.get(CACHE_KEYS.NODE_XRAY_UPTIME(node.uuid));
            pipe.get(CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(node.uuid));
        }

        const results = await pipe.exec();
        const map = new Map<string, INodeHotCache>();

        const KEYS_PER_NODE = 6;

        if (!results) {
            for (const node of nodes) {
                map.set(node.uuid, {
                    system: null,
                    versions: null,
                    xrayUptime: 0,
                    onlineUsers: 0,
                });
            }
            return map;
        }

        for (let i = 0; i < nodes.length; i++) {
            const base = i * KEYS_PER_NODE;
            const [infoErr, rawInfo] = results[base];
            const [statsErr, rawStats] = results[base + 1];
            const [onlineErr, rawOnline] = results[base + 2];
            const [versionsErr, rawVersions] = results[base + 3];
            const [uptimeErr, rawUptime] = results[base + 4];
            const [snapshotErr, rawSnapshot] = results[base + 5];
            const snapshot: NodeTelemetrySnapshot | null =
                !snapshotErr && rawSnapshot ? JSON.parse(rawSnapshot as string) : null;
            const stats = snapshot
                ? snapshot.stats
                : !statsErr && rawStats
                  ? JSON.parse(rawStats as string)
                  : null;

            const info = !infoErr && rawInfo && stats ? JSON.parse(rawInfo as string) : null;
            const system = info !== null && stats ? { info, stats } : null;

            const versions = !versionsErr && rawVersions ? JSON.parse(rawVersions as string) : null;
            const xrayUptime = snapshot
                ? snapshot.xrayUptime
                : !uptimeErr && rawUptime
                  ? Number(rawUptime)
                  : 0;
            const onlineUsers = !onlineErr && rawOnline ? Number(rawOnline) : 0;

            const controlRevision = snapshot?.controlRevision ?? null;
            map.set(nodes[i].uuid, { system, versions, xrayUptime, onlineUsers, controlRevision });
        }

        return map;
    }

    async getOne(uuid: string): Promise<INodeHotCache> {
        return (await this.getMany([{ uuid }])).get(uuid)!;
    }

    async delete(uuid: string): Promise<void> {
        await this.rawCacheService.delMany([
            CACHE_KEYS.NODE_SYSTEM_INFO(uuid),
            CACHE_KEYS.NODE_SYSTEM_STATS(uuid),
            CACHE_KEYS.NODE_USERS_ONLINE(uuid),
            CACHE_KEYS.NODE_VERSIONS(uuid),
            CACHE_KEYS.NODE_XRAY_UPTIME(uuid),
            CACHE_KEYS.NODE_TELEMETRY_SNAPSHOT(uuid),
        ]);
    }

    async getTotalOnlineUsers(nodes: { uuid: string }[]): Promise<number> {
        const pipe = this.rawCacheService.createPipeline();
        for (const node of nodes) {
            pipe.get(CACHE_KEYS.NODE_USERS_ONLINE(node.uuid));
        }

        const results = await pipe.exec();
        if (!results) return 0;

        return results.reduce((sum, [err, raw]) => sum + (!err && raw ? Number(raw) : 0), 0);
    }
}
