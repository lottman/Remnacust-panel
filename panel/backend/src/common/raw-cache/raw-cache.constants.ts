export const RAW_CACHE_KEY_PREFIX = 'ioraw:';

export function keepRedisKeyOnStartup(key: string): boolean {
    return key.startsWith('bull:xera-core-management:') ||
        key.startsWith(`${RAW_CACHE_KEY_PREFIX}auth:active-session:`);
}
