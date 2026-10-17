import type { PolicySnapshot } from './host-policy.types';
import type { QuotaNodeMode, QuotaPolicyBody } from './quota-policy';

import { sql } from 'kysely';

import type { TxKyselyService } from '@common/database';

export const USER_QUOTA_VERSION = 'remnacust-user-quota-reserves-v1';
const GROUP = 'user:global';
const SCALE = 1_000_000_000;

// This renderer runs inside the policy transaction. It never calls a node or
// allocates credit; only grants already committed by the coordinator are sent.
export async function renderUserQuotaPolicy(
    db: TxKyselyService,
    node: string,
    mode: QuotaNodeMode,
    state: PolicySnapshot,
    body: QuotaPolicyBody,
    revision: string,
) {
    if (!mode.userQuota) return;
    if (
        !state.users ||
        !state.consumptionMultiplier ||
        !/^(0|[1-9][0-9]{0,11})$/.test(state.consumptionMultiplier) ||
        BigInt(state.consumptionMultiplier) > 100n * BigInt(SCALE)
    )
        throw new Error('Global quota entitlements or node billing factor are unavailable');
    if (mode.phase === 'ACTIVE' && !mode.instance)
        throw new Error('Global quota instance requires recovery');
    const users = new Map(state.users.map((user) => [user.userId, user]));
    if (users.size !== state.users.length || users.size > 200000)
        throw new Error('Invalid global quota owner set');
    const factor = Number(state.consumptionMultiplier);
    body.userQuota = USER_QUOTA_VERSION;
    body.legacyGroups = [GROUP];
    body.legacyQuotaMultipliers = { [GROUP]: factor };
    body.legacyOwners = {};
    const unlimited: Record<string, boolean> = {};
    const blocked: Record<string, boolean> = {};
    for (const user of state.users) {
        const expiresAt = user.expireAt.getTime();
        if (
            !/^[1-9][0-9]{0,18}$/.test(user.userId) ||
            BigInt(user.userId) > 9223372036854775807n ||
            !/^(0|[1-9][0-9]{0,18})$/.test(user.limit) ||
            BigInt(user.limit) > 9223372036854775807n ||
            !Number.isSafeInteger(expiresAt) ||
            expiresAt <= 0 ||
            expiresAt > 253402300799999
        )
            throw new Error('Invalid global quota entitlement');
        body.legacyOwners[user.userId] = { allowed: user.allowed, expiresAt };
        if (user.limit === '0') unlimited[user.userId] = true;
        if (!user.allowed) blocked[user.userId] = true;
    }
    const grants = await sql<{
        id: string;
        instance: string;
        owner: string;
        ceiling: string;
        expiresAt: Date;
        epoch: string;
        window: Date;
    }>`SELECT g.id::text AS id,g.instance_uuid::text AS instance,g.user_id::text AS owner,
        g.ceiling_bytes::text AS ceiling,p.expires_at AS "expiresAt",g.budget_epoch::text AS epoch,g.window_start AS window
        FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
        WHERE g.kind='USER' AND g.key='global' AND g.node_uuid=${node}::uuid AND g.window_start='1970-01-01'
          AND g.closed_usage_bytes IS NULL AND g.retired_at IS NULL AND p.expires_at>now()
          AND g.budget_epoch=xera_current_quota_epoch(g.kind,g.key,g.user_id,g.window_start)
          AND EXISTS(SELECT 1 FROM users u WHERE u.id=g.user_id AND u.traffic_limit_bytes>0)
    `.execute(db.kysely);
    const reserves: Record<string, unknown> = {};
    const deliveries: typeof grants.rows = [];
    for (const grant of grants.rows) {
        if (!users.has(grant.owner)) continue;
        if (grant.instance !== mode.instance || Object.hasOwn(reserves, grant.owner))
            throw new Error('Global quota grant requires node identity recovery');
        reserves[grant.owner] = {
            id: grant.id,
            instance: grant.instance,
            ceiling: grant.ceiling,
            expiresAt: grant.expiresAt.getTime(),
        };
        deliveries.push(grant);
    }
    body.groups[GROUP] = {
        multiplierScale: SCALE,
        reserveRequired: true,
        bytesPerSecond: 0,
        totalBytesPerSecond: 0,
        blockAll: false,
        blockedOwners: blocked,
        unlimitedOwners: unlimited,
        reserves,
        ...(mode.phase === 'FENCING' ? { fenceAll: true } : {}),
    };
    const hosts = new Map(state.hosts.map((host) => [host.uuid.replaceAll('-', ''), host]));
    for (const [key, wire] of Object.entries(body.hosts)) {
        const host = hosts.get(key);
        if (!host) throw new Error('Global quota host metadata is missing');
        if (host.alwaysAvailable || host.onlyWhenInactive) {
            wire.userQuotaExempt = true;
        } else {
            if (!wire.groups.includes(GROUP)) wire.groups.push(GROUP);
            wire.quotaMultipliers = { ...wire.quotaMultipliers, [GROUP]: factor };
        }
    }
    for (let offset = 0; offset < deliveries.length; offset += 500) {
        const values = deliveries
            .slice(offset, offset + 500)
            .map(
                (g) =>
                    sql`('USER','global',${g.owner}::bigint,${g.window}::date,${node}::uuid,${g.instance}::uuid,${g.epoch}::uuid,${revision}::bigint)`,
            );
        await sql`INSERT INTO xera_quota_node_epochs(kind,key,user_id,window_start,node_uuid,instance_uuid,desired_epoch,desired_revision)
            VALUES ${sql.join(values)} ON CONFLICT(kind,key,user_id,window_start,node_uuid) DO UPDATE SET
            instance_uuid=excluded.instance_uuid,desired_epoch=excluded.desired_epoch,desired_revision=excluded.desired_revision,updated_at=now()
            WHERE xera_quota_node_epochs.desired_revision<excluded.desired_revision`.execute(
            db.kysely,
        );
    }
}
