export const hasNodeMetric = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
