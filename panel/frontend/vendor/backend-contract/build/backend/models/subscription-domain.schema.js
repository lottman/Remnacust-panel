"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionDomainSchema = exports.SubscriptionDomainInputSchema = void 0;
const zod_1 = require("zod");
exports.SubscriptionDomainInputSchema = zod_1.z
    .object({
    name: zod_1.z.string().trim().min(1).max(100),
    domain: zod_1.z
        .string()
        .trim()
        .min(1)
        .max(253)
        .transform((value, ctx) => {
        try {
            if (/[\s\\/@?#%:]/.test(value))
                throw Error();
            const url = new URL('https://' + value);
            const host = url.hostname;
            if (!host.includes('.') ||
                host.endsWith('.') ||
                host.endsWith('.local') ||
                host.endsWith('.localhost') ||
                /^[0-9.]+$/.test(host) ||
                !host
                    .split('.')
                    .every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)))
                throw Error();
            return host;
        }
        catch {
            ctx.addIssue({
                code: 'custom',
                message: 'Enter a public hostname without scheme, port or path',
            });
            return zod_1.z.NEVER;
        }
    }),
    path: zod_1.z
        .string()
        .trim()
        .max(240)
        .default('')
        .transform((value, ctx) => {
        if (!value)
            return '';
        if (!/^\/(?:[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*)?$/i.test(value) ||
            value.includes('..')) {
            ctx.addIssue({
                code: 'custom',
                message: 'Path must start with / and contain URL path segments only',
            });
            return zod_1.z.NEVER;
        }
        return value === '/' ? '' : value;
    }),
    kind: zod_1.z.enum(['PRIMARY', 'CDN']),
    parentUuid: zod_1.z.uuid().nullable().default(null),
    isDefault: zod_1.z.boolean().default(false),
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
exports.SubscriptionDomainSchema = zod_1.z.object({
    uuid: zod_1.z.uuid(),
    name: zod_1.z.string(),
    domain: zod_1.z.string(),
    path: zod_1.z.string(),
    kind: zod_1.z.enum(['PRIMARY', 'CDN']),
    parentUuid: zod_1.z.uuid().nullable(),
    isDefault: zod_1.z.boolean(),
    usersCount: zod_1.z.number().int().nonnegative(),
    aliasesCount: zod_1.z.number().int().nonnegative(),
});
