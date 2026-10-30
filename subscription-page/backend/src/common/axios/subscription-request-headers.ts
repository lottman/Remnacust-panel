import type { IncomingHttpHeaders } from 'node:http';

// Client metadata belongs to the public subscription request. Gateway
// credentials and hop-by-hop headers belong to the configured upstream.
const EXCLUDED = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'host',
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'content-length',
    'content-encoding',
    'accept-encoding',
    'x-api-key',
    'cf-access-client-id',
    'cf-access-client-secret',
    'forwarded',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-port',
    'x-forwarded-proto',
    'x-forwarded-scheme',
    'x-real-ip',
    'x-remnawave-real-ip',
    'x-subpage-version',
]);

export function subscriptionRequestHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
    const connection = headers.connection;
    const named = new Set(
        (typeof connection === 'string' ? connection : '')
            .split(',')
            .map((name) => name.trim().toLowerCase()),
    );
    return Object.fromEntries(
        Object.entries(headers).filter(
            ([name]) => !EXCLUDED.has(name.toLowerCase()) && !named.has(name.toLowerCase()),
        ),
    );
}
