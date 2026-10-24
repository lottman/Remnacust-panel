import { createHash } from 'node:crypto';

import { ClientPoolError } from './client-pool';

// Templates retain the priority intent; clients receive only standard Xray objects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Preserve unrelated Xray fields.
type Config = Record<string, any>;
export const MAX_PRIORITY_MEMBERS = 128;

export function materializePriority<T extends object>(input: T): T {
    const source = input as Config;
    if (!source.routing?.balancers?.some((item: Config) => item.strategy?.type === 'priority'))
        return input;
    if (source.routing.script) throw new ClientPoolError('priority-routing-script');
    const config: Config = structuredClone(source);
    const original: Config[] = config.outbounds ?? [];
    const balances: Config[] = config.routing.balancers;
    const used = new Set<string>([
        ...original.map((item) => item.tag),
        ...balances.map((item) => item.tag),
        ...(config.inbounds ?? []).map((item: Config) => item.tag),
        ...(config.routing.rules ?? []).flatMap((item: Config) => item.inboundTag ?? []),
    ]);
    const generated: Config[] = [],
        rules: Config[] = [],
        outbounds: Config[] = [];
    let total = 0;
    for (const [index, balance] of balances.entries()) {
        if (balance.strategy?.type !== 'priority') {
            generated.push(balance);
            continue;
        }
        const selectors: string[] = balance.selector ?? [];
        if (!selectors.length || selectors.some((value) => typeof value !== 'string' || !value))
            throw new ClientPoolError('priority-selector');
        const members: Config[] = [];
        const seen = new Set<string>();
        for (const prefix of selectors)
            for (const outbound of original)
                if (
                    typeof outbound.tag === 'string' &&
                    outbound.tag.startsWith(prefix) &&
                    !seen.has(outbound.tag)
                ) {
                    seen.add(outbound.tag);
                    members.push(outbound);
                }
        total += members.length;
        if (!members.length || members.length > MAX_PRIORITY_MEMBERS || total > 256)
            throw new ClientPoolError('priority-members-limit');
        const stem =
            'rc-priority-' +
            createHash('sha256').update(`${index}:${balance.tag}`).digest('hex').slice(0, 16) +
            '-';
        if (
            [...used].some((tag) => typeof tag === 'string' && tag.startsWith(stem)) ||
            balances.some(
                (other) =>
                    other.strategy?.type !== 'priority' &&
                    other.selector?.some((prefix: string) => stem.startsWith(prefix)),
            )
        )
            throw new ClientPoolError('priority-tag-conflict');
        const name = (kind: string, position = 0) => `${stem}${kind}-${position}!`;
        const fallback = balance.fallbackTag;
        if (
            fallback !== undefined &&
            (!original.some((item) => item.tag === fallback) || !fallback)
        )
            throw new ClientPoolError('priority-fallback');
        const down = fallback ?? name('down');
        if (!fallback) outbounds.push({ tag: down, protocol: 'blackhole' });
        for (const [position, member] of members.entries()) {
            const alias = name('node', position);
            outbounds.push({ ...member, tag: alias });
            const next = position + 1;
            const tag = position === 0 ? balance.tag : name('balance', position);
            generated.push({
                ...balance,
                tag,
                selector: [alias],
                strategy: { type: 'leastPing' },
                fallbackTag: next < members.length ? name('hop', next) : down,
            });
            if (position > 0) {
                outbounds.push({
                    tag: name('hop', position),
                    protocol: 'loopback',
                    settings: { inboundTag: name('in', position) },
                });
                rules.push({ type: 'field', inboundTag: [name('in', position)], balancerTag: tag });
            }
        }
        const observer =
            config.observatory !== undefined
                ? 'observatory'
                : config.burstObservatory !== undefined
                  ? 'burstObservatory'
                  : 'observatory';
        config[observer] ??= {
            probeUrl: 'https://www.gstatic.com/generate_204',
            probeInterval: '30s',
            enableConcurrency: true,
        };
        if (
            !config[observer] ||
            typeof config[observer] !== 'object' ||
            Array.isArray(config[observer]) ||
            (config[observer].subjectSelector !== undefined &&
                !Array.isArray(config[observer].subjectSelector))
        )
            throw new ClientPoolError('priority-observer');
        config[observer].subjectSelector = [
            ...(config[observer].subjectSelector ?? []),
            stem + 'node-',
        ];
        for (const item of outbounds) used.add(item.tag);
    }
    config.outbounds = [...original, ...outbounds];
    config.routing.balancers = generated;
    // These rules are reachable only after the original routing chose this priority chain.
    config.routing.rules = [...rules, ...(config.routing.rules ?? [])];
    return config as T;
}
