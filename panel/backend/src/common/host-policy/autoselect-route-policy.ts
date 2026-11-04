import type { PolicyHost } from './host-policy.types';

import { Address4, Address6 } from 'ip-address';
import { createHash } from 'node:crypto';

import { isIpDestinationRule, normalizeDestinationRule } from './destination-rule';

export type AutoselectRoute = { uuid: string; ownerUuid: string; sourceUuid: string | null };

export function autoselectRouteUuid(owner: string, source: string): string {
    const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    if (!uuid.test(owner) || !uuid.test(source) || owner.toLowerCase() === source.toLowerCase())
        throw new Error('Invalid autoselect route');
    const bytes = createHash('sha256')
        .update(
            JSON.stringify([
                'remnacust-autoselect-route-v1',
                owner.toLowerCase(),
                source.toLowerCase(),
            ]),
        )
        .digest()
        .subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 128;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Destinations = NonNullable<PolicyHost['domains']>;

function contains(outer: string, inner: string): boolean {
    const outerIp = isIpDestinationRule(outer),
        innerIp = isIpDestinationRule(inner);
    if (outerIp !== innerIp) return false;
    if (!outerIp) return inner === outer || inner.endsWith('.' + outer);
    if (outer.includes(':') !== inner.includes(':')) return false;
    const parse = (value: string) =>
        value.includes(':') ? new Address6(value) : new Address4(value);
    return parse(inner).isInSubnet(parse(outer));
}

export function routeDestinations(
    owner: PolicyHost['domains'],
    source: PolicyHost['domains'],
): Destinations {
    const normalized = (value: PolicyHost['domains']): Destinations => ({
        mode: value?.mode ?? 'OFF',
        domains:
            value?.mode === 'OFF'
                ? []
                : [...new Set(value?.domains.map(normalizeDestinationRule) ?? [])],
    });
    const left = normalized(owner),
        right = normalized(source);
    if (left.mode === 'OFF') return right;
    if (right.mode === 'OFF') return left;
    if (left.mode === 'DENY' && right.mode === 'DENY')
        return { mode: 'DENY', domains: [...new Set([...left.domains, ...right.domains])] };
    if (left.mode === 'ALLOW_ONLY' && right.mode === 'ALLOW_ONLY')
        return {
            mode: 'ALLOW_ONLY',
            domains: [
                ...new Set(
                    left.domains.flatMap((a) =>
                        right.domains.flatMap((b) =>
                            contains(a, b) ? [b] : contains(b, a) ? [a] : [],
                        ),
                    ),
                ),
            ],
        };
    const allow = left.mode === 'ALLOW_ONLY' ? left : right;
    const deny = left.mode === 'DENY' ? left : right;
    return {
        mode: 'ALLOW_ONLY',
        domains: allow.domains.filter(
            (a) => !deny.domains.some((b) => contains(a, b) || contains(b, a)),
        ),
    };
}

export function attachAutoselectRoutes(
    hosts: PolicyHost[],
    routes: AutoselectRoute[],
): PolicyHost[] {
    const byId = new Map(hosts.map((host) => [host.uuid, host]));
    const aliases = routes.flatMap((route) => {
        const owner = byId.get(route.ownerUuid),
            source = route.sourceUuid ? byId.get(route.sourceUuid) : undefined;
        if (!owner || !source) return [];
        if (byId.has(route.uuid) || route.uuid !== autoselectRouteUuid(owner.uuid, source.uuid))
            throw new Error('Autoselect route identity conflict');
        return [
            {
                ...owner,
                uuid: route.uuid,
                quotaHostUuid: owner.uuid,
                sourceHostUuid: source.uuid,
                inboundUuid: source.inboundUuid,
                inboundTag: source.inboundTag,
                profileUuid: source.profileUuid,
                nodes: source.nodes,
                boundNodes: source.boundNodes,
                issued: true,
                domains: routeDestinations(owner.domains, source.domains),
            },
        ];
    });
    return [...hosts, ...aliases];
}
