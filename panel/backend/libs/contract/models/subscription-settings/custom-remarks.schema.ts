import z from 'zod';

// These values are subscription content, independent of the administrator's UI language.
export const DEFAULT_SUBSCRIPTION_REMARKS = {
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

export const SubscriptionActionSchema = z.object({
        text: z.string().trim().max(500),
        buttonText: z.string().trim().min(1).max(60),
        url: z.string().max(2048).url().refine(value => {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password && !Array.from(value).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127);
        }, 'Use an HTTPS URL without credentials'),
    });

export const CustomRemarksSchema = z.object({
    alwaysAvailableHostsPosition: z.enum(['before', 'after']).optional(),
    combineSubscriptionAndHwidRemarks: z.boolean().default(true),
    subscriptionAndHwidRemarkOrder: z
        .array(z.enum(['EXPIRED', 'DISABLED', 'HWID_BLOCKED', 'HWID_REGISTRATION_BLOCKED']))
        .min(3).max(4)
        .refine((order) => new Set(order).size === order.length && ['EXPIRED','DISABLED','HWID_BLOCKED'].every(x=>order.includes(x as typeof order[number])), 'Remark order values must be unique and complete')
        .default(['EXPIRED', 'DISABLED', 'HWID_REGISTRATION_BLOCKED', 'HWID_BLOCKED']),
    action: SubscriptionActionSchema.nullable().optional(),
    expiredUsers: z.array(z.string()).min(1),
    limitedUsers: z.array(z.string()).min(1),
    disabledUsers: z.array(z.string()).min(1),
    emptyHosts: z.array(z.string()).min(1),
    HWIDMaxDevicesExceeded: z.array(z.string()).min(1),
    HWIDNotSupported: z.array(z.string()).min(1),
    HWIDRegistrationBlocked: z.array(z.string()).max(24).default(() => [...DEFAULT_SUBSCRIPTION_REMARKS.HWIDRegistrationBlocked]),
    HWIDBlocked: z.array(z.string()).default([]),
    hostTrafficPaused: z.array(z.string()).max(24).default(() => [...DEFAULT_SUBSCRIPTION_REMARKS.hostTrafficPaused]),
    hostTrafficLimit: z.array(z.string()).default([]),
});

export type TCustomRemarks = z.infer<typeof CustomRemarksSchema>;
