import type { IncomingHttpHeaders } from 'node:http';

import { publicGeofileOrigin } from './public-geofile-origin';

export const GEOFILE_ORIGIN_HEADER = 'x-remnacust-geofile-origin';
export const SUBSCRIPTION_DOMAIN_HEADER = 'x-remnacust-subscription-domain';

export async function relayGeofileOrigin(
    headers: IncomingHttpHeaders,
    verify: (token: string) => Promise<Record<string, unknown>>,
    lookup: (uuid: string) => Promise<{ expireAt: Date | null; scopes: string[] } | undefined>,
): Promise<string | undefined> {
    return (await relayGeofileContext(headers, verify, lookup))?.origin;
}

export async function relayGeofileContext(
    headers: IncomingHttpHeaders,
    verify: (token: string) => Promise<Record<string, unknown>>,
    lookup: (uuid: string) => Promise<{ expireAt: Date | null; scopes: string[] } | undefined>,
): Promise<{ origin?: string; domainUuid?: string } | undefined> {
    const value = headers[GEOFILE_ORIGIN_HEADER];
    const domainUuid = headers[SUBSCRIPTION_DOMAIN_HEADER];
    const auth = headers.authorization;
    if (
        (value === undefined && domainUuid === undefined) ||
        typeof auth !== 'string' ||
        auth.length > 16384 ||
        !auth.startsWith('Bearer ')
    )
        return;
    const origin =
        typeof value === 'string' && value.startsWith('https://')
            ? publicGeofileOrigin(value.slice(8))
            : undefined;
    if (value !== undefined && (!origin || origin !== value)) return;
    if (
        domainUuid !== undefined &&
        (typeof domainUuid !== 'string' ||
            !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(domainUuid))
    )
        return;
    try {
        const payload = await verify(auth.slice(7));
        if (
            payload.role !== 'API' ||
            typeof payload.uuid !== 'string' ||
            !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(payload.uuid) ||
            !(
                Number.isSafeInteger(payload.exp) ||
                (payload.permanent === true && payload.exp === undefined)
            )
        )
            return;
        if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return;
        const token = await lookup(payload.uuid);
        if (
            !token ||
            (token.expireAt !== null &&
                (!(token.expireAt instanceof Date) ||
                    !Number.isFinite(token.expireAt.getTime()) ||
                    token.expireAt <= new Date())) ||
            (payload.permanent === true && token.expireAt !== null) ||
            !Array.isArray(token.scopes) ||
            !token.scopes.some((scope) => scope === '*' || scope === 'subscriptions:subpage-config')
        )
            return;
        return { origin, domainUuid: domainUuid as string | undefined };
    } catch {
        return;
    }
}
