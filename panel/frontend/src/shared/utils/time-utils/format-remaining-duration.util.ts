import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export function formatRemainingDurationUtil(remainingMs: number, locale: string): string {
    const duration = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0
    // A paused duration has no wall-clock date; use a fixed origin for both ends.
    return dayjs(duration).locale(locale).from(0, true)
}
