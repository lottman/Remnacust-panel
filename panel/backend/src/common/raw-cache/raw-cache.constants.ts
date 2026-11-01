export const RAW_CACHE_KEY_PREFIX = 'ioraw:';

export function keepRedisKeyOnStartup(key: string): boolean {
    return (
        key.startsWith('bull:xera-core-management:') ||
        key.startsWith(`${RAW_CACHE_KEY_PREFIX}auth:active-session:`) ||
        /^ioraw:remnacust:routing-profile:v1:[a-f0-9]{64}$/.test(key)
    );
}
