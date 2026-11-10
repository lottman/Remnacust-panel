import { withTemplateGeofilePolicy } from '../../subscription-template/geofiles/template-geofile-policy';

type Template = {
    uuid: string;
    name?: string;
    templateJson: object | null;
    geofilesEnabled?: boolean;
};
export type XrayTemplateVariant = { key: string; name: string; template: object };
type Assignments = {
    hosts: Map<string, XrayTemplateVariant[]>;
    tags: Map<string, XrayTemplateVariant[]>;
    rank: Map<XrayTemplateVariant, number>;
};
type Assignment = { hosts?: string[]; tags?: string[]; balancerTag?: string };
type Config = Record<string, any>;

function scopeAssignedPools(config: Config): object {
    const pools = config.remnawave?.injectHosts;
    const balancers = config.routing?.balancers;
    if (
        !Array.isArray(pools) ||
        !Array.isArray(balancers) ||
        config.lua !== undefined ||
        config.routing?.rules?.some((rule: Config) => rule?.type && rule.type !== 'field') ||
        balancers.some(
            (item: Config) =>
                item?.strategy?.type &&
                !['random', 'roundRobin', 'leastPing', 'leastLoad', 'priority'].includes(
                    item.strategy.type,
                ),
        )
    )
        return config;
    const references = new Set<string>();
    const outboundReferences = new Set<string>();
    const keys = new Set([
        'balancerTag',
        'outboundTag',
        'fallbackTag',
        'dialerProxy',
        'outbound',
        'target',
    ]);
    let budget = 20000;
    const visit = (value: unknown, key = '', parent = '', depth = 0): boolean => {
        if (--budget < 0 || depth > 64) return false;
        if (typeof value === 'string') {
            if (key === 'balancerTag' || key === 'target') references.add(value);
            if (
                (keys.has(key) && key !== 'balancerTag') ||
                (key === 'tag' && parent === 'proxySettings')
            )
                outboundReferences.add(value);
            return true;
        }
        if (Array.isArray(value)) {
            if (['domain', 'ip', 'domains', 'ips'].includes(key)) return true;
            for (const child of value) if (!visit(child, key, parent, depth + 1)) return false;
        } else if (value && typeof value === 'object') {
            for (const [field, child] of Object.entries(value))
                if (!visit(child, field, key, depth + 1)) return false;
        }
        return true;
    };
    if (
        !visit({
            ...config,
            remnawave: undefined,
            routing: { ...config.routing, balancers: undefined },
        })
    )
        return config;
    const retained = balancers.filter((item: Config) => references.has(item.tag));
    if (!visit(retained)) return config;
    if (retained.some((item: Config) => !Array.isArray(item.selector))) return config;
    const selectors: string[] = retained
        .flatMap((item: Config) => item.selector)
        .filter((item: unknown) => typeof item === 'string');
    const dynamic = (pool: Config) =>
        pool.useHostRemarkAsTag ||
        pool.useHostTagAsTag ||
        typeof pool.tagPrefix !== 'string' ||
        !pool.tagPrefix;
    const selected = pools.filter(
        (pool: Config) =>
            dynamic(pool) ||
            selectors.some(
                (prefix) => pool.tagPrefix.startsWith(prefix) || prefix.startsWith(pool.tagPrefix),
            ) ||
            [...outboundReferences].some((tag) => tag.startsWith(pool.tagPrefix)),
    );
    const removed = pools.filter((pool: Config) => !selected.includes(pool));
    const result: Config = {
        ...config,
        routing: { ...config.routing, balancers: retained },
        remnawave: { ...config.remnawave, injectHosts: selected },
    };
    if (!selected.some(dynamic))
        for (const key of ['observatory', 'burstObservatory']) {
            const observer = config[key];
            if (!Array.isArray(observer?.subjectSelector)) continue;
            result[key] = {
                ...observer,
                subjectSelector: observer.subjectSelector.filter(
                    (prefix: unknown) =>
                        typeof prefix !== 'string' ||
                        !removed.some(
                            (pool: Config) =>
                                pool.tagPrefix.startsWith(prefix) ||
                                prefix.startsWith(pool.tagPrefix),
                        ) ||
                        selected.some(
                            (pool: Config) =>
                                pool.tagPrefix.startsWith(prefix) ||
                                prefix.startsWith(pool.tagPrefix),
                        ) ||
                        config.outbounds?.some(
                            (outbound: Config) =>
                                typeof outbound.tag === 'string' && outbound.tag.startsWith(prefix),
                        ),
                ),
            };
        }
    return result;
}

function rulesForBalancer(content: object, tag?: string): object {
    const config = content as Config;
    if (!tag || !config.routing?.balancers?.some((item: Config) => item.tag === tag))
        return content;
    const catchAll = (rule: Config) =>
        rule &&
        Object.keys(rule).every((key) =>
            ['type', 'network', 'balancerTag', 'outboundTag'].includes(key),
        ) &&
        (!rule.network || ['tcp,udp', 'udp,tcp'].includes(rule.network));
    const rules = (config.routing.rules ?? []).filter(
        (rule: Config) => !(catchAll(rule) && rule.balancerTag),
    );
    const fallback = rules.findIndex(catchAll);
    rules.splice(fallback === -1 ? rules.length : fallback, 0, {
        type: 'field',
        network: 'tcp,udp',
        balancerTag: tag,
    });
    return scopeAssignedPools({ ...config, routing: { ...config.routing, rules } });
}

