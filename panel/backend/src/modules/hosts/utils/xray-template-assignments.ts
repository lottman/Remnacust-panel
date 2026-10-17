type Template = { uuid: string; templateJson: object | null };
type Assignments = {
    hosts: Map<string, object>;
    tags: Map<string, object>;
    rank: Map<object, number>;
};

// Rows arrive in template order. Explicit host configuration remains highest priority.
export function indexXrayTemplateAssignments(templates: Template[]): Assignments {
    const result: Assignments = { hosts: new Map(), tags: new Map(), rank: new Map() };
    for (const template of templates) {
        const content = template.templateJson as {
            remnawave?: { assignTo?: { hosts?: unknown; tags?: unknown } };
        } | null;
        const assignment = content?.remnawave?.assignTo;
        if (!content || !assignment) continue;
        result.rank.set(content, result.rank.size);
        for (const field of ['hosts', 'tags'] as const) {
            const values = assignment[field];
            if (!Array.isArray(values)) continue;
            for (const value of values) {
                if (typeof value === 'string' && !result[field].has(value))
                    result[field].set(value, content);
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
