import { TResetPeriods, TUsersStatus } from '@contract/constants';

import { decryptSecret } from '@common/utils/xera-crypto';
import { Users } from '@prisma/client';

export class BaseUserEntity implements Users {
    public id: bigint;
    public shortUuid: string;
    public username: string;
    public status: TUsersStatus;

    public trafficLimitBytes: bigint;
    public trafficLimitStrategy: TResetPeriods;

    public expireAt: Date;
    public subRevokedAt: Date | null;
    public lastTrafficResetAt: Date | null;
    public lastTriggeredThreshold: number;

    public trojanPassword: string;
    public vlessUuid: string;
    public ssPassword: string;

    public description: null | string;
    public tag: string | null;
    public telegramId: bigint | null;
    public email: string | null;

    public hwidDeviceLimit: number | null;

    public externalSquadUuid: string | null;

    public createdAt: Date;
    public updatedAt: Date;

    constructor(user: Partial<Users>) {
        if (typeof user.vlessUuid === 'string') {
            user.vlessUuid = decryptSecret(user.vlessUuid);
        }
        if (typeof user.trojanPassword === 'string') {
            user.trojanPassword = decryptSecret(user.trojanPassword);
        }
        if (typeof user.ssPassword === 'string') {
            user.ssPassword = decryptSecret(user.ssPassword);
        }

        Object.assign(this, user);
    }
}
