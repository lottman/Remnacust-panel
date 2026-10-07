import type { UserForConfigEntity } from '@modules/users/entities/users-for-config';

type Device = { userId: bigint; hwid: string; blocked: boolean };
type Credentials = {
    username: string;
    vlessUuid: string;
    trojanPassword: string;
    ssPassword: string;
};

/** Build the exact identities Xray will accept after a full node reload. */
export function expandDeviceUsers(
    users: UserForConfigEntity[],
    records: Device[],
    credentials: (userId: bigint, hwid: string, parentVlessUuid: string) => Credentials,
): UserForConfigEntity[] {
    const byUser = new Map<bigint, Device[]>();
    for (const record of records) {
        const current = byUser.get(record.userId) ?? [];
        current.push(record);
        byUser.set(record.userId, current);
    }

    const identities: UserForConfigEntity[] = [];
    for (const user of users) {
        const userId = BigInt(user.id);
        const devices = byUser.get(userId) ?? [];
        if (!devices.some((device) => device.blocked)) identities.push(user);
        for (const device of devices) {
            if (device.blocked) continue;
            const keys = credentials(userId, device.hwid, user.vlessUuid);
            identities.push({
                ...user,
                id: keys.username,
                vlessUuid: keys.vlessUuid,
                trojanPassword: keys.trojanPassword,
                ssPassword: keys.ssPassword,
            });
        }
    }
    return identities;
}
