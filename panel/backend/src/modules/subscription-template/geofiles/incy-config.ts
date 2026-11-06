import { ClientPoolError } from '../generators/client-pool';
import { assertSubscriptionSize } from '../generators/subscription-output';

// The Apple client formats a full config again before handing it to its core.
// Reserve room for its inbounds, logging and DNS patches, rather than measuring
// only the minified HTTP response.
export const INCY_FORMATTED_CONFIG_BUDGET = 900_000;
export const XRAY_FORMATTED_CONFIG_BUDGET = 900_000;
export const GEOFILE_INLINE_CONFIG_BUDGET = XRAY_FORMATTED_CONFIG_BUDGET / 10;
export const GEOFILE_INLINE_RULE_LIMIT = 20_000;
const MIN_COMPACT_LIST_ENTRIES = 64;
const STRING_LIST_FIELDS = ['ip', 'domain', 'domains', 'source', 'sourceIP', 'localIP'] as const;

export function xrayProfileFormattedBytes(config: Record<string, any>): number {
    let bytes = Buffer.byteLength(JSON.stringify(config, null, 4));
    if (!Array.isArray(config.routing?.rules)) return bytes;
    for (const rule of config.routing.rules) {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) continue;
        for (const key of STRING_LIST_FIELDS) {
            const value = rule[key];
            if (typeof value !== 'string') continue;
            let count = 1;
            for (let index = 0; index < value.length; index++)
                if (value.charCodeAt(index) === 44) count++;
            // Xray StringList parsing restores comma-separated strings to arrays.
            // At routing.rules[*].field, four-space JSON adds two quotes,
            // a newline and 20 spaces per entry, plus the closing array line.
            // Count that expansion without allocating potentially huge arrays.
            bytes += count * 23 + 17;
        }
    }
    return bytes;
}

export function xrayRuleEntries(
    config: Record<string, any>,
    limit = GEOFILE_INLINE_RULE_LIMIT,
): number {
    let count = 0;
    for (const rule of Array.isArray(config.routing?.rules) ? config.routing.rules : []) {
        for (const key of STRING_LIST_FIELDS) {
            const value = rule?.[key];
            if (Array.isArray(value)) count += value.length;
            else if (typeof value === 'string') {
                count++;
                for (let i = 0; i < value.length && count <= limit; i++)
                    if (value.charCodeAt(i) === 44) count++;
            }
            if (count > limit) return count;
        }
    }
    return count;
}

export function compactIncySubscription(subscription: string, enforceBudget = true): string {
    if (!subscription) return subscription;
    assertSubscriptionSize(Buffer.byteLength(subscription));
    const configs: unknown = JSON.parse(subscription);
    if (!Array.isArray(configs)) throw new ClientPoolError('incy-configuration-format');
    let changed = false;
    for (const config of configs) {
        if (!config || typeof config !== 'object' || Array.isArray(config))
            throw new ClientPoolError('incy-configuration-format');
        const rules = config.routing?.rules;
        if (Array.isArray(rules)) {
            for (const rule of rules) {
                if (!rule || typeof rule !== 'object' || Array.isArray(rule)) continue;
                for (const key of STRING_LIST_FIELDS) {
                    const values: unknown = rule[key];
                    // Xray's StringList accepts a comma-separated string. An
                    // array element containing a comma (notably a regexp) must
                    // stay an array: splitting it would change the matcher.
                    if (
                        Array.isArray(values) &&
                        values.length >= MIN_COMPACT_LIST_ENTRIES &&
                        values.every(
                            (value) =>
                                typeof value === 'string' &&
                                value.length > 0 &&
                                !value.includes(','),
                        )
                    ) {
                        rule[key] = values.join(',');
                        changed = true;
                    }
                }
            }
        }
        if (enforceBudget && xrayProfileFormattedBytes(config) > INCY_FORMATTED_CONFIG_BUDGET)
            throw new ClientPoolError(
                'incy-configuration-size-limit: configuration remains too large after geofile delivery',
            );
    }
    return changed ? JSON.stringify(configs) : subscription;
}

// A subscription is an array of independently loaded profiles. Never compare
// its combined length with a client's single-configuration budget.
export function xrayProfilesFit(
    subscription: string,
    budget = INCY_FORMATTED_CONFIG_BUDGET,
    maxRuleEntries = Number.POSITIVE_INFINITY,
): boolean {
    if (!subscription) return true;
    assertSubscriptionSize(Buffer.byteLength(subscription));
    const configs: unknown = JSON.parse(subscription);
    return (
        Array.isArray(configs) &&
        configs.every(
            (config) =>
                config &&
                typeof config === 'object' &&
                !Array.isArray(config) &&
                xrayProfileFormattedBytes(config) <= budget &&
                (maxRuleEntries === Number.POSITIVE_INFINITY ||
                    xrayRuleEntries(config, maxRuleEntries) <= maxRuleEntries),
        )
    );
}