function entries(content: Config): Assignment[] {
    return [
        ...(content.remnawave?.assignments ?? []),
        ...(content.remnawave?.assignTo ? [content.remnawave.assignTo] : []),
    ];
}

export function recipientXrayTemplate(
    host: { uuid: string; tags: string[] },
    content: object | null,
): object | null {
    return recipientXrayTemplates(host, content)[0]?.template ?? null;
}

export function recipientXrayTemplates(
    host: { uuid: string; tags: string[] },
    content: object | null,
): XrayTemplateVariant[] {
    if (!content) return [];
    const assignments = entries(content);
    const direct = assignments.filter((entry) => entry.hosts?.includes(host.uuid));
    const matches = direct.length
        ? direct
        : assignments.filter((entry) => entry.tags?.some((tag) => host.tags.includes(tag)));
    const selected: Assignment[] = matches.length ? matches : [{}];
    const seen = new Set<string>();
    return selected.flatMap((entry) => {
        const key = entry.balancerTag ?? '';
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ key, name: key, template: rulesForBalancer(content, entry.balancerTag) }];
    });
}

// Rows arrive in template order. Explicit host configuration remains highest priority.
export function indexXrayTemplateAssignments(
    templates: Template[],
    recipients?: readonly { uuid: string; tags: readonly string[] }[],
): Assignments {
    const result: Assignments = { hosts: new Map(), tags: new Map(), rank: new Map() };
    const recipientUuids = recipients && new Set(recipients.map((host) => host.uuid));
    const recipientTags = recipients && new Set(recipients.flatMap((host) => [...host.tags]));
    for (const template of templates) {
        const content = template.templateJson
            ? withTemplateGeofilePolicy(
                  template.templateJson as Config,
                  template.geofilesEnabled === true,
              )
            : null;
        if (!content) continue;
        const variants = new Map<string, object>();
        for (const assignment of entries(content)) {
            if (
                recipientUuids &&
                !assignment.hosts?.some((uuid) => recipientUuids.has(uuid)) &&
                !assignment.tags?.some((tag) => recipientTags!.has(tag))
            )
                continue;
            const variantKey = assignment.balancerTag ?? '';
            let scoped = variants.get(variantKey);
            if (!scoped) {
                scoped = rulesForBalancer(content, assignment.balancerTag);
                variants.set(variantKey, scoped);
            }
            const selected = {
                key: template.uuid + ':' + variantKey,
                name:
                    [template.name, assignment.balancerTag].filter(Boolean).join(' · ') ||
                    template.uuid.slice(0, 8),
                template: scoped,
            };
            result.rank.set(selected, result.rank.size);
            for (const field of ['hosts', 'tags'] as const) {
                const values = assignment[field];
                if (!Array.isArray(values)) continue;
                for (const value of values) {
                    if (typeof value !== 'string') continue;
                    const matches = result[field].get(value) ?? [];
                    if (!matches.some((match) => match.key === selected.key))
                        result[field].set(value, [...matches, selected]);
                }
            }
        }
    }
    return result;
}

export function assignedXrayTemplate(
    host: { uuid: string; tags: string[] },
    index: Assignments,
): object | null {
    return assignedXrayTemplates(host, index)[0]?.template ?? null;
}

export function assignedXrayTemplates(
    host: { uuid: string; tags: string[] },
    index: Assignments,
): XrayTemplateVariant[] {
    const direct = index.hosts.get(host.uuid);
    if (direct?.length) return direct;
    const matches = host.tags.flatMap((tag) => {
        const template = index.tags.get(tag);
        return template ?? [];
    });
    const seen = new Set<string>();
    return matches
        .sort((left, right) => index.rank.get(left)! - index.rank.get(right)!)
        .filter((match) => {
            if (seen.has(match.key)) return false;
            seen.add(match.key);
            return true;
        });
}

export function describeXrayTemplateAssignments(
    host: { uuid: string; tags: string[]; xrayJsonTemplateUuid?: string | null },
    templates: Template[],
) {
    let source: 'HOST' | 'HOST_ASSIGNMENT' | 'TAG_ASSIGNMENT' | 'DEFAULT';
    let matches: { uuid: string; name: string; balancerTag: string | null }[];
    if (host.xrayJsonTemplateUuid) {
        const selected = templates.find((item) => item.uuid === host.xrayJsonTemplateUuid);
        source = 'HOST';
        matches = selected
            ? recipientXrayTemplates(host, selected.templateJson).map((item) => ({
                  uuid: selected.uuid,
                  name: selected.name ?? selected.uuid,
                  balancerTag: item.key || null,
              }))
            : [];
    } else {
        const index = indexXrayTemplateAssignments(templates, [host]);
        const selected = assignedXrayTemplates(host, index);
        source = index.hosts.get(host.uuid)?.length
            ? 'HOST_ASSIGNMENT'
            : selected.length
              ? 'TAG_ASSIGNMENT'
              : 'DEFAULT';
        matches = selected.map((item) => {
            const uuid = item.key.slice(0, 36);
            return {
                uuid,
                name: templates.find((template) => template.uuid === uuid)?.name ?? uuid,
                balancerTag: item.key.slice(37) || null,
            };
        });
    }
    return { source, templates: matches };
}
