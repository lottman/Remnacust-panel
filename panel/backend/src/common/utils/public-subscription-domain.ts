import { publicGeofileOrigin } from './public-geofile-origin';

export function configuredSubscriptionDomain(
    value: unknown,
): { domain: string; path: string } | undefined {
    if (typeof value !== 'string') return;
    const input = value.trim();
    if (
        !input ||
        input.startsWith('/') ||
        input.length > 512 ||
        /[\s\\%?#\x00-\x1f\x7f]/.test(input) ||
        input.includes('..')
    )
        return;
    try {
        const url = new URL(input.includes('://') ? input : `https://${input}`);
        if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            url.port ||
            !publicGeofileOrigin(url.host)
        )
            return;
        const path = url.pathname.replace(/\/$/, '');
        if (path.length > 240 || (path && !/^\/[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*$/i.test(path)))
            return;
        return { domain: url.hostname, path };
    } catch {
        return;
    }
}
