import { z } from 'zod';

import { TResponseRulesResponseType } from '@libs/contracts/constants';
import {
    ResponseRuleConditionSchema,
    ResponseRuleSchema,
    ResponseRulesConfigSchema,
    ResponseRuleEncryptionSchema,
    ResponseRuleModificationsSchema,
} from '@libs/contracts/models';

export type TResponseRulesConfig = z.infer<typeof ResponseRulesConfigSchema>;
export type TResponseRule = z.infer<typeof ResponseRuleSchema>;
export type TResponseRuleCondition = z.infer<typeof ResponseRuleConditionSchema>;
export type TResponseRuleModifications = z.infer<typeof ResponseRuleModificationsSchema>;
export type TResponseRuleEncryption = z.infer<typeof ResponseRuleEncryptionSchema>;

export interface ISrrMatchedResult {
    matched: boolean;
    matchedRule?: TResponseRule;
    responseType?: TResponseRulesResponseType;
}
