import { createHmac, timingSafeEqual } from 'node:crypto';

/** Keep this format stable: Xray usernames are also the keys in usage statistics. */
const DEVICE_USER_RE = /^(\d+)~([a-f0-9]{24})(?:~h[a-f0-9]{32})?$/;

function mac(secret: string, purpose: string, userId: bigint, hwid: string): Buffer {
    return createHmac('sha256', secret)
        .update(`xera-device-v1\0${purpose}\0${userId}\0${hwid}`)
        .digest();
}

export function deviceUsername(secret: string, userId: bigint, hwid: string): string {
    return `${userId}~${mac(secret, 'username', userId, hwid).toString('hex').slice(0, 24)}`;
}

export function usageOwner(username: string): string | null {
    if (/^\d+$/.test(username)) return username;
    return DEVICE_USER_RE.exec(username)?.[1] ?? null;
}

export function deviceCredentials(secret: string, userId: bigint, hwid: string, parentVlessUuid: string) {
    // Rotation of the parent's Xray key revokes every previously issued device key.
    const scope = parentVlessUuid.toLowerCase();
    const uuidBytes = mac(secret, `vless:${scope}`, userId, hwid).subarray(0, 16);
    uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x40;
    uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
    const hex = uuidBytes.toString('hex');
    return {
        username: deviceUsername(secret, userId, hwid),
        xrayUsername: deviceUsername(secret, userId, hwid),
        vlessUuid: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
        trojanPassword: mac(secret, `trojan:${scope}`, userId, hwid).toString('base64url').slice(0, 32),
        ssPassword: mac(secret, `shadowsocks:${scope}`, userId, hwid).toString('base64url').slice(0, 32),
    };
}

/** Bearer link tokens are scoped to the parent subscription and device. */
export function deviceLinkToken(secret: string, shortUuid: string, userId: bigint, hwid: string): string {
    const encodedHwid = Buffer.from(hwid).toString('base64url');
    const signature = createHmac('sha256', secret)
        .update(`xera-device-link-v1\0${shortUuid}\0${userId}\0${hwid}`)
        .digest('base64url');
    return `${encodedHwid}.${signature}`;
}

export function verifyDeviceLinkToken(secret: string, shortUuid: string, userId: bigint, token: string): string | null {
    const [encodedHwid, signature, extra] = token.split('.');
    if (extra || !encodedHwid || !signature || !/^[A-Za-z0-9_-]+$/.test(encodedHwid)) return null;
    const hwid = Buffer.from(encodedHwid, 'base64url').toString('utf8');
    if (!/^[a-zA-Z0-9=-]{10,64}$/.test(hwid) || Buffer.from(hwid).toString('base64url') !== encodedHwid) return null;
    const expected = deviceLinkToken(secret, shortUuid, userId, hwid).split('.')[1];
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right) ? hwid : null;
}
