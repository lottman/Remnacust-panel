export type UsageSeries = {
    uuid?: string
    name: string
    color: string
    countryCode: string
    data: number[]
}

export type UsageSegment = { node: number; start: number; end: number }
export type UsageRow = { day: number; total: number; segments: UsageSegment[] }

export const usageValue = (value: number | undefined) =>
    value !== undefined && Number.isFinite(value) && value > 0 ? value : 0

export function createUsageRows(dayCount: number, series: UsageSeries[], hidden: Set<number>) {
    const rows: UsageRow[] = []
    let max = 0
    for (let day = dayCount - 1; day >= 0; day--) {
        let total = 0
        const segments: UsageSegment[] = []
        for (let node = 0; node < series.length; node++) {
            if (hidden.has(node)) continue
            const value = usageValue(series[node].data[day])
            if (value === 0) continue
            segments.push({ node, start: total, end: total + value })
            total += value
        }
        max = Math.max(max, total)
        rows.push({ day, total, segments })
    }
    return { rows, max: max || 1 }
}

export function findUsageSegment(row: UsageRow | undefined, value: number) {
    if (!row || !Number.isFinite(value) || value < 0 || value >= row.total) return undefined
    let low = 0
    let high = row.segments.length - 1
    while (low <= high) {
        const middle = (low + high) >>> 1
        const segment = row.segments[middle]
        if (value < segment.start) high = middle - 1
        else if (value >= segment.end) low = middle + 1
        else return segment
    }
    return undefined
}
