import z from 'zod';

// These values are subscription content, independent of the administrator's UI language.
export const DEFAULT_SUBSCRIPTION_REMARKS = {
    expiredUsers: ['⌛ Subscription expired', 'Contact support'],
    limitedUsers: ['🚧 Subscription limited', 'Contact support'],
    disabledUsers: ['🚫 Subscription disabled', 'Contact support'],
    frozenUsers: ['❄ Subscription frozen', 'Contact support'],
    emptyHosts: [
        '→ Remnacust',
        '→ No hosts found',
        '→ Check Hosts tab',
        '→ Check Internal Squads tab',
    ],
    HWIDMaxDevicesExceeded: ['Limit of devices reached'],
    HWIDNotSupported: ['App not supported'],
    HWIDRegistrationBlocked: ['New device registration is disabled'],
    HWIDBlocked: ['Device is blocked'],
    hostTrafficLimit: ['Host traffic limit reached'],
    hostTrafficPaused: ['Traffic is temporarily paused'],
};

export const SubscriptionActionSchema = z.object({
    text: z.string().trim().max(500),
    buttonText: z.string().trim().min(1).max(60),
    url: z
        .string()
        .max(2048)
        .url()
        .refine((value) => {
            const url = new URL(value);
            return (
                url.protocol === 'https:' &&
                !url.username &&
                !url.password &&
                !Array.from(value).some(
                    (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
                )
            );
        }, 'Use an HTTPS URL without credentials'),
});

const ActiveExpiryActionSchema = SubscriptionActionSchema.extend({
    type: z.literal('link'),
}).strict();

export type ActiveExpiryItem =
    | { kind: 'hosts' }
    | { kind: 'text'; text: string }
    | { kind: 'action'; text: string; buttonText: string; url: string };

export function parseActiveExpiryRemark(remark: string): ActiveExpiryItem | null {
    const value = remark.trim();
    if (value === '{HOSTS}') return { kind: 'hosts' };
    if (!value || value.includes('{HOSTS}') || value.includes('{{FREE_HOST}}')) return null;
    try {
        const json: unknown = JSON.parse(value);
        if (json !== null && typeof json === 'object') {
            const action = ActiveExpiryActionSchema.safeParse(json);
            if (!action.success) return null;
            const { type: _type, ...fields } = action.data;
            return { kind: 'action', ...fields };
        }
    } catch {}
    return value.length <= 500 ? { kind: 'text', text: value } : null;
}

const ActiveExpiryUuidSchema = z.uuid().transform((value) => value.toLowerCase());
const ActiveExpirySquadsSchema = z
    .array(ActiveExpiryUuidSchema)
    .max(128)
    .refine((values) => new Set(values).size === values.length, 'Squad UUIDs must be unique');

export const ActiveExpiryRuleSchema = z
    .object({
        id: ActiveExpiryUuidSchema,
        enabled: z.boolean(),
        daysBeforeExpiry: z.number().int().min(1).max(3650),
        scope: z.enum(['all', 'selected']),
        internalSquadUuids: ActiveExpirySquadsSchema,
        externalSquadUuids: ActiveExpirySquadsSchema,
        remarks: z
            .array(
                z
                    .string()
                    .max(4096)
                    .refine(
                        (value) => parseActiveExpiryRemark(value) !== null,
                        'Use plain text, an HTTPS action or standalone {HOSTS}',
                    ),
            )
            .min(1)
            .max(24)
            .refine(
                (rows) => rows.filter((row) => row.trim() === '{HOSTS}').length <= 1,
                'Use at most one {HOSTS}',
            ),
    })
    .refine(
        (rule) =>
            rule.scope === 'all' ||
            rule.internalSquadUuids.length + rule.externalSquadUuids.length > 0,
        'Select at least one squad',
    );

export const ActiveExpirySchema = z.object({
    rules: z
        .array(ActiveExpiryRuleSchema)
        .max(32)
        .refine(
            (rules) => new Set(rules.map((rule) => rule.id)).size === rules.length,
            'Rule IDs must be unique',
        ),
});

export type TActiveExpiryRule = z.infer<typeof ActiveExpiryRuleSchema>;

export const CustomRemarksSchema = z.object({
    activeExpiry: ActiveExpirySchema.optional(),
    alwaysAvailableHostsPosition: z.enum(['before', 'after']).optional(),
    combineSubscriptionAndHwidRemarks: z.boolean().default(true),
    subscriptionAndHwidRemarkOrder: z
        .array(
            z.enum(['EXPIRED', 'DISABLED', 'FROZEN', 'HWID_BLOCKED', 'HWID_REGISTRATION_BLOCKED']),
        )
        .min(3)
        .max(5)
        .refine(
            (order) =>
                new Set(order).size === order.length &&
                ['EXPIRED', 'DISABLED', 'HWID_BLOCKED'].every((x) =>
                    order.includes(x as (typeof order)[number]),
                ),
            'Remark order values must be unique and complete',
        )
        .default(['EXPIRED', 'HWID_REGISTRATION_BLOCKED', 'HWID_BLOCKED', 'DISABLED', 'FROZEN']),
    action: SubscriptionActionSchema.nullable().optional(),
    expiredUsers: z.array(z.string()).min(1),
    limitedUsers: z.array(z.string()).min(1),
    disabledUsers: z.array(z.string()).min(1),
    frozenUsers: z
        .array(z.string())
        .min(1)
        .max(24)
        .default(() => [...DEFAULT_SUBSCRIPTION_REMARKS.frozenUsers]),
    emptyHosts: z.array(z.string()).min(1),
    HWIDMaxDevicesExceeded: z.array(z.string()).min(1),
    HWIDNotSupported: z.array(z.string()).min(1),
    HWIDRegistrationBlocked: z
        .array(z.string())
        .max(24)
        .default(() => [...DEFAULT_SUBSCRIPTION_REMARKS.HWIDRegistrationBlocked]),
    HWIDBlocked: z.array(z.string()).default([]),
    hostTrafficPaused: z
        .array(z.string())
        .max(24)
        .default(() => [...DEFAULT_SUBSCRIPTION_REMARKS.hostTrafficPaused]),
    hostTrafficLimit: z.array(z.string()).default([]),
});

export type TCustomRemarks = z.infer<typeof CustomRemarksSchema>;
