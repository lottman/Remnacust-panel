import type { QuotaPolicyBody } from './quota-policy';

import { createHash } from 'node:crypto';

// F: admission fenced, R: finite reserve (null grant means zero credit),
// U: unlimited. Recovery access bypasses R but never F.
type OwnerProof = ['F' | 'R' | 'U', string | null, string | null, string | null, boolean];
export type QuotaPolicyProof = {
    version: 1;
    userQuota: boolean;
    scopes: Record<string, Record<string, OwnerProof>>;
};
type Group = {
    reserveRequired?: boolean;
    fenceAll?: boolean;
    fencedOwners?: Record<string, boolean>;
    unlimitedOwners?: Record<string, boolean>;
    reserves?: Record<string, { id: string; ceiling: string }>;
    unreservedAccounts?: Record<string, string>;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

// One bounded desired and applied snapshot per node. It contains entitlement
// state, not credentials or an ever-growing history of periodic refreshes.
export function quotaPolicyProof(body: QuotaPolicyBody) {
    const members = new Map<string, Map<string, boolean>>();
    let size = 0;
    const add = (key: string, owner: string, recovery = false) => {
        if (!body.groups[key]) throw new Error('Quota proof group is missing');
        if (!/^[1-9][0-9]{0,18}$/.test(owner) || BigInt(owner) > 9223372036854775807n)
            throw new Error('Quota proof owner is invalid');
        let owners = members.get(key);
        if (!owners) members.set(key, (owners = new Map()));
        if (!owners.has(owner) && ++size > 200000) throw new Error('Quota proof is too large');
        owners.set(owner, recovery || owners.get(owner) === true);
    };
    for (const key of body.legacyGroups ?? []) {
        for (const owner of Object.keys(body.legacyOwners ?? {})) add(key, owner);
    }
    for (const host of Object.values(body.hosts)) {
        for (const [email, allowed] of Object.entries(host.allowedIdentities)) {
            if (!allowed) continue;
            const owner = email.split('~', 1)[0];
            for (const key of host.groups) {
                if (key.startsWith('host:') || key.startsWith('tag:') || key === 'user:global')
                    add(key, owner);
            }
            if (host.userQuotaExempt)
                for (const key of body.legacyGroups ?? []) add(key, owner, true);
        }
    }
    const proof: QuotaPolicyProof = { version: 1, userQuota: !!body.userQuota, scopes: {} };
    for (const [key, owners] of [...members].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const group = body.groups[key] as Group;
        const result: Record<string, OwnerProof> = {};
        for (const [owner, recovery] of [...owners].sort(([a], [b]) =>
            BigInt(a) < BigInt(b) ? -1 : 1,
        )) {
            const grant = group.reserves?.[owner];
            const account = group.unreservedAccounts?.[owner];
            if (
                (grant &&
                    (!uuid.test(grant.id) ||
                        typeof grant.ceiling !== 'string' ||
                        !/^(0|[1-9][0-9]{0,18})$/.test(grant.ceiling) ||
                        BigInt(grant.ceiling) > 9223372036854775807n)) ||
                (account !== undefined && !uuid.test(account)) ||
                (grant && group.unlimitedOwners?.[owner])
            )
                throw new Error('Quota proof grant or account is invalid');
            const mode =
                group.fenceAll || group.fencedOwners?.[owner]
                    ? 'F'
                    : group.reserveRequired && !group.unlimitedOwners?.[owner]
                      ? 'R'
                      : 'U';
            result[owner] = [
                mode,
                grant?.id ?? null,
                grant?.ceiling ?? null,
                account ?? null,
                recovery,
            ];
        }
        proof.scopes[key] = result;
    }
    return { proof, source: createHash('sha256').update(JSON.stringify(proof)).digest('hex') };
}
