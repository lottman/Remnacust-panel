import { CheckHwidExistsHandler } from './check-hwid-exists/check-hwid-exists.handler';
import { CountDevicesByRangeHandler } from './count-devices-by-range/count-devices-by-range.handler';
import { CountUsersDevicesHandler } from './count-users-devices/count-users-devices.handler';
import { GetUserDevicesHandler } from './get-user-devices.query';

export const QUERIES = [CountUsersDevicesHandler, CheckHwidExistsHandler, CountDevicesByRangeHandler, GetUserDevicesHandler];
