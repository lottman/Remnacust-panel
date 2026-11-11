const formats = new Map<string, Intl.NumberFormat>()

export function formatRemainingDurationUtil(remainingMs: number, locale: string): string {
    const duration = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0
    let format = formats.get(locale)
    if (!format) {
        format = new Intl.NumberFormat(locale, {
            style: 'unit',
            unit: 'day',
            unitDisplay: 'long',
            useGrouping: false
        })
        if (formats.size >= 8) formats.clear()
        formats.set(locale, format)
    }
    return format.format(Math.ceil(duration / 86_400_000))
}
