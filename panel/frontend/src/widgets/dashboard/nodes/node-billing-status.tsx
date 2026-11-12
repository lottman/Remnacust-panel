import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { useGetInfraBillingNodes } from '@shared/api/hooks'

import { getBillingDateStatus } from '../infra-billing/billing-date-status'
import { useBillingToday } from '../infra-billing/use-billing-today'

const BillingStatusContext = createContext<ReadonlyMap<string, number>>(new Map())

export function NodeBillingStatusProvider({
    children,
    enabled
}: {
    children: ReactNode
    enabled: boolean
}) {
    const { data } = useGetInfraBillingNodes({ rQueryParams: { enabled, refetchInterval: 60_000 } })
    const today = useBillingToday()
    const todayMs = today.getTime()
    const statuses = useMemo(() => {
        const result = new Map<string, number>()
        for (const record of data?.billingNodes ?? []) {
            if (!record.nodeUuid) continue
            const days = getBillingDateStatus(record.nextBillingAt, new Date(todayMs)).daysRemaining
            if (days === null) continue
            const existing = result.get(record.nodeUuid)
            if (existing === undefined || days < existing) result.set(record.nodeUuid, days)
        }
        return result
    }, [data, todayMs])
    return (
        <BillingStatusContext.Provider value={statuses}>{children}</BillingStatusContext.Provider>
    )
}

export function useNodeBillingDays(nodeUuid: string) {
    return useContext(BillingStatusContext).get(nodeUuid)
}

export function nodeBillingWarning(days: number | undefined) {
    return days === undefined || !Number.isFinite(days) || days > 3
        ? null
        : days <= 1
          ? 'red'
          : 'yellow'
}
