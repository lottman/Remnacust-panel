import crypto from 'node:crypto';

const PREFIX = 'xera1:';

let cachedKey: Buffer | null = null;

function key(): Buffer {
    if (!cachedKey) {
        const secret = process.env.APP_SECRET;
        if (!secret) {
            throw new Error('APP_SECRET is required for XERA key encryption');
        }
        cachedKey = crypto.createHmac('sha256', secret).update('xera-keyring-v1').digest();
    }
    return cachedKey;
}

export function isXeraEnvelope(value: unknown): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptSecret(value: string): string {
    if (isXeraEnvelope(value) || value.length === 0) {
        return value;
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(value: string): string {
    if (!isXeraEnvelope(value)) {
        return value;
    }
    try {
        const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
        const iv = raw.subarray(0, 12);
        const tag = raw.subarray(12, 28);
        const encrypted = raw.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
        throw new Error('Cannot decrypt stored credentials. Restore the original APP_SECRET.');
    }
}
