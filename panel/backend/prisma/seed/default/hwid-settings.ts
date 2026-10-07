import { THwidSettings } from '@libs/contracts/models';

export const DEFAULT_HWID_SETTINGS: THwidSettings = {
    enabled: true,
    fallbackDeviceLimit: 999,
    maxDevicesAnnounce: null,
};

// Resolve at seed time: importing this module must not capture an unloaded .env.
export function getDefaultHwidSettings(value = process.env.HWID_ENABLED_DEFAULT): THwidSettings {
    if (value !== undefined && value !== '' && value !== 'true' && value !== 'false') {
        throw new Error('HWID_ENABLED_DEFAULT must be "true" or "false".');
    }
    return { ...DEFAULT_HWID_SETTINGS, enabled: value !== 'false' };
}
