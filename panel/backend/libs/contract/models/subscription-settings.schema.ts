import { z } from 'zod';

import {
    GEOFILE_INLINE_RULE_LIMIT,
    GEOFILE_INLINE_RULE_LIMIT_MIN,
    GEOFILE_INLINE_RULE_LIMIT_MAX,
} from '../constants/subscription-template/geofile-limits';
import { ResponseRulesConfigSchema } from './response-rules';
import { CustomRemarksSchema } from './subscription-settings/custom-remarks.schema';
import { HwidSettingsSchema } from './subscription-settings/hwid-settings.schema';

export const SubscriptionSettingsSchema = z.object({
    uuid: z.uuid(),
    serveJsonAtBaseSubscription: z.boolean(),
    geofilesSystemEnabled: z.boolean().default(false),
    geofilesEnabled: z.boolean(),
    geofilesInlineRuleLimit: z
        .int()
        .min(GEOFILE_INLINE_RULE_LIMIT_MIN)
        .max(GEOFILE_INLINE_RULE_LIMIT_MAX)
        .default(GEOFILE_INLINE_RULE_LIMIT),

    isShowCustomRemarks: z.boolean(),
    customRemarks: CustomRemarksSchema,

    customResponseHeaders: z.nullable(z.record(z.string(), z.string())),

    randomizeHosts: z.boolean(),

    responseRules: z.nullable(ResponseRulesConfigSchema),

    hwidSettings: z.nullable(HwidSettingsSchema),

    createdAt: z.iso.datetime().transform((str) => new Date(str)),
    updatedAt: z.iso.datetime().transform((str) => new Date(str)),
});
