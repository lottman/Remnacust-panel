import { sql } from 'kysely';

import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { AxiosService, INodeConnectionOpts } from '@common/axios';
import { TypedConfigService } from '@common/config/app-config';
import { TxKyselyService } from '@common/database';
import { deviceCredentials, usageOwner } from '@common/utils/device-identity';
import { decryptSecret } from '@common/utils/xera-crypto';

import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';
import { GetUsersWithResolvedInboundsQuery } from '@modules/users/queries/get-users-with-resolved-inbounds';

import { PortPlanLeaseService } from './port-plan-lease.service';

export interface UserDeliveryEntry {
    username: string;
    hashUuid: string;
    tags?: string[];
}

type UserState = {
    id: bigint;
    status: string;
    expiry: Date;
    updated: Date;
    key: string;
};
type DeviceState = { userId: bigint; hwid: string; blocked: boolean; updated: Date };
type Snapshot = { users: UserState[]; devices: DeviceState[] };

@Injectable()
export class UserAccessDeliveryService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly queries: QueryBus,
        private readonly config: TypedConfigService,
        private readonly leases: PortPlanLeaseService,
        private readonly axios: AxiosService,
    ) {}

    private async snapshot(ids: bigint[]): Promise<Snapshot> {
        const users =
            await sql<UserState>`SELECT id,status,expire_at AS expiry,updated_at AS updated,vless_uuid AS key
            FROM users WHERE id IN (${sql.join(ids)}) ORDER BY id`.execute(this.db.kysely);
        const devices =
            process.env.XERA_PERSONAL_SUBSCRIPTIONS === 'true'
                ? await sql<DeviceState>`SELECT user_id AS "userId",hwid,blocked,updated_at AS updated
                FROM hwid_user_devices WHERE user_id IN (${sql.join(ids)}) ORDER BY user_id,hwid`.execute(
                      this.db.kysely,
                  )
                : { rows: [] };
        return { users: users.rows, devices: devices.rows };
    }

    private async pending(ids: bigint[]): Promise<void> {
        if (!ids.length) return;
        await sql`INSERT INTO xera_user_access_reconciliation(user_id,base_pending)
            SELECT id,true FROM users WHERE id IN (${sql.join(ids)})
            ON CONFLICT(user_id) DO UPDATE SET revision=gen_random_uuid(),attempts=0,
                next_attempt_at=now(),base_pending=true`.execute(this.db.kysely);
    }

    async deliver(
        node: INodeConnectionOpts,
        entries: UserDeliveryEntry[],
        adding: boolean,
        send: (accepted: Set<string>) => Promise<unknown>,
        lastAttempt = true,
    ): Promise<unknown> {
        if (!node.uuid) throw new Error('Node identity is required');
        const nodeUuid = node.uuid;
        const ids = [
            ...new Set(
                entries
                    .map((entry) => usageOwner(entry.username))
                    .filter((id): id is string => id !== null),
            ),
        ].map(BigInt);
        if (
            !ids.length ||
            ids.length > 10000 ||
            entries.length > 10000 ||
            ids.some((id) => id <= 0n || id > 9223372036854775807n)
        )
            throw new Error('Invalid user delivery batch');
        try {
            return await this.leases.withLifecycle(nodeUuid, async (assert) => {
                const before = await this.snapshot(ids);
                const currentNode = await this.queries.execute(new GetNodeByUuidQuery(nodeUuid));
                if (!currentNode.isOk) throw new Error('Current node is unavailable');
                const target = currentNode.response;
                if (target.isDisabled || !target.activeConfigProfileUuid)
                    return { isOk: true, response: { success: true } };
                if (
                    target.address !== node.address ||
                    target.port !== node.port ||
                    target.proxyUrl !== node.proxyUrl
                )
                    throw new Error('Node endpoint changed');
                const nodeInbounds = new Set(target.activeInbounds.map((inbound) => inbound.uuid));
                const allowedTags = new Map<string, Set<string>>();
                if (before.users.length) {
                    const resolved = await this.queries.execute(
                        new GetUsersWithResolvedInboundsQuery(before.users.map((user) => user.id)),
                    );
                    if (!resolved.isOk) throw new Error('Current user access is unavailable');
                    for (const user of resolved.response)
                        allowedTags.set(
                            String(user.id),
                            new Set(
                                user.inbounds
                                    .filter((inbound) => nodeInbounds.has(inbound.uuid))
                                    .map((inbound) => inbound.tag),
                            ),
                        );
                }
                const users = new Map(before.users.map((user) => [String(user.id), user]));
                const identities = new Map<string, { key: string; blocked: boolean }>();
                for (const user of before.users)
                    identities.set(String(user.id), {
                        key: decryptSecret(user.key),
                        blocked: false,
                    });
                for (const device of before.devices) {
                    const parent = identities.get(String(device.userId));
                    if (!parent) continue;
                    if (device.blocked) parent.blocked = true;
                    const identity = deviceCredentials(
                        this.config.getOrThrow('APP_SECRET'),
                        device.userId,
                        device.hwid,
                        parent.key,
                    );
                    identities.set(identity.username, {
                        key: identity.vlessUuid,
                        blocked: device.blocked,
                    });
                }
                const accepted = new Set<string>();
                const stale = new Set<bigint>();
                for (const entry of entries) {
                    const owner = usageOwner(entry.username);
                    if (!owner) throw new Error('Invalid user delivery identity');
                    const user = users.get(owner);
                    const identity = identities.get(entry.username);
                    const current = !!identity && identity.key === entry.hashUuid;
                    const blocked = identity?.blocked ?? false;
                    const tags = allowedTags.get(owner);
                    const allowed = current && !blocked && !!tags?.size;
                    const valid = adding
                        ? allowed &&
                          entry.tags?.length === tags?.size &&
                          entry.tags.every((tag) => tags!.has(tag))
                        : !allowed;
                    if (valid) accepted.add(entry.username);
                    else if (user) stale.add(user.id);
                }
                if (stale.size) await this.pending([...stale]);
                if (adding) {
                    const absent = entries.filter(
                        (entry) => !users.has(usageOwner(entry.username) ?? ''),
                    );
                    if (absent.length) {
                        await assert();
                        const removed = await this.axios.deleteUsers(
                            {
                                users: absent.map((entry) => ({
                                    userId: entry.username,
                                    hashUuid: entry.hashUuid,
                                })),
                            },
                            node,
                        );
                        if (!removed.isOk || removed.response?.success !== true)
                            throw new Error('Deleted user access revocation is pending');
                        await assert();
                    }
                }
                if (!accepted.size) return { isOk: true, response: { success: true } };
                await assert();
                const result = await send(accepted);
                if (
                    !result ||
                    typeof result !== 'object' ||
                    !('isOk' in result) ||
                    !result.isOk ||
                    !('response' in result) ||
                    !result.response ||
                    typeof result.response !== 'object' ||
                    !('success' in result.response) ||
                    result.response.success !== true
                )
                    throw new Error('Node did not confirm user access delivery');
                await assert();
                const after = await this.snapshot(ids);
                if (
                    JSON.stringify(before, (_, value) =>
                        typeof value === 'bigint' ? value.toString() : value,
                    ) !==
                    JSON.stringify(after, (_, value) =>
                        typeof value === 'bigint' ? value.toString() : value,
                    )
                ) {
                    await this.pending(ids);
                    if (adding) {
                        const afterIds = new Set(after.users.map((user) => String(user.id)));
                        const deleted = entries.filter(
                            (entry) =>
                                accepted.has(entry.username) &&
                                !afterIds.has(usageOwner(entry.username) ?? ''),
                        );
                        if (deleted.length) {
                            const removed = await this.axios.deleteUsers(
                                {
                                    users: deleted.map((entry) => ({
                                        userId: entry.username,
                                        hashUuid: entry.hashUuid,
                                    })),
                                },
                                node,
                            );
                            if (!removed.isOk || removed.response?.success !== true)
                                throw new Error('Deleted user access revocation is pending');
                        }
                    }
                }
                return result;
            });
        } catch {
            if (lastAttempt) await this.pending(ids);
            throw new Error('User access delivery is pending');
        }
    }
}
