import { randomInt } from 'node:crypto';

import type { TInjectHostsEntry } from '@libs/contracts/models';

interface Candidate {
    metadata: { uuid: string; tags: string[] };
}

export function uniqueHosts<T extends Candidate>(hosts: T[]): T[] {
    const seen = new Set<string>();
    return hosts.filter((host) => !seen.has(host.metadata.uuid) && !!seen.add(host.metadata.uuid));
}

export function selectPool<T extends Candidate>(
    type: 'uuids' | 'tags',
    values: string[],
    candidates: T[],
): T[] {
    if (type === 'tags') {
        const tags = new Set(values);
        return uniqueHosts(
            candidates.filter((host) => host.metadata.tags.some((tag) => tags.has(tag))),
        );
    }
    const byUuid = new Map(candidates.map((host) => [host.metadata.uuid, host]));
    return uniqueHosts(
        values.flatMap((uuid) => {
            const host = byUuid.get(uuid);
            return host ? [host] : [];
        }),
    );
}

// Randomness is request-local. Selection happens only after user access and visibility filtering.
export function selectInjectHosts<T extends Candidate>(
    entry: TInjectHostsEntry,
    candidates: T[],
    pick = randomInt,
): T[] {
    const selector = entry.selector;
    if (selector.type !== 'uuids' && selector.type !== 'tags') return candidates;
    if (entry.mode === 'group') {
        const groups = Object.values(selector.groups ?? {})
            .map((values) => selectPool(selector.type, values, candidates))
            .filter((group) => group.length > 0);
        return groups.length ? groups[pick(groups.length)] : [];
    }
    const pool = selectPool(selector.type, selector.values ?? [], candidates);
    if (entry.mode !== 'random') return pool;
    const count = Math.min(selector.expected ?? 0, pool.length);
    for (let index = 0; index < count; index++) {
        const chosen = index + pick(pool.length - index);
        [pool[index], pool[chosen]] = [pool[chosen], pool[index]];
    }
    return pool.slice(0, count);
}
