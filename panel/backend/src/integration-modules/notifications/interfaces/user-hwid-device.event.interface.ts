import { TUserHwidDevicesEvents } from '@libs/contracts/constants';

import { HwidUserDeviceEntity } from '@modules/hwid-user-devices/entities/hwid-user-device.entity';
import { UserEntity } from '@modules/users/entities';

/**
 * HWID events are emitted only when HWID Device Limit feature is enabled in .env.
 * Event payload contains user and HWID device entities.
 * Note: Telegram notifications are skipped for this event.
 * Note: For performance reasons, user entity's activeInternalSquads and lastConnectedNode fields are always empty.
 * Returns: user and HWID device entities.
 */
export class UserHwidDeviceEvent {
    data: {
        user: UserEntity;
        hwidUserDevice: HwidUserDeviceEntity;
    };
    eventName: TUserHwidDevicesEvents;
    constructor(
        user: UserEntity,
        hwidUserDevice: HwidUserDeviceEntity,
        event: TUserHwidDevicesEvents,
    ) {
        this.data = { user, hwidUserDevice };
        this.eventName = event;
    }
}
