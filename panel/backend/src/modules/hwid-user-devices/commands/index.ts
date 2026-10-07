import { CreateHwidUserDeviceHandler } from './create-hwid-user-device';
import { CreateWithAdvisoryLockHandler } from './create-with-advisory-lock';
import { UpsertHwidUserDeviceHandler } from './upsert-hwid-user-device';

export const COMMANDS = [
    CreateHwidUserDeviceHandler,
    UpsertHwidUserDeviceHandler,
    CreateWithAdvisoryLockHandler,
];
