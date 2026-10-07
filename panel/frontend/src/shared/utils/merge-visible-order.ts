/** Replace only visible slots; records outside the active filter keep their positions. */
export function mergeVisibleOrder<T extends { uuid: string }>(all: T[], ordered: T[]): T[] {
    const ids = new Set(ordered.map(item => item.uuid))
    const existing = new Set(all.map(item => item.uuid))
    if (ids.size !== ordered.length || ordered.some(item => !existing.has(item.uuid))) return all
    let index = 0
    const byId = new Map(all.map(item => [item.uuid, item]))
    return all.map(item => ids.has(item.uuid) ? byId.get(ordered[index++].uuid)! : item)
}
