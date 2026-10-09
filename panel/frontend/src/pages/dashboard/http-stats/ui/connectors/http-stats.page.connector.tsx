import { useGetHttpStats } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'
import { sToMs } from '@shared/utils/time-utils'

import HttpStatsPageComponent from '../components/http-stats.page.component'

export function HttpStatsPageConnector() {
    const httpStatsQuery = useGetHttpStats({
        rQueryParams: {
            refetchInterval: sToMs(5)
        }
    })

    const { data: httpStats, isLoading, refetch, isFetching } = httpStatsQuery

    const pageQueries = [httpStatsQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (isLoading || !httpStats) {
        return <LoadingScreen />
    }

    return (
        <HttpStatsPageComponent refetch={refetch} isFetching={isFetching} httpStats={httpStats} />
    )
}
