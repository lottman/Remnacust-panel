import type { PolicySnapshot } from './host-policy.types';
import type { QuotaNodeMode, QuotaPolicyBody } from './quota-policy';

import { sql } from 'kysely';

import type { TxKyselyService } from '@common/database';

type Scope = {
    scope: string;
    kind: 'HOST' | 'TAG' | 'USER';
    key: string;
    anchor: string;
    resetValue: number;
    resetUnit: string;
};
const maxBindings = 200000;
const identity = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ownerId = /^[1-9][0-9]{0,18}$/;

// Runs in the policy transaction, before its HTTP delivery. Existing bank
// accounts are reused; rendering cannot allocate credit or create a new bank.
export async function renderUnreservedQuotaPolicy(
    db: TxKyselyService,
    node: string,
    mode: QuotaNodeMode,
    state: PolicySnapshot,
    body: QuotaPolicyBody,
    revision: string,
) {
    const scopes = new Map<string, Scope>();
    for (const group of state.groups) {
        if (!group.nodeUuids.includes(node) || !body.groups[group.key]) continue;
        const kind = group.key.startsWith('host:')
            ? 'HOST'
            : group.key.startsWith('tag:')
              ? 'TAG'
              : null;
        if (!kind) continue; // Speed-only tag groups never acquire a quota account.
        scopes.set(group.key, {
            scope: group.key,
            kind,
            key: group.key.slice(kind === 'HOST' ? 5 : 4),
            anchor: group.anchor.toISOString(),
            resetValue: group.resetValue,
            resetUnit: group.resetUnit,
        });
    }
    if (mode.userQuota && body.groups['user:global']) {
        scopes.set('user:global', {
            scope: 'user:global',
            kind: 'USER',
            key: 'global',
            anchor: '1970-01-01T00:00:00.000Z',
            resetValue: 0,
            resetUnit: 'DAYS',
        });
    }
    const eligible = new Map<string, Map<string, Set<number>>>();
    let bindings = 0;
    const add = (scope: string, owner: string, factor: number) => {
        if (!scopes.has(scope)) return;
        const scale = scope === 'user:global' ? 1000000000 : 100;
        if (
            !ownerId.test(owner) ||
            BigInt(owner) > 9223372036854775807n ||
            !Number.isSafeInteger(factor) ||
            factor < (scale === 100 ? 1 : 0) ||
            factor > 100 * scale
        )
            throw new Error('Invalid unreserved quota owner or price');
        let owners = eligible.get(scope);
        if (!owners) eligible.set(scope, (owners = new Map()));
        let prices = owners.get(owner);
        if (!prices) {
            if (++bindings > maxBindings) throw new Error('Unreserved quota policy is too large');
            owners.set(owner, (prices = new Set()));
        }
        prices.add(factor);
    };
    // The scope's actual wire references determine eligibility, including tag
    // opt-outs and cleared host identities. No host/owner Cartesian scan.
    for (const host of Object.values(body.hosts)) {
        const owners = new Set(
            Object.entries(host.allowedIdentities)
                .filter(([, allowed]) => allowed)
                .map(([email]) => email.split('~', 1)[0]),
        );
        for (const scope of host.groups) {
            if (!scopes.has(scope)) continue;
            const factor = host.quotaMultipliers?.[scope];
            if (factor === undefined) throw new Error('Unreserved quota host price is missing');
            for (const owner of owners) add(scope, owner, factor);
        }
    }
    for (const scope of body.legacyGroups ?? []) {
        const factor = body.legacyQuotaMultipliers?.[scope];
        if (factor === undefined) throw new Error('Unreserved quota legacy price is missing');
        for (const owner of Object.keys(body.legacyOwners ?? {})) add(scope, owner, factor);
    }
    if (!bindings) return;
    const owners = [...eligible].flatMap(([scope, owners]) =>
        [...owners.keys()].map((owner) => ({ scope, owner })),
    );
    const accounts = await sql<{ scope: string; owner: string; account: string }>`
        WITH scopes AS (SELECT d.scope,d.kind,d.key,CASE WHEN d.kind='USER' THEN '1970-01-01'::date
          ELSE (xera_quota_window_start(d.anchor,d."resetValue",d."resetUnit",now()) AT TIME ZONE 'UTC')::date END AS window_start
          FROM jsonb_to_recordset(${JSON.stringify([...scopes.values()])}::jsonb)
            AS d(scope TEXT,kind TEXT,key TEXT,anchor TIMESTAMPTZ,"resetValue" INTEGER,"resetUnit" TEXT)),
        owners AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(owners)}::jsonb) AS d(scope TEXT,owner BIGINT))
        SELECT s.scope,p.user_id::text AS owner,p.usage_account::text AS account
          FROM scopes s JOIN owners o ON o.scope=s.scope
          JOIN xera_quota_reserve_pools p ON p.kind=s.kind AND p.key=s.key AND p.user_id=o.owner AND p.window_start=s.window_start
          WHERE p.expires_at>now() AND p.budget_epoch=xera_current_quota_epoch(p.kind,p.key,p.user_id,p.window_start)
          ORDER BY s.scope,p.user_id LIMIT 200001
    `.execute(db.kysely);
    if (accounts.rows.length > maxBindings) throw new Error('Too many unreserved quota accounts');
    if (accounts.rows.length && (!mode.instance || !identity.test(mode.instance)))
        throw new Error('Unreserved quota account requires a proven node journal instance');
    const deliveries: { account: string; factor: number; scale: number }[] = [];
    const seen = new Set<string>();
    for (const row of accounts.rows) {
        const prices = eligible.get(row.scope)?.get(row.owner);
        const wire = body.groups[row.scope];
        if (!wire || !prices || !identity.test(row.account) || seen.has(row.account))
            throw new Error('Unreserved quota account binding differs from its owner or scope');
        seen.add(row.account);
        const assigned = (wire.unreservedAccounts ??= {}) as Record<string, string>;
        if (Object.hasOwn(assigned, row.owner))
            throw new Error('More than one current unreserved quota account');
        assigned[row.owner] = row.account;
        for (const factor of prices) {
            if (factor === 0) continue;
            if (deliveries.length >= maxBindings)
                throw new Error('Too many unreserved quota prices');
            deliveries.push({
                account: row.account,
                factor,
                scale: row.scope === 'user:global' ? 1000000000 : 100,
            });
        }
    }
    for (let offset = 0; offset < deliveries.length; offset += 500) {
        await sql`INSERT INTO xera_quota_usage_deliveries(usage_account,node_uuid,instance_uuid,factor,scale,first_revision,last_revision)
          SELECT d.account,${node}::uuid,${mode.instance}::uuid,d.factor,d.scale,${revision}::bigint,${revision}::bigint
          FROM jsonb_to_recordset(${JSON.stringify(deliveries.slice(offset, offset + 500))}::jsonb) AS d(account UUID,factor BIGINT,scale BIGINT)
          ON CONFLICT(usage_account,node_uuid,instance_uuid,factor,scale) DO UPDATE
            SET last_revision=GREATEST(xera_quota_usage_deliveries.last_revision,excluded.last_revision)
        `.execute(db.kysely);
    }
}
