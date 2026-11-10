import {
    GEOFILE_INLINE_RULE_LIMIT,
    GEOFILE_INLINE_RULE_LIMIT_MIN,
    GEOFILE_INLINE_RULE_LIMIT_MAX,
} from '../../../../libs/contract/constants/subscription-template/geofile-limits';

export function geofileInlineRuleLimit(value: unknown): number {
    if (value === undefined) return GEOFILE_INLINE_RULE_LIMIT;
    if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < GEOFILE_INLINE_RULE_LIMIT_MIN ||
        value > GEOFILE_INLINE_RULE_LIMIT_MAX
    )
        throw new Error('geofile-inline-rule-limit');
    return value;
}
