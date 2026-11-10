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
export function indexXrayTemplateAssignments(templates: Template[]): Assignments {
    const result: Assignments = { hosts: new Map(), tags: new Map(), rank: new Map() };
    for (const template of templates) {
        const content = template.templateJson
            ? withTemplateGeofilePolicy(
                  template.templateJson as Config,
                  template.geofilesEnabled === true,
              )
            : null;
        if (!content) continue;
        for (const assignment of entries(content)) {
            const selected = {
                key: template.uuid + ':' + (assignment.balancerTag ?? ''),
                name:
                    [template.name, assignment.balancerTag].filter(Boolean).join(' · ') ||
                    template.uuid.slice(0, 8),
                template: rulesForBalancer(content, assignment.balancerTag),
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
