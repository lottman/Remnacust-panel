import { configuredRegex } from '@common/utils/bounded-regex';
import { InjectHostsEntrySchema, TInjectHostsEntry } from '@libs/contracts/models';

import { ResolvedProxyConfig } from '../resolve-proxy/interfaces';
import { selectInjectHosts } from './inject-host-selection';

export interface ClientCandidate {
    host: ResolvedProxyConfig;
    name: string;
}

export class ClientPoolError extends Error {}

export function clientName(name: string, uuid: string, used: Set<string>): string {
    let result = name;
    for (let index = 1; used.has(result); index++)
        result = `${name} · ${uuid.slice(0, 8)}${index > 1 ? `-${index}` : ''}`;
    used.add(result);
    return result;
}

export function clientPool(value: unknown): TInjectHostsEntry | undefined {
    if (value === undefined) return undefined;
    let pool: TInjectHostsEntry;
    try {
        pool = InjectHostsEntrySchema.parse(value);
    } catch {
        throw new ClientPoolError('Invalid client host pool');
    }
    if (pool.selector.type === 'sameTagAsRecipient')
        throw new ClientPoolError(
            'A whole-subscription group has no recipient host; use explicit hosts or tags',
        );
    return pool;
}

export async function clientPoolMembers(
    value: unknown,
    candidates: ClientCandidate[],
    deadline: number,
): Promise<string[] | undefined> {
    const pool = clientPool(value);
    if (!pool) return undefined;
    const eligible: (ResolvedProxyConfig & { clientName: string })[] = [];
    for (const { host, name } of candidates) {
        const visibility = pool.selectFrom ?? 'NOT_HIDDEN';
        if (visibility === 'HIDDEN' && !host.metadata.isHidden) continue;
        if (visibility === 'NOT_HIDDEN' && host.metadata.isHidden) continue;
        if (
            pool.selector.type === 'remarkRegex' &&
            !(await configuredRegex.test(pool.selector.pattern, host.finalRemark, '', deadline))
        )
            continue;
        if (pool.selector.type === 'tagRegex') {
            let matched = false;
            for (const tag of host.metadata.tags) {
                if (await configuredRegex.test(pool.selector.pattern, tag, '', deadline)) {
                    matched = true;
                    break;
                }
            }
            if (!matched) continue;
        }
        eligible.push({ ...host, clientName: name });
    }
    return [...new Set(selectInjectHosts(pool, eligible).map((host) => host.clientName))];
}

// A configured pool with no eligible members must never fall back to direct traffic.
export async function renderClientGroups(
    groups: Record<string, unknown>[],
    candidates: ClientCandidate[],
    legacy: (custom: Record<string, unknown> | undefined) => string[],
    singbox = false,
): Promise<Record<string, unknown>[]> {
    const deadline = Date.now() + 1000;
    const rendered: Record<string, unknown>[] = [];
    for (const group of groups) {
        const custom = group.remnawave as Record<string, unknown> | undefined;
        const { remnawave: _custom, ...clean } = group;
        let members: string[] | undefined;
        try {
            members = await clientPoolMembers(custom?.pool, candidates, deadline);
        } catch (error) {
            throw new ClientPoolError(
                error instanceof Error ? error.message : 'Client pool failed',
            );
        }
        const key = singbox ? 'outbounds' : 'proxies';
        const existing = Array.isArray(clean[key]) ? (clean[key] as string[]) : [];
        const names =
            members === undefined ? [...existing, ...legacy(custom)] : [...existing, ...members];
        if (members !== undefined && !names.length)
            throw new ClientPoolError(
                `No eligible hosts for client group ${String(group.name ?? group.tag)}`,
            );
        rendered.push({ ...clean, [key]: [...new Set(names)] });
    }
    return rendered;
}
