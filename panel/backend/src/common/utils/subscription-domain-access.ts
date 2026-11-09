import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { cdnRequestHeaderName } from './cdn-request-header';

export const DomainAccessRequestSchema = z
    .object({
        host: z.string().max(300),
        url: z.string().min(1).max(8192),
        method: z.enum(['GET', 'HEAD']),
        api: z.boolean().optional(),
        uuid: z.uuid().optional(),
        name: z
            .string()
            .regex(/^x-[a-f0-9]{24}$/i)
            .optional(),
        proof: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
    })
    .strict();
export type DomainAccessRequest = z.infer<typeof DomainAccessRequestSchema>;
export type AccessDomain = {
    uuid: string;
    domain: string;
    path: string;
    kind: string;
    parentUuid: string | null;
    isDefault: boolean;
    accessMode?: string;
    redirectDomainUuid?: string | null;
};
export type DomainAccessDecision = {
    action: 'allow' | 'block' | 'redirect';
    location?: string;
    authenticated?: boolean;
    domain?: { uuid: string; publicBaseUrl: string; requestHeaderName?: string };
};
export function cdnRequestProof(uuid: string, secret: string): string {
    return createHmac('sha256', secret)
        .update('cdn-origin-proof-v1:' + uuid)
        .digest('hex');
}
function hasControl(value: string): boolean {
    return [...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127);
}
function safePath(value: string): boolean {
    if (
        !value.startsWith('/') ||
        value.startsWith('//') ||
        /[\\#]/.test(value) ||
        hasControl(value)
    )
        return false;
    const pathname = value.split('?', 1)[0];
    try {
        const decoded = decodeURIComponent(pathname);
        return (
            !/[\\%?#]/.test(decoded) &&
            !hasControl(decoded) &&
            !decoded.startsWith('//') &&
            !decoded.split('/').some((part) => part === '.' || part === '..')
        );
    } catch {
        return false;
    }
}
export function decideDomainAccess(
    rows: AccessDomain[],
    input: DomainAccessRequest,
    secret: string,
): DomainAccessDecision {
    const block: DomainAccessDecision = { action: 'block' };
    if (!safePath(input.url) || (input.api && !/^\/api\/sub\//i.test(input.url))) return block;
    let host: string;
    try {
        if (!input.host || /[\s\\/@?#%]/.test(input.host)) return block;
        const parsed = new URL('https://' + input.host);
        host = parsed.hostname.toLowerCase();
    } catch {
        return block;
    }
    const addressed = rows.find((row) => row.domain === host);
    const selected = input.uuid
        ? rows.find((row) => row.uuid === input.uuid && row.kind === 'CDN')
        : undefined;
    if (input.uuid && !selected) return block;
    if (rows.length && !addressed && !selected && !input.api) return block;
    const primary = selected
        ? rows.find((row) => row.uuid === selected.parentUuid && row.kind === 'PRIMARY')
        : addressed?.kind === 'PRIMARY'
          ? addressed
          : addressed
            ? rows.find((row) => row.uuid === addressed.parentUuid && row.kind === 'PRIMARY')
            : rows.find((row) => row.isDefault && row.kind === 'PRIMARY');
    if (!primary) return input.uuid || input.proof ? block : { action: 'allow' };
    if (
        primary.accessMode === 'BLOCKED' ||
        selected?.accessMode === 'BLOCKED' ||
        addressed?.accessMode === 'BLOCKED'
    )
        return block;
    if (
        selected &&
        addressed &&
        addressed.uuid !== primary.uuid &&
        addressed.uuid !== selected.uuid
    )
        return block;
    const expectedName = selected ? cdnRequestHeaderName(selected.uuid, secret) : undefined;
    if (input.name && input.name.toLowerCase() !== expectedName?.toLowerCase()) return block;
    let authenticated = false;
    if (input.proof) {
        if (!selected || !input.name) return block;
        const expected = Buffer.from(cdnRequestProof(selected.uuid, secret), 'hex');
        const supplied = Buffer.from(input.proof, 'hex');
        authenticated = supplied.length === expected.length && timingSafeEqual(supplied, expected);
        if (!authenticated) return block;
    }
    const context = selected ?? addressed;
    if (authenticated || !primary.accessMode || primary.accessMode === 'OPEN')
        return {
            action: 'allow',
            ...(authenticated ? { authenticated: true } : {}),
            ...(context
                ? {
                      domain: {
                          uuid: context.uuid,
                          publicBaseUrl: `https://${context.domain}${context.path}`,
                          ...(context.kind === 'CDN'
                              ? { requestHeaderName: cdnRequestHeaderName(context.uuid, secret) }
                              : {}),
                      },
                  }
                : {}),
        };
    if (primary.accessMode !== 'REDIRECT' || addressed?.kind === 'CDN' || input.uuid) return block;
    const target = rows.find(
        (row) =>
            row.uuid === primary.redirectDomainUuid &&
            row.kind === 'CDN' &&
            row.parentUuid === primary.uuid,
    );
    if (!target || target.domain === host || target.accessMode === 'BLOCKED') return block;
    const [pathname] = input.url.split('?', 1);
    if (
        !input.api &&
        primary.path &&
        pathname !== primary.path &&
        !pathname.startsWith(primary.path + '/')
    )
        return block;
    const suffix = input.url.slice(input.api ? '/api/sub'.length : primary.path.length);
    const location = `https://${target.domain}${target.path}${suffix.startsWith('/') ? suffix : '/' + suffix}`;
    if (location.length > 9000) return block;
    return { action: 'redirect', location };
}
