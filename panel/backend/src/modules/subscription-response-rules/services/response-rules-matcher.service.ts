import type {
    TResponseRule,
    TResponseRuleCondition,
    ISrrMatchedResult,
    TResponseRulesConfig,
} from '../types/response-rules.types';

import { Injectable, Logger } from '@nestjs/common';

import { configuredRegex, RegexBudgetError } from '@common/utils/bounded-regex';
import {
    REQUEST_TEMPLATE_TYPE,
    RESPONSE_RULES_CONDITION_OPERATORS,
    RESPONSE_RULES_OPERATORS,
    SUBSCRIPTION_TEMPLATE_TYPE,
    TRequestTemplateTypeKeys,
    TResponseRulesConditionOperator,
} from '@libs/contracts/constants';

@Injectable()
export class ResponseRulesMatcherService {
    private readonly logger = new Logger(ResponseRulesMatcherService.name);

    public async matchRules(
        responseRules: TResponseRulesConfig,
        requestHeaders: Record<string, string | string[] | undefined>,
        overrideClientType: TRequestTemplateTypeKeys | undefined,
    ): Promise<ISrrMatchedResult> {
        if (overrideClientType) {
            if (responseRules.settings && responseRules.settings.disableSubscriptionAccessByPath) {
                return {
                    matched: true,
                    responseType: 'BLOCK',
                };
            }

            return this.handleOverrideClientType(overrideClientType);
        }

        const deadline = Date.now() + 1000;
        for (const rule of responseRules.rules) {
            if (!rule.enabled) {
                continue;
            }

            let matched: boolean;
            try {
                matched = await this.matchRule(rule, requestHeaders, deadline);
            } catch (error) {
                if (!(error instanceof RegexBudgetError)) throw error;
                // A failed NOT_REGEX must not become a match or fall through to an allow rule.
                return { matched: true, responseType: 'BLOCK' };
            }

            if (matched) {
                return {
                    matched: true,
                    matchedRule: rule,
                    responseType: rule.responseType,
                };
            }
        }

        return { matched: false };
    }

    private async matchRule(
        rule: TResponseRule,
        requestHeaders: Record<string, string | string[] | undefined>,
        deadline: number,
    ): Promise<boolean> {
        if (rule.conditions.length === 0) {
            // Assuming that if there are no conditions, the rule should be matched
            return true;
        }

        if (rule.operator === RESPONSE_RULES_OPERATORS.AND) {
            for (const condition of rule.conditions) {
                if (!(await this.matchCondition(condition, requestHeaders, deadline))) return false;
            }
            return true;
        } else if (rule.operator === RESPONSE_RULES_OPERATORS.OR) {
            for (const condition of rule.conditions) {
                if (await this.matchCondition(condition, requestHeaders, deadline)) return true;
            }
            return false;
        }

        throw new Error(`Unknown operator: ${rule.operator}`);
    }

    private async matchCondition(
        condition: TResponseRuleCondition,
        requestHeaders: Record<string, string | string[] | undefined>,
        deadline: number,
    ): Promise<boolean> {
        let headerValue = this.getHeaderValue(requestHeaders, condition.headerName);

        if (headerValue === undefined) {
            return false;
        }

        let compareValue = condition.value;

        if (
            !condition.caseSensitive &&
            condition.operator !== 'REGEX' &&
            condition.operator !== 'NOT_REGEX'
        ) {
            compareValue = compareValue.toLowerCase();
            headerValue = headerValue.toLowerCase();
        }

        try {
            return await this.applyOperator(
                headerValue,
                condition.operator,
                compareValue,
                condition.caseSensitive,
                deadline,
            );
        } catch (error) {
            if (error instanceof RegexBudgetError) throw error;
            this.logger.error(`Error matching condition "${condition.headerName}": ${error}`);
            return false;
        }
    }

    private getHeaderValue(
        headers: Record<string, string | string[] | undefined>,
        headerName: string,
    ): string | undefined {
        const lowerHeaderName = headerName.toLowerCase();
        const headerValue = headers[lowerHeaderName];
        return Array.isArray(headerValue) ? headerValue.join(',') : headerValue;
    }

    private async applyOperator(
        headerValue: string,
        operator: TResponseRulesConditionOperator,
        compareValue: string,
        caseSensitive: boolean = true,
        deadline = Date.now() + 1000,
    ): Promise<boolean> {
        switch (operator) {
            case RESPONSE_RULES_CONDITION_OPERATORS.EQUALS:
                return headerValue === compareValue;

            case RESPONSE_RULES_CONDITION_OPERATORS.NOT_EQUALS:
                return headerValue !== compareValue;

            case RESPONSE_RULES_CONDITION_OPERATORS.CONTAINS:
                return headerValue.includes(compareValue);

            case RESPONSE_RULES_CONDITION_OPERATORS.NOT_CONTAINS:
                return !headerValue.includes(compareValue);

            case RESPONSE_RULES_CONDITION_OPERATORS.STARTS_WITH:
                return headerValue.startsWith(compareValue);

            case RESPONSE_RULES_CONDITION_OPERATORS.NOT_STARTS_WITH:
                return !headerValue.startsWith(compareValue);

            case RESPONSE_RULES_CONDITION_OPERATORS.ENDS_WITH:
                return headerValue.endsWith(compareValue);

            case RESPONSE_RULES_CONDITION_OPERATORS.NOT_ENDS_WITH:
                return !headerValue.endsWith(compareValue);

            case RESPONSE_RULES_CONDITION_OPERATORS.REGEX:
                return configuredRegex.test(
                    compareValue,
                    headerValue,
                    caseSensitive ? '' : 'i',
                    deadline,
                );

            case RESPONSE_RULES_CONDITION_OPERATORS.NOT_REGEX:
                return !(await configuredRegex.test(
                    compareValue,
                    headerValue,
                    caseSensitive ? '' : 'i',
                    deadline,
                ));

            default:
                throw new Error(`Unknown operator: ${operator}`);
        }
    }

    private handleOverrideClientType(clientType: TRequestTemplateTypeKeys): ISrrMatchedResult {
        const matchedResponse: ISrrMatchedResult = {
            matched: true,
            responseType: 'BLOCK',
        };

        switch (clientType) {
            case REQUEST_TEMPLATE_TYPE.STASH:
                matchedResponse.responseType = SUBSCRIPTION_TEMPLATE_TYPE.STASH;
                break;
            case REQUEST_TEMPLATE_TYPE.SINGBOX:
                matchedResponse.responseType = SUBSCRIPTION_TEMPLATE_TYPE.SINGBOX;
                break;
            case REQUEST_TEMPLATE_TYPE.MIHOMO:
                matchedResponse.responseType = SUBSCRIPTION_TEMPLATE_TYPE.MIHOMO;
                break;
            case REQUEST_TEMPLATE_TYPE.XRAY_JSON:
            case REQUEST_TEMPLATE_TYPE.V2RAY_JSON:
                matchedResponse.responseType = SUBSCRIPTION_TEMPLATE_TYPE.XRAY_JSON;
                break;
            case REQUEST_TEMPLATE_TYPE.CLASH:
                matchedResponse.responseType = SUBSCRIPTION_TEMPLATE_TYPE.CLASH;
                break;
            default:
                matchedResponse.responseType = 'BLOCK';
                break;
        }

        return matchedResponse;
    }
}
