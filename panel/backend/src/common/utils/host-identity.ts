import { createHmac } from 'node:crypto';

// The authenticated Xray identity, never the client-supplied destination/SNI,
// selects a host policy. Preserve owner and host when collecting statistics.
const IDENTITY = /^([1-9][0-9]*)~([a-f0-9]{24})~h([a-f0-9]{32})$/;

export function parseHostIdentity(value: string): { userId: string; hostUuid: string } | null {
    const match = IDENTITY.exec(value);
    if (!match) return null;
    const h = match[3];
    return {
        userId: match[1],
        hostUuid: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`,
    };
}

export function hostCredentials(
    secret: string,
    userId: bigint,
    hostUuid: string,
    hwid: string | null,
    parentVlessUuid: string,
) {
    if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(hostUuid) ||
        userId <= 0n
    )
        throw new Error('Invalid host credential scope');
    const host = hostUuid.toLowerCase();
    const mac = (purpose: string) =>
        createHmac('sha256', secret)
            .update(
                JSON.stringify([
                    'xera-host-identity-v1',
                    purpose,
                    userId.toString(),
                    host,
                    hwid,
                    parentVlessUuid.toLowerCase(),
                ]),
            )
            .digest();
    const bytes = mac('vless').subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = bytes.toString('hex');
    return {
        username: `${userId}~${mac('email').toString('hex').slice(0, 24)}~h${host.replaceAll('-', '')}`,
        xrayUsername: `${userId}~${mac('email').toString('hex').slice(0, 24)}~h${host.replaceAll('-', '')}`,
        vlessUuid: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
        trojanPassword: mac('trojan').toString('base64url').slice(0, 32),
        ssPassword: mac('shadowsocks').toString('base64url').slice(0, 32),
    };
}
