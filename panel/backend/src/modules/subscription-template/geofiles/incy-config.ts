import { ClientPoolError } from '../generators/client-pool';

// The Apple client formats a full config again before handing it to its core.
// Reserve room for its inbounds, logging and DNS patches, rather than measuring
// only the minified HTTP response.
export const INCY_FORMATTED_CONFIG_BUDGET = 900_000;
export const XRAY_FORMATTED_CONFIG_BUDGET = 8 * 1024 * 1024;
const MAX_SUBSCRIPTION_BYTES = 16 * 1024 * 1024;
const MIN_COMPACT_LIST_ENTRIES = 64;
const STRING_LIST_FIELDS = ['ip', 'domain', 'domains', 'source', 'sourceIP', 'localIP'] as const;

export function compactIncySubscription(subscription: string, enforceBudget = true): string {
    if (!subscription) return subscription;
    if (Buffer.byteLength(subscription) > MAX_SUBSCRIPTION_BYTES)
        throw new ClientPoolError('subscription-size-limit');
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
        if (
            enforceBudget &&
            Buffer.byteLength(JSON.stringify(config, null, 4)) > INCY_FORMATTED_CONFIG_BUDGET
        )
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
): boolean {
    if (!subscription) return true;
    if (Buffer.byteLength(subscription) > MAX_SUBSCRIPTION_BYTES)
        throw new ClientPoolError('subscription-size-limit');
    const configs: unknown = JSON.parse(subscription);
    return (
        Array.isArray(configs) &&
        configs.every(
            (config) =>
                config &&
                typeof config === 'object' &&
                !Array.isArray(config) &&
                Buffer.byteLength(JSON.stringify(config, null, 4)) <= budget,
        )
    );
}
