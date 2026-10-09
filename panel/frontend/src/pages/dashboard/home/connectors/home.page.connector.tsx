import { HomePage } from '@pages/dashboard/home/components'

import { useGetBandwidthStats, useGetRemnawaveHealth, useGetSystemStats } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui/loading-screen'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

export const HomePageConnector = () => {
    const systemStatsQuery = useGetSystemStats()
    const bandwidthStatsQuery = useGetBandwidthStats()
    const remnawaveHealthQuery = useGetRemnawaveHealth()

    const { data: systemInfo } = systemStatsQuery
    const { data: bandwidthStats } = bandwidthStatsQuery
    const { data: remnawaveHealth } = remnawaveHealthQuery

    const pageQueries = [systemStatsQuery, bandwidthStatsQuery, remnawaveHealthQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (!systemInfo || !bandwidthStats || !remnawaveHealth) {
        return <LoadingScreen />
    }

    return (
        <HomePage
            bandwidthStats={bandwidthStats}
            remnawaveHealth={remnawaveHealth}
            systemInfo={systemInfo}
        />
    )
}
