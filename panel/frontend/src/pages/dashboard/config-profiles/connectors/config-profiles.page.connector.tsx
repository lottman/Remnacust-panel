import { useGetConfigProfiles } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { ConfigPageComponent } from '../components/config-profiles.page.component'

export function ConfigProfilesPageConnector() {
    const configProfilesQuery = useGetConfigProfiles()

    const { data: configProfiles, isFetching, refetch } = configProfilesQuery

    const pageQueries = [configProfilesQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (!configProfiles) return <LoadingScreen />

    return (
        <ConfigPageComponent
            configProfiles={configProfiles.configProfiles}
            isRefreshing={isFetching}
            onRefresh={() => refetch()}
        />
    )
}
