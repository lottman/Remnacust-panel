"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomRemarksSchema = exports.SubscriptionActionSchema = exports.DEFAULT_SUBSCRIPTION_REMARKS = void 0;
const zod_1 = __importDefault(require("zod"));
// These values are subscription content, independent of the administrator's UI language.
exports.DEFAULT_SUBSCRIPTION_REMARKS = {
    expiredUsers: ['⌛ Subscription expired', 'Contact support'],
    limitedUsers: ['🚧 Subscription limited', 'Contact support'],
    disabledUsers: ['🚫 Subscription disabled', 'Contact support'],
    emptyHosts: ['→ Remnacust', '→ No hosts found', '→ Check Hosts tab', '→ Check Internal Squads tab'],
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
    url: zod_1.default.string().max(2048).url().refine(value => {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !Array.from(value).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127);
    }, 'Use an HTTPS URL without credentials'),
});
exports.CustomRemarksSchema = zod_1.default.object({
    alwaysAvailableHostsPosition: zod_1.default.enum(['before', 'after']).optional(),
    combineSubscriptionAndHwidRemarks: zod_1.default.boolean().default(true),
    subscriptionAndHwidRemarkOrder: zod_1.default
        .array(zod_1.default.enum(['EXPIRED', 'DISABLED', 'HWID_BLOCKED', 'HWID_REGISTRATION_BLOCKED']))
        .min(3).max(4)
        .refine((order) => new Set(order).size === order.length && ['EXPIRED', 'DISABLED', 'HWID_BLOCKED'].every(x => order.includes(x)), 'Remark order values must be unique and complete')
        .default(['EXPIRED', 'DISABLED', 'HWID_REGISTRATION_BLOCKED', 'HWID_BLOCKED']),
    action: exports.SubscriptionActionSchema.nullable().optional(),
    expiredUsers: zod_1.default.array(zod_1.default.string()).min(1),
    limitedUsers: zod_1.default.array(zod_1.default.string()).min(1),
    disabledUsers: zod_1.default.array(zod_1.default.string()).min(1),
    emptyHosts: zod_1.default.array(zod_1.default.string()).min(1),
    HWIDMaxDevicesExceeded: zod_1.default.array(zod_1.default.string()).min(1),
    HWIDNotSupported: zod_1.default.array(zod_1.default.string()).min(1),
    HWIDRegistrationBlocked: zod_1.default.array(zod_1.default.string()).max(24).default(() => [...exports.DEFAULT_SUBSCRIPTION_REMARKS.HWIDRegistrationBlocked]),
    HWIDBlocked: zod_1.default.array(zod_1.default.string()).default([]),
    hostTrafficPaused: zod_1.default.array(zod_1.default.string()).max(24).default(() => [...exports.DEFAULT_SUBSCRIPTION_REMARKS.hostTrafficPaused]),
    hostTrafficLimit: zod_1.default.array(zod_1.default.string()).default([]),
});
