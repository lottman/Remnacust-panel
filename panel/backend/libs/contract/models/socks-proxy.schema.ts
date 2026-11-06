import { z } from 'zod';

function hasControlCharacters(value: string): boolean {
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code < 32 || code === 127) return true;
    }
    return false;
}

export function parseSocksProxyUrl(value: string): URL | null {
    try {
        if (value.length > 2048 || !value.startsWith('socks5://') || /\s/.test(value) || hasControlCharacters(value)) return null;
        const parsed = new URL(value);
        if (parsed.protocol !== 'socks5:' || parsed.pathname || parsed.search || parsed.hash)
            return null;
        if (!/^\d+$/.test(parsed.port) || +parsed.port < 1 || +parsed.port > 65535)
            return null;
        const host = parsed.hostname;
        if (host.startsWith('[')) {
            if (!z.ipv6().safeParse(host.slice(1, -1)).success) return null;
        } else if (
            host.length > 253 ||
            !host.replace(/\.$/, '').split('.').every((label) =>
                /^[a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?$/.test(label),
            )
        ) return null;
        for (const encoded of [parsed.username, parsed.password]) {
            const decoded = decodeURIComponent(encoded);
            if (hasControlCharacters(decoded) || new TextEncoder().encode(decoded).length > 255)
                return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export const SocksProxyUrlSchema = z.string().max(2048).refine((value) => parseSocksProxyUrl(value) !== null, {
    message: 'Expected socks5://[user:pass@]host:port with port 1-65535',
});
