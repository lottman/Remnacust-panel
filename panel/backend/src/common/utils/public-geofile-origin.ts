import { isIP } from 'node:net';

// Only the actual HTTP authority is used. Forwarded/Origin/Referer headers
// are not authoritative and must never become an outbound server target.
export function publicGeofileOrigin(host: unknown): string | undefined {
    if (typeof host !== 'string' || host.length > 300 || !host || /[\s\\/@?#%]/.test(host)) return;
    try {
        const url = new URL('https://' + host);
        if (url.username || url.password || url.pathname !== '/' || url.port === '0') return;
        const name = url.hostname;
        if (
            isIP(name.replace(/^\[|\]$/g, '')) ||
            !name.includes('.') ||
            name.endsWith('.') ||
            name.endsWith('.localhost') ||
            name.endsWith('.local') ||
            name.length > 253 ||
            !name.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))
        )
            return;
        return url.origin;
    } catch {
        return;
    }
}
