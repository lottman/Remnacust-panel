import { isIP } from 'node:net';

import { PortNetwork, PortPlanError } from './profile-port-plan';

export function nodeManagementReservation(address: string, port: number | null) {
    const authority = isIP(address) === 6 ? '[' + address + ']' : address;
    const legacy = (process.env.REMNACUST_LEGACY_HTTP_NODES ?? '')
        .split(',')
        .some((value) => value.trim() === authority);
    return [{ listenAddress: '::', port: port ?? (legacy ? 80 : 443), networks: ['tcp' as const] }];
}

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json =>
    !!value && typeof value === 'object' && !Array.isArray(value);

// Matches the native proxy Network(), StreamConfig.Build and transport listener
// selection. These are physical bound sockets, not the payload's TCP/UDP mode.
export function portListenerNetworks(inbound: Json): PortNetwork[] {
    const protocol = inbound.protocol;
    if (['tun', 'wireguard'].includes(String(protocol)))
        throw new PortPlanError('PROFILE_FEATURE_NEEDS_ISOLATION');
    const stream = object(inbound.streamSettings) ? inbound.streamSettings : {};
    const settings = object(inbound.settings) ? inbound.settings : {};
    const transport = String(stream.method ?? stream.network ?? 'tcp').toLowerCase();
    let proxy: PortNetwork[] = ['tcp'];
    if (protocol === 'shadowsocks' || protocol === 'dokodemo-door' || protocol === 'tunnel') {
        const raw =
            settings.network ?? (protocol === 'shadowsocks' ? undefined : settings.allowedNetwork);
        const list =
            raw === undefined || raw === null
                ? ['tcp']
                : typeof raw === 'string'
                  ? raw.split(',')
                  : raw;
        if (
            !Array.isArray(list) ||
            !list.length ||
            list.some(
                (value) =>
                    typeof value !== 'string' || !['tcp', 'udp'].includes(value.toLowerCase()),
            )
        )
            throw new PortPlanError('INVALID_PROFILE');
        proxy = [...new Set(list.map((value) => value.toLowerCase()))] as PortNetwork[];
    } else if (
        !['vless', 'trojan', 'hysteria', 'masque', 'http', 'mixed', 'socks', 'vmess'].includes(
            String(protocol),
        )
    ) {
        throw new PortPlanError('INVALID_PROFILE');
    }
    const sockets = new Set<PortNetwork>();
    if (proxy.includes('udp')) sockets.add('udp');
    if (proxy.includes('tcp')) {
        if (['kcp', 'mkcp', 'hysteria'].includes(transport)) sockets.add('udp');
        else if (['xhttp', 'splithttp', 'xera', 'xera-http', 'masque'].includes(transport)) {
            const tls = object(stream.tlsSettings) ? stream.tlsSettings : {};
            const alpn = stream.security === 'tls' && Array.isArray(tls.alpn) ? tls.alpn : [];
            if (alpn.some((value) => typeof value !== 'string'))
                throw new PortPlanError('INVALID_PROFILE');
            if (transport === 'masque') {
                const h2 = alpn.includes('h2');
                if (h2) sockets.add('tcp');
                if (!h2 || alpn.includes('h3')) sockets.add('udp');
            } else sockets.add(alpn.length === 1 && alpn[0] === 'h3' ? 'udp' : 'tcp');
        } else if (['tcp', 'raw', 'ws', 'websocket', 'httpupgrade', 'grpc'].includes(transport))
            sockets.add('tcp');
        // XDRIVE has no bound port; it must be represented by a separate
        // virtual transport assignment rather than a fabricated TCP listener.
        else throw new PortPlanError('PROFILE_FEATURE_NEEDS_ISOLATION');
    }
    return ['tcp', 'udp'].filter((network) => sockets.has(network as PortNetwork)) as PortNetwork[];
}
