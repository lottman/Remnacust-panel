import type { PolicyIdentity, PolicySnapshot } from './host-policy.types';
import type { QuotaRegistration } from './quota-registration';

import { sql } from 'kysely';
import { createHash } from 'node:crypto';

import type { TxKyselyService } from '@common/database';

import { renderQuotaTransitionPolicy } from './quota-transition-policy';
import { renderUnreservedQuotaPolicy } from './unreserved-quota-policy';
import { renderUserQuotaPolicy } from './user-quota-policy';

export const QUOTA_RESERVES_VERSION = 'remnacust-quota-reserves-v1';
export type QuotaNodeMode = {
    phase: 'FENCING' | 'ACTIVE';
    instance: string | null;
    userQuota?: boolean;
};

export function quotaSourceFingerprint(state: PolicySnapshot, node: string) {
    const hosts = state.hosts.filter((h) => h.boundNodes.includes(node));
    const ids = new Set(hosts.map((h) => h.uuid));
    const ordered = <T>(values: T[]) => values.map((v) => JSON.stringify(v)).sort();
    return createHash('sha256')
        .update(
            JSON.stringify({
                users: state.users ? ordered(state.users) : undefined,
                consumptionMultiplier: state.consumptionMultiplier,
                hosts: ordered(
                    hosts.map((h) => ({
                        ...h,
                        tags: [...h.tags].sort(),
                        nodes: [...h.nodes].sort(),
                        boundNodes: [...h.boundNodes].sort(),
                    })),
                ),
                groups: ordered(
                    state.groups
                        .filter((g) => g.nodeUuids.includes(node))
                        .map((g) => ({
                            ...g,
                            hostUuids: [...g.hostUuids].sort(),
                            nodeUuids: [...g.nodeUuids].sort(),
                        })),
                ),
                identities: ordered(
                    state.identities
                        .filter((i) => ids.has(i.hostUuid))
                        .map(({ rawInbound: _raw, ...i }) => i),
                ),
            }),
        )
        .digest('hex');
}
export type QuotaPolicyBody = {
    offlineReserves?: string;
    quotaRegistrations?: string;
    quotaCheckpoint?: { instance: string; sequence: string };
    registrations?: QuotaRegistration[];
    userQuota?: string;
    legacyGroups?: string[];
    legacyOwners?: Record<string, { allowed: boolean; expiresAt: number }>;
    legacyQuotaMultipliers?: Record<string, number>;
    groups: Record<string, Record<string, unknown>>;
    hosts: Record<
        string,
        {
            groups: string[];
            allowedIdentities: Record<string, boolean>;
            identityExpiresAt?: Record<string, number>;
            quotaMultipliers?: Record<string, number>;
            userQuotaExempt?: boolean;
        }
    >;
};

export async function quotaNodeMode(db: TxKyselyService, node: string) {
    const result =
        await sql<QuotaNodeMode>`SELECT phase,instance_uuid::text AS instance,user_quota AS "userQuota"
        FROM xera_quota_node_modes WHERE node_uuid=${node}::uuid`.execute(db.kysely);
    return result.rows[0] ?? null;
}

