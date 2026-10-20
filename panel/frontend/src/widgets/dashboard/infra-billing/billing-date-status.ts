const DAY_MS = 86_400_000
export const BILLING_WARNING_DAYS = 7

export type BillingDateState = 'normal' | 'upcoming' | 'urgent' | 'today' | 'overdue' | 'unknown'

export function getBillingDateStatus(
    date: Date | string | null | undefined,
    now: Date = new Date()
): { state: BillingDateState; daysRemaining: number | null } {
    if (!date) return { state: 'unknown', daysRemaining: null }
    const target = new Date(date).getTime()
    if (!Number.isFinite(target) || !Number.isFinite(now.getTime())) {
        return { state: 'unknown', daysRemaining: null }
    }

    // Billing is a UTC calendar date, not an expiry timestamp at local midnight.
    const daysRemaining = Math.floor(target / DAY_MS) - Math.floor(now.getTime() / DAY_MS)
    const state =
        daysRemaining < 0
            ? 'overdue'
            : daysRemaining === 0
              ? 'today'
              : daysRemaining === 1
                ? 'urgent'
                : daysRemaining <= BILLING_WARNING_DAYS
                  ? 'upcoming'
                  : 'normal'
    return { state, daysRemaining }
}
