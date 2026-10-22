import { Address4, Address6 } from 'ip-address';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

export const MAX_GEOFILE_BYTES = 64 * 1024 * 1024;
const blocked4 = [
    '0.0.0.0/8',
    '10.0.0.0/8',
    '100.64.0.0/10',
    '127.0.0.0/8',
    '169.254.0.0/16',
    '172.16.0.0/12',
    '192.0.0.0/24',
    '192.0.2.0/24',
    '192.88.99.0/24',
    '192.168.0.0/16',
    '198.18.0.0/15',
    '198.51.100.0/24',
    '203.0.113.0/24',
    '224.0.0.0/4',
    '240.0.0.0/4',
].map((value) => new Address4(value));
const global6 = new Address6('2000::/3');
const blocked6 = ['2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20'].map(
    (value) => new Address6(value),
);

export function isPublicGeofileAddress(address: string): boolean {
    if (isIP(address) === 4) {
        const ip = new Address4(address);
        return !blocked4.some((range) => ip.isInSubnet(range));
    }
    if (isIP(address) === 6) {
        const ip = new Address6(address);
        return ip.isInSubnet(global6) && !blocked6.some((range) => ip.isInSubnet(range));
    }
    return false;
}

export function geofileUrl(value: string): URL {
    if (typeof value !== 'string' || value.length > 2048) throw new Error('geofile-url');
    const url = new URL(value);
    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hash ||
        (url.port && url.port !== '443')
    )
        throw new Error('geofile-url');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (
        !host ||
        host.endsWith('.') ||
        host.includes('%') ||
        (isIP(host) && !isPublicGeofileAddress(host))
    )
        throw new Error('geofile-url');
    return url;
}

/** No ambient proxy, cookies, credentials, automatic redirects or second DNS lookup. */
export async function downloadGeofile(value: string): Promise<Buffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const aborted = new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(new Error('geofile-timeout')), {
            once: true,
        }),
    );
    try {
        let url = geofileUrl(value);
        for (let hop = 0; hop <= 3; hop++) {
            const hostname = url.hostname.replace(/^\[|\]$/g, '');
            const addresses = await Promise.race([
                lookup(hostname, { all: true, verbatim: true }),
                aborted,
            ]);
            if (
                !addresses.length ||
                addresses.some((item) => !isPublicGeofileAddress(item.address))
            )
                throw new Error('geofile-private-address');
            if (controller.signal.aborted) throw new Error('geofile-timeout');
            const chosen = addresses[0];
            const result = await new Promise<Buffer | URL>((resolve, reject) => {
                const req = request(
                    url,
                    {
                        agent: false,
                        family: chosen.family,
                        lookup: (_host, _options, callback) =>
                            callback(null, chosen.address, chosen.family),
                        signal: controller.signal,
                        timeout: 10_000,
                        maxHeaderSize: 16 * 1024,
                        headers: {
                            Accept: 'application/octet-stream',
                            'Accept-Encoding': 'identity',
                            'User-Agent': 'Remnacust-Geofiles',
                        },
                    },
                    (response) => {
                        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
                            const location = response.headers.location;
                            response.destroy();
                            try {
                                if (!location || hop === 3)
                                    throw new Error('geofile-redirect-limit');
                                resolve(geofileUrl(new URL(location, url).href));
                            } catch (error) {
                                reject(error);
                            }
                            return;
                        }
                        if (
                            response.statusCode !== 200 ||
                            (response.headers['content-encoding'] &&
                                response.headers['content-encoding'] !== 'identity') ||
                            Number(response.headers['content-length'] ?? 0) > MAX_GEOFILE_BYTES
                        ) {
                            response.destroy();
                            reject(new Error('geofile-response'));
                            return;
                        }
                        let length = 0;
                        const chunks: Buffer[] = [];
                        response.on('data', (chunk: Buffer) => {
                            length += chunk.length;
                            if (length > MAX_GEOFILE_BYTES) {
                                response.destroy(new Error('geofile-size'));
                                return;
                            }
                            chunks.push(chunk);
                        });
                        response.once('error', reject);
                        response.once('end', () => resolve(Buffer.concat(chunks, length)));
                    },
                );
                req.once('timeout', () => req.destroy(new Error('geofile-timeout')));
                req.once('error', reject);
                req.end();
            });
            if (Buffer.isBuffer(result)) return result;
            url = result;
        }
        throw new Error('geofile-redirect-limit');
    } finally {
        clearTimeout(timer);
    }
}
