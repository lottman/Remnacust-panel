import { editTemplate, parseTemplate, type JsonObject } from './autoselect-model'

export type Assignment = JsonObject & { hosts?: string[]; tags?: string[]; balancerTag?: string }

export function assignmentMode(assignment?: Assignment): 'hosts' | 'tags' | 'mixed' | undefined {
    const hosts = !!assignment?.hosts?.length
    const tags = !!assignment?.tags?.length
    return hosts && tags ? 'mixed' : hosts ? 'hosts' : tags ? 'tags' : undefined
}

export function templateAssignments(config: JsonObject): Assignment[] {
    return [
        ...(config.remnawave?.assignments ?? []),
        ...(config.remnawave?.assignTo ? [config.remnawave.assignTo] : [])
    ]
}

export function assignmentFor(config: JsonObject, tag: string): Assignment | undefined {
    const rows = templateAssignments(config)
    return (
        rows.find((row) => row.balancerTag === tag) ??
        (config.routing?.balancers?.length === 1 && rows.length === 1
            ? rows.find((row) => !row.balancerTag)
            : undefined)
    )
}

export function setAssignment(
    text: string,
    tag: string,
    field: 'hosts' | 'tags',
    values: string[]
): string {
    const config = parseTemplate(text)
    if (!config.routing?.balancers?.some((balance: JsonObject) => balance.tag === tag))
        throw new Error('balancer-missing')
    const rows = templateAssignments(config)
    const current = assignmentFor(config, tag)
    const replacement = { ...current, balancerTag: tag, [field]: [...new Set(values)] }
    delete replacement[field === 'hosts' ? 'tags' : 'hosts']
    const next = rows.filter((row) => row !== current)
    if ((replacement.hosts?.length ?? 0) || (replacement.tags?.length ?? 0)) {
        // Preserve assignment precedence when editing a row in place.
        next.splice(current ? rows.indexOf(current) : next.length, 0, replacement)
    }
    return writeAssignments(text, next, config.remnawave?.assignTo)
}

export function bindLegacyAssignment(text: string, index: number, tag: string): string {
    const config = parseTemplate(text),
        rows = templateAssignments(config)
    if (
        !rows[index] ||
        config.routing?.balancers?.some(
            (balance: JsonObject) => balance.tag === rows[index].balancerTag
        ) ||
        !config.routing?.balancers?.some((balance: JsonObject) => balance.tag === tag)
    )
        throw new Error('assignment-target')
    const target = rows.find((row) => row.balancerTag === tag)
    if (target) {
        const legacy = rows[index]
        return writeAssignments(
            text,
            rows
                .filter((_, i) => i !== index)
                .map((row) =>
                    row === target
                        ? {
                              ...legacy,
                              ...target,
                              hosts: [
                                  ...new Set([...(target.hosts ?? []), ...(legacy.hosts ?? [])])
                              ],
                              tags: [...new Set([...(target.tags ?? []), ...(legacy.tags ?? [])])]
                          }
                        : row
                ),
            config.remnawave?.assignTo
        )
    }
    return writeAssignments(
        text,
        rows.map((row, i) => (i === index ? { ...row, balancerTag: tag } : row)),
        config.remnawave?.assignTo
    )
}

function writeAssignments(text: string, rows: Assignment[], originalLegacy?: Assignment): string {
    // An untouched assignTo is still a valid whole-template assignment. Moving
    // it into assignments before a target is chosen would invalidate the draft.
    const retainLegacy = originalLegacy && rows.includes(originalLegacy)
    const canonical = retainLegacy ? rows.filter((row) => row !== originalLegacy) : rows
    return editTemplate(
        retainLegacy ? text : editTemplate(text, ['remnawave', 'assignTo'], undefined),
        ['remnawave', 'assignments'],
        canonical.length ? canonical : undefined
    )
}
