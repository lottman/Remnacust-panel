export type NodeTarget = { uuid: string; name: string; tags?: string[] | null }
export type SelectionMode = 'all' | 'tag' | 'untagged' | 'selected'

export function selectNodeTargets<T extends NodeTarget>(
    nodes: T[],
    mode: SelectionMode,
    tag: string | null,
    ids: string[]
): T[] {
    const wanted = new Set(ids)
    return [
        ...new Map(
            nodes
                .filter(
                    (node) =>
                        mode === 'all' ||
                        (mode === 'untagged' && !node.tags?.length) ||
                        (mode === 'tag' && tag !== null && node.tags?.includes(tag)) ||
                        (mode === 'selected' && wanted.has(node.uuid))
                )
                .map((node) => [node.uuid, node])
        ).values()
    ]
}
