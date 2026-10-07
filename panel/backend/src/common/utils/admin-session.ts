import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

type AdminIdentity = { uuid: string; username: string; passwordHash: string };
type SessionClaims = {
    uuid?: string | null;
    username?: string | null;
    jti?: string;
    exp?: number;
    authVersion?: string;
};

function credentialVersion(admin: AdminIdentity, secret: string): string {
    return createHmac('sha256', secret)
        .update(JSON.stringify(['admin-session-v1', admin.uuid, admin.username, admin.passwordHash]))
        .digest('hex');
}

export function createAdminSessionClaims(admin: AdminIdentity, secret: string) {
    return { jti: randomUUID(), authVersion: credentialVersion(admin, secret) };
}

export const adminSessionKey = (jti: string): string => `auth:active-session:${jti}`;

export async function isAdminSessionCurrent(
    payload: SessionClaims,
    admin: AdminIdentity,
    secret: string,
    isActive: (key: string) => Promise<boolean>,
): Promise<boolean> {
    if (
        payload.uuid !== admin.uuid || payload.username !== admin.username ||
        typeof payload.jti !== 'string' || !/^[\da-f-]{36}$/i.test(payload.jti) ||
        !Number.isSafeInteger(payload.exp) || payload.exp! <= Math.floor(Date.now() / 1000) ||
        typeof payload.authVersion !== 'string' || !/^[\da-f]{64}$/.test(payload.authVersion)
    ) return false;

    const current = credentialVersion(admin, secret);
    if (!timingSafeEqual(Buffer.from(current, 'hex'), Buffer.from(payload.authVersion, 'hex'))) {
        return false;
    }
    // No local cache: logout on one API process must revoke access on every process.
    return isActive(adminSessionKey(payload.jti));
}
