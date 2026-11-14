"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomRemarksSchema = exports.ActiveExpirySchema = exports.ActiveExpiryRuleSchema = exports.SubscriptionActionSchema = exports.DEFAULT_SUBSCRIPTION_REMARKS = void 0;
exports.parseActiveExpiryRemark = parseActiveExpiryRemark;
const zod_1 = __importDefault(require("zod"));
// These values are subscription content, independent of the administrator's UI language.
exports.DEFAULT_SUBSCRIPTION_REMARKS = {
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
exports.SubscriptionActionSchema = zod_1.default.object({
    text: zod_1.default.string().trim().max(500),
    buttonText: zod_1.default.string().trim().min(1).max(60),
    url: zod_1.default
        .string()
        .max(2048)
        .url()
        .refine((value) => {
        const url = new URL(value);
        return (url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            !Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127));
    }, 'Use an HTTPS URL without credentials'),
});
const ActiveExpiryActionSchema = exports.SubscriptionActionSchema.extend({
    type: zod_1.default.literal('link'),
}).strict();
function parseActiveExpiryRemark(remark) {
    const value = remark.trim();
    if (value === '{HOSTS}')
        return { kind: 'hosts' };
    if (!value || value.includes('{HOSTS}') || value.includes('{{FREE_HOST}}'))
        return null;
    try {
        const json = JSON.parse(value);
        if (json !== null && typeof json === 'object') {
            const action = ActiveExpiryActionSchema.safeParse(json);
            if (!action.success)
                return null;
            const { type: _type, ...fields } = action.data;
            return { kind: 'action', ...fields };
        }
    }
    catch { }
    return value.length <= 500 ? { kind: 'text', text: value } : null;
}
const ActiveExpiryUuidSchema = zod_1.default.uuid().transform((value) => value.toLowerCase());
const ActiveExpirySquadsSchema = zod_1.default
    .array(ActiveExpiryUuidSchema)
    .max(128)
    .refine((values) => new Set(values).size === values.length, 'Squad UUIDs must be unique');
exports.ActiveExpiryRuleSchema = zod_1.default
    .object({
    id: ActiveExpiryUuidSchema,
    enabled: zod_1.default.boolean(),
    daysBeforeExpiry: zod_1.default.number().int().min(1).max(3650),
    scope: zod_1.default.enum(['all', 'selected']),
    internalSquadUuids: ActiveExpirySquadsSchema,
    externalSquadUuids: ActiveExpirySquadsSchema,
    remarks: zod_1.default
        .array(zod_1.default
        .string()
        .max(4096)
        .refine((value) => parseActiveExpiryRemark(value) !== null, 'Use plain text, an HTTPS action or standalone {HOSTS}'))
        .min(1)
        .max(24)
        .refine((rows) => rows.filter((row) => row.trim() === '{HOSTS}').length <= 1, 'Use at most one {HOSTS}'),
})
    .refine((rule) => rule.scope === 'all' ||
    rule.internalSquadUuids.length + rule.externalSquadUuids.length > 0, 'Select at least one squad');
exports.ActiveExpirySchema = zod_1.default.object({
    rules: zod_1.default
        .array(exports.ActiveExpiryRuleSchema)
        .max(32)
        .refine((rules) => new Set(rules.map((rule) => rule.id)).size === rules.length, 'Rule IDs must be unique'),
});
exports.CustomRemarksSchema = zod_1.default.object({
    activeExpiry: exports.ActiveExpirySchema.optional(),
    alwaysAvailableHostsPosition: zod_1.default.enum(['before', 'after']).optional(),
    combineSubscriptionAndHwidRemarks: zod_1.default.boolean().default(true),
    subscriptionAndHwidRemarkOrder: zod_1.default
        .array(zod_1.default.enum(['EXPIRED', 'DISABLED', 'FROZEN', 'HWID_BLOCKED', 'HWID_REGISTRATION_BLOCKED']))
        .min(3)
        .max(5)
        .refine((order) => new Set(order).size === order.length &&
        ['EXPIRED', 'DISABLED', 'HWID_BLOCKED'].every((x) => order.includes(x)), 'Remark order values must be unique and complete')
        .default(['EXPIRED', 'HWID_REGISTRATION_BLOCKED', 'HWID_BLOCKED', 'DISABLED', 'FROZEN']),
    action: exports.SubscriptionActionSchema.nullable().optional(),
    expiredUsers: zod_1.default.array(zod_1.default.string()).min(1),
    limitedUsers: zod_1.default.array(zod_1.default.string()).min(1),
    disabledUsers: zod_1.default.array(zod_1.default.string()).min(1),
    frozenUsers: zod_1.default
        .array(zod_1.default.string())
        .min(1)
        .max(24)
        .default(() => [...exports.DEFAULT_SUBSCRIPTION_REMARKS.frozenUsers]),
    emptyHosts: zod_1.default.array(zod_1.default.string()).min(1),
    HWIDMaxDevicesExceeded: zod_1.default.array(zod_1.default.string()).min(1),
    HWIDNotSupported: zod_1.default.array(zod_1.default.string()).min(1),
    HWIDRegistrationBlocked: zod_1.default
        .array(zod_1.default.string())
        .max(24)
        .default(() => [...exports.DEFAULT_SUBSCRIPTION_REMARKS.HWIDRegistrationBlocked]),
    HWIDBlocked: zod_1.default.array(zod_1.default.string()).default([]),
    hostTrafficPaused: zod_1.default
        .array(zod_1.default.string())
        .max(24)
        .default(() => [...exports.DEFAULT_SUBSCRIPTION_REMARKS.hostTrafficPaused]),
    hostTrafficLimit: zod_1.default.array(zod_1.default.string()).default([]),
});
