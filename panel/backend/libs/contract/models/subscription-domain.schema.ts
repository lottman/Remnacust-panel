import { z } from 'zod';

export const SubscriptionDomainInputSchema = z
    .object({
        name: z.string().trim().min(1).max(100),
        domain: z
            .string()
            .trim()
            .min(1)
            .max(253)
            .transform((value, ctx) => {
                try {
                    if (/[\s\\/@?#%:]/.test(value)) throw Error();
                    const url = new URL('https://' + value);
                    const host = url.hostname;
                    if (
                        !host.includes('.') ||
                        host.endsWith('.') ||
                        host.endsWith('.local') ||
                        host.endsWith('.localhost') ||
                        /^[0-9.]+$/.test(host) ||
                        !host
                            .split('.')
                            .every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))
                    )
                        throw Error();
                    return host;
                } catch {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Enter a public hostname without scheme, port or path',
                    });
                    return z.NEVER;
                }
            }),
        path: z
            .string()
            .trim()
            .max(240)
            .default('')
            .transform((value, ctx) => {
                if (!value) return '';
                if (
                    !/^\/(?:[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*)?$/i.test(value) ||
                    value.includes('..')
                ) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Path must start with / and contain URL path segments only',
                    });
                    return z.NEVER;
                }
                return value === '/' ? '' : value;
            }),
        kind: z.enum(['PRIMARY', 'CDN']),
        parentUuid: z.uuid().nullable().default(null),
        isDefault: z.boolean().default(false),
    })
    .strict()
    .superRefine((data, ctx) => {
        if ((data.kind === 'CDN') !== !!data.parentUuid || (data.kind === 'CDN' && data.isDefault))
            ctx.addIssue({
                code: 'custom',
                message: 'CDN requires a primary domain and cannot be the default',
                path: ['parentUuid'],
            });
    });
export const SubscriptionDomainSchema = z.object({
    uuid: z.uuid(),
    name: z.string(),
    domain: z.string(),
    path: z.string(),
    kind: z.enum(['PRIMARY', 'CDN']),
    parentUuid: z.uuid().nullable(),
    isDefault: z.boolean(),
    usersCount: z.number().int().nonnegative(),
    aliasesCount: z.number().int().nonnegative(),
    publicBaseUrl: z.string().url(),
});
export type SubscriptionDomainInput = z.infer<typeof SubscriptionDomainInputSchema>;