// Called only under the node policy transaction. Preparing grants and the
// delivery revision commit together before any node can see the new policy.
export async function renderQuotaPolicy(
    db: TxKyselyService,
    node: string,
    mode: QuotaNodeMode,
    state: PolicySnapshot,
    body: QuotaPolicyBody,
    revision: string,
    username: (identity: PolicyIdentity) => string,
) {
    body.offlineReserves = QUOTA_RESERVES_VERSION;
    const hostsByKey = new Map(state.hosts.map((host) => [host.uuid.replaceAll('-', ''), host]));
    const groupsByKey = new Map(state.groups.map((group) => [group.key, group]));
    const identitiesByHost = new Map<string, PolicyIdentity[]>();
    for (const identity of state.identities) {
        if (!identity.allowed) continue;
        let identities = identitiesByHost.get(identity.hostUuid);
        if (!identities) identitiesByHost.set(identity.hostUuid, (identities = []));
        identities.push(identity);
    }
    for (const group of state.groups.filter((g) => g.nodeUuids.includes(node))) {
        if (BigInt(group.userLimit ?? '0') <= 0n) continue;
        const kind = group.key.startsWith('host:') ? 'HOST' : 'TAG';
        const key = group.key.slice(kind === 'HOST' ? 5 : 4);
        const wire = body.groups[group.key];
        if (!wire) throw new Error('Quota group is missing from the node policy');
        // The legacy SQL meter is presentation/accounting. The local reserve
        // enforces exhaustion after cutover, including a new manual RESET.
        const controls = await sql<{ owner: string; unlimited: boolean; paused: boolean }>`
            SELECT a.user_id::text AS owner,a.unlimited,a.paused FROM xera_limit_user_adjustments a
            WHERE a.kind=${kind} AND a.key=${key}
        `.execute(db.kysely);
        const scope = await sql<{ paused: boolean }>`SELECT paused FROM xera_limit_scopes
            WHERE kind=${kind} AND key=${key}`.execute(db.kysely);
        wire.reserveRequired = true;
        wire.blockAll = scope.rows[0]?.paused ?? false;
        wire.blockedOwners = Object.fromEntries(
            controls.rows.filter((r) => r.paused).map((r) => [r.owner, true]),
        );
        wire.unlimitedOwners = Object.fromEntries(
            controls.rows.filter((r) => r.unlimited).map((r) => [r.owner, true]),
        );
        if (mode.phase === 'FENCING') {
            wire.fenceAll = true;
        }
        if (mode.phase === 'ACTIVE' && !mode.instance)
            throw new Error('Node quota state must be recovered before issuing credit');
        const grants = await sql<{
            id: string;
            instance: string;
            owner: string;
            ceiling: string;
            expiresAt: Date;
            epoch: string;
            window: Date;
        }>`
            SELECT g.id::text AS id,g.instance_uuid::text AS instance,g.user_id::text AS owner,
              g.ceiling_bytes::text AS ceiling,p.expires_at AS "expiresAt",g.budget_epoch::text AS epoch,
              g.window_start AS window
            FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
            WHERE g.kind=${kind} AND g.key=${key} AND g.node_uuid=${node}::uuid
              AND g.closed_usage_bytes IS NULL AND g.retired_at IS NULL AND p.expires_at>now()
              AND g.window_start=(xera_quota_window_start(${group.anchor}::timestamptz,${group.resetValue}::integer,
                  ${group.resetUnit},now()) AT TIME ZONE 'UTC')::date
              AND g.budget_epoch=xera_current_quota_epoch(g.kind,g.key,g.user_id,g.window_start)
              AND NOT EXISTS(SELECT 1 FROM xera_limit_user_adjustments a WHERE a.kind=g.kind
                  AND a.key=g.key AND a.user_id=g.user_id AND a.unlimited)
        `.execute(db.kysely);
        const reserves: Record<string, unknown> = {};
        for (const grant of grants.rows) {
            if (grant.instance !== mode.instance)
                throw new Error('Node quota instance changed; its previous grants remain reserved');
            if (Object.hasOwn(reserves, grant.owner))
                throw new Error('More than one current quota period is active for an owner');
            reserves[grant.owner] = {
                id: grant.id,
                instance: grant.instance,
                ceiling: grant.ceiling,
                expiresAt: grant.expiresAt.getTime(),
            };
            await sql`INSERT INTO xera_quota_node_epochs(kind,key,user_id,window_start,node_uuid,instance_uuid,desired_epoch,desired_revision)
                VALUES(${kind},${key},${grant.owner}::bigint,${grant.window}::date,${node}::uuid,
                    ${mode.instance}::uuid,${grant.epoch}::uuid,${revision}::bigint)
                ON CONFLICT(kind,key,user_id,window_start,node_uuid) DO UPDATE SET
                    instance_uuid=excluded.instance_uuid,desired_epoch=excluded.desired_epoch,
                    desired_revision=excluded.desired_revision,updated_at=now()
                WHERE xera_quota_node_epochs.desired_revision<excluded.desired_revision`.execute(
                db.kysely,
            );
        }
        wire.reserves = reserves;
    }
    for (const [hostKey, wire] of Object.entries(body.hosts)) {
        const host = hostsByKey.get(hostKey);
        if (!host) throw new Error('Quota host metadata is missing');
        wire.identityExpiresAt = {};
        for (const identity of identitiesByHost.get(host.uuid) ?? []) {
            const email = username(identity);
            if (!wire.allowedIdentities[email]) continue;
            // Recovery hosts intentionally allow an expired subscription. Their
            // last committed entitlement remains usable without the panel.
            const expiry =
                host.alwaysAvailable || host.onlyWhenInactive ? 0 : identity.expireAt?.getTime();
            if (expiry === undefined || !Number.isSafeInteger(expiry) || expiry < 0)
                throw new Error('Identity expiry is unavailable; autonomous access was refused');
            wire.identityExpiresAt[email] = expiry;
        }
        wire.quotaMultipliers = {};
        for (const groupKey of wire.groups) {
            if (!groupKey.startsWith('host:') && !groupKey.startsWith('tag:')) continue;
            const group = groupsByKey.get(groupKey);
            if (!group) throw new Error('Quota multiplier metadata is missing');
            // SQL uses the host override, otherwise the tag's multiplier.
            const multiplier = host.trafficMultiplier ?? group.trafficMultiplier;
            const factor = Math.round(multiplier * 100);
            if (
                !Number.isSafeInteger(factor) ||
                multiplier < 0.01 ||
                multiplier > 100 ||
                Math.abs(multiplier * 100 - factor) > 1e-8
            )
                throw new Error('Invalid autonomous quota multiplier');
            wire.quotaMultipliers[groupKey] = factor;
        }
    }
    await renderUserQuotaPolicy(db, node, mode, state, body, revision);
    await renderUnreservedQuotaPolicy(db, node, mode, state, body, revision);
    await renderQuotaTransitionPolicy(db, node, body);
}
