export function userColumnBounds(id: string) {
    if (id.startsWith('mrt-')) return { minSize: 48, maxSize: 64, size: 52 }
    if (id === 'id') return { minSize: 120, maxSize: 200, size: 136 }
    if (id === 'username') return { minSize: 180, maxSize: 320, size: 220 }
    if (['shortUuid', 'vlessUuid', 'trojanPassword', 'description'].includes(id))
        return { minSize: 240, maxSize: 560, size: 400 }
    if (id === 'trafficLimitBytes') return { minSize: 230, maxSize: 440, size: 260 }
    if (id === 'usedTrafficBytes') return { minSize: 220, maxSize: 480, size: 300 }
    return { minSize: 180, maxSize: 440, size: 220 }
}

export function normalizeUserColumnSizing(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
        Object.entries(value).flatMap(([id, width]) => {
            if (typeof width !== 'number' || !Number.isFinite(width)) return []
            const { minSize, maxSize } = userColumnBounds(id)
            return [[id, Math.max(minSize, Math.min(maxSize, width))]]
        })
    )
}
