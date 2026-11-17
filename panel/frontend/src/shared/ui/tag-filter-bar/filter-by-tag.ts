export const NO_TAG = '__no_tag__'

export function filterByTag<T extends { tags?: null | string[] }>(
    items: T[],
    activeTag: null | string
): T[] {
    if (activeTag === null) return items
    if (activeTag === NO_TAG) return items.filter((item) => (item.tags ?? []).length === 0)
    return items.filter((item) => (item.tags ?? []).includes(activeTag))
}
