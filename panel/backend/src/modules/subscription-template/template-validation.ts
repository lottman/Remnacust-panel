import {
    injectedPrefixesCollide,
    injectedTagMatches,
    RemnawaveInjectorSchema,
} from '@libs/contracts/models';

const object = (value: unknown): value is Record<string, any> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

export function xrayTemplateWarnings(config: Record<string, any>): string[] {
    const warnings: string[] = [];
    if (config.remnawave !== undefined) {
        const result = RemnawaveInjectorSchema.safeParse(config.remnawave);
        if (!result.success)
            warnings.push(
                ...result.error.issues.map((issue) => ['remnawave', ...issue.path].join('.')),
            );
        if (result.success) {
            const pools = result.data.injectHosts ?? [];
            const staticTags = Array.isArray(config.outbounds)
                ? config.outbounds.filter(object).map((outbound) => outbound.tag)
                : [];
            for (const [index, pool] of pools.entries()) {
                const prefix = pool.tagPrefix;
                if (
                    prefix &&
                    (staticTags.some(
                        (tag: unknown) =>
                            typeof tag === 'string' && injectedTagMatches(prefix, tag),
                    ) ||
                        pools.some(
                            (other, otherIndex) =>
                                index !== otherIndex &&
                                other.tagPrefix &&
                                injectedPrefixesCollide(prefix, other.tagPrefix),
                        ))
                )
                    warnings.push(`remnawave.injectHosts.${index}.tagPrefix`);
                if (!pool.tagPrefix && !pool.useHostRemarkAsTag && !pool.useHostTagAsTag)
                    warnings.push(`remnawave.injectHosts.${index}.tagPrefix`);
                if ('pattern' in pool.selector) {
                    try {
                        new RegExp(pool.selector.pattern);
                    } catch {
                        warnings.push(`remnawave.injectHosts.${index}.selector.pattern`);
                    }
                }
            }
            const assignedHosts = new Set<string>();
            const assignedBalancers = new Set<string>();
            for (const [index, assignment] of (result.data.assignments ?? []).entries()) {
                if (
                    assignedBalancers.has(assignment.balancerTag) ||
                    !config.routing?.balancers?.some(
                        (item: Record<string, unknown>) => item.tag === assignment.balancerTag,
                    )
                )
                    warnings.push(`remnawave.assignments.${index}.balancerTag`);
                assignedBalancers.add(assignment.balancerTag);
                for (const host of assignment.hosts ?? []) {
                    if (assignedHosts.has(host))
                        warnings.push(`remnawave.assignments.${index}.hosts`);
                    assignedHosts.add(host);
                }
            }
        }
    }
    if (config.outbounds !== undefined && !Array.isArray(config.outbounds))
        warnings.push('outbounds');
    if (config.routing !== undefined && !object(config.routing)) warnings.push('routing');
    if (object(config.routing)) {
        for (const key of ['rules', 'balancers'])
            if (config.routing[key] !== undefined && !Array.isArray(config.routing[key]))
                warnings.push(`routing.${key}`);
        if (Array.isArray(config.routing.balancers)) {
            const tags = new Set();
            for (const [index, balancer] of config.routing.balancers.entries()) {
                const path = `routing.balancers.${index}`;
                if (!object(balancer)) {
                    warnings.push(path);
                    continue;
                }
                if (!balancer.tag || tags.has(balancer.tag)) warnings.push(`${path}.tag`);
                tags.add(balancer.tag);
                if (
                    !Array.isArray(balancer.selector) ||
                    !balancer.selector.length ||
                    balancer.selector.some((value: unknown) => typeof value !== 'string')
                )
                    warnings.push(`${path}.selector`);
                const settings = balancer.strategy?.settings;
                if (balancer.strategy?.type === 'priority') {
                    if (config.routing.script) warnings.push('routing.script');
                    if (balancer.selector?.some((value: unknown) => value === ''))
                        warnings.push(`${path}.selector`);
                    if (
                        balancer.fallbackTag !== undefined &&
                        (typeof balancer.fallbackTag !== 'string' || !balancer.fallbackTag)
                    )
                        warnings.push(`${path}.fallbackTag`);
                    for (const key of ['observatory', 'burstObservatory'])
                        if (
                            config[key] !== undefined &&
                            (!object(config[key]) ||
                                (config[key].subjectSelector !== undefined &&
                                    !Array.isArray(config[key].subjectSelector)))
                        )
                            warnings.push(key);
                }
                if (balancer.strategy?.type !== 'leastLoad' || settings === undefined) continue;
                if (!object(settings)) {
                    warnings.push(`${path}.strategy.settings`);
                    continue;
                }
                if (
                    settings.expected !== undefined &&
                    (!Number.isInteger(settings.expected) ||
                        settings.expected < 0 ||
                        settings.expected > 2147483647)
                )
                    warnings.push(`${path}.strategy.settings.expected`);
                if (
                    settings.tolerance !== undefined &&
                    (typeof settings.tolerance !== 'number' ||
                        !Number.isFinite(settings.tolerance) ||
                        settings.tolerance < 0 ||
                        settings.tolerance > 1)
                )
                    warnings.push(`${path}.strategy.settings.tolerance`);
                const duration = (value: unknown) =>
                    typeof value === 'string' &&
                    /^(?:0|(?:(?:\d+(?:\.\d*)?|\.\d+)(?:ns|us|µs|μs|ms|s|m|h))+)$/.test(value);
                if (settings.maxRTT !== undefined && !duration(settings.maxRTT))
                    warnings.push(`${path}.strategy.settings.maxRTT`);
                if (
                    settings.baselines !== undefined &&
                    (!Array.isArray(settings.baselines) || !settings.baselines.every(duration))
                )
                    warnings.push(`${path}.strategy.settings.baselines`);
            }
        }
    }
    return [...new Set(warnings)];
}

export function blockingXrayTemplateWarnings(
    config: Record<string, any>,
    warnings: string[],
): string[] {
    return warnings.filter((path) => {
        const tolerance = /^routing\.balancers\.(\d+)\.strategy\.settings\.tolerance$/.exec(path);
        if (!tolerance) return true;
        const value =
            config.routing?.balancers?.[Number(tolerance[1])]?.strategy?.settings?.tolerance;
        // Xray's builder accepts finite numeric values and clamps them to [0, 1].
        return typeof value !== 'number' || !Number.isFinite(value);
    });
}
