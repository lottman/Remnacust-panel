type Template = { uuid: string; templateJson: object | null };
type Assignments = {
    hosts: Map<string, object>;
    tags: Map<string, object>;
    rank: Map<object, number>;
};
type Assignment = { hosts?: string[]; tags?: string[]; balancerTag?: string };
type Config = Record<string, any>;

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
    return { ...config, routing: { ...config.routing, rules } };
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
    if (!content) return null;
    const assignments = entries(content);
    const match =
        assignments.find((entry) => entry.hosts?.includes(host.uuid)) ??
        assignments.find((entry) => entry.tags?.some((tag) => host.tags.includes(tag)));
    return rulesForBalancer(content, match?.balancerTag);
}

// Rows arrive in template order. Explicit host configuration remains highest priority.
export function indexXrayTemplateAssignments(templates: Template[]): Assignments {
    const result: Assignments = { hosts: new Map(), tags: new Map(), rank: new Map() };
    for (const template of templates) {
        const content = template.templateJson as Config | null;
        if (!content) continue;
        for (const assignment of entries(content)) {
            const selected = rulesForBalancer(content, assignment.balancerTag);
            result.rank.set(selected, result.rank.size);
            for (const field of ['hosts', 'tags'] as const) {
                const values = assignment[field];
                if (!Array.isArray(values)) continue;
                for (const value of values) {
                    if (typeof value === 'string' && !result[field].has(value))
                        result[field].set(value, selected);
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
    const direct = index.hosts.get(host.uuid);
    if (direct) return direct;
    const matches = host.tags.flatMap((tag) => {
        const template = index.tags.get(tag);
        return template ? [template] : [];
    });
    return matches.sort((left, right) => index.rank.get(left)! - index.rank.get(right)!)[0] ?? null;
}
