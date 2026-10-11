import { createHmac, timingSafeEqual } from 'node:crypto';

export function nodeReconciliationToken(secret: string, uuid: string): string {
    return createHmac('sha256', secret)
        .update(`remnacust-node-reconciliation-v1\0${uuid}`)
        .digest('base64url');
}

export function verifyNodeReconciliationToken(
    secret: string,
    uuid: string,
    token: unknown,
): boolean {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const expected = Buffer.from(nodeReconciliationToken(secret, uuid));
    return timingSafeEqual(expected, Buffer.from(token));
}

export function nodeReconciliationEnrollment(
    uuid: string,
    revision = '0',
): { url: string; token: string; revision: string } | undefined {
    const domain = process.env.PANEL_DOMAIN || process.env.FRONT_END_DOMAIN;
    const secret = process.env.APP_SECRET;
    if (!domain || !secret) return undefined;
    try {
        const origin = new URL(domain.includes('://') ? domain : `https://${domain}`);
        if (
            origin.protocol !== 'https:' ||
            origin.username ||
            origin.password ||
            origin.search ||
            origin.hash ||
            origin.pathname !== '/'
        )
            return undefined;
        return {
            url: new URL(`/api/nodes/${uuid}/reconcile`, origin).href,
            token: nodeReconciliationToken(secret, uuid),
            revision,
        };
    } catch {
        return undefined;
    }
}
