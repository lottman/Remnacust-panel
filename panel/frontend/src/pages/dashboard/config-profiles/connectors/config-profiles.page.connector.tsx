import { useGetConfigProfiles, useGetSnippets } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { ConfigPageComponent } from '../components/config-profiles.page.component'

export function ConfigProfilesPageConnector() {
    const configProfilesQuery = useGetConfigProfiles()
    const snippetsQuery = useGetSnippets({})

    const { data: configProfiles, isLoading: isConfigProfilesLoading } = configProfilesQuery
    const { data: snippets, isLoading: isSnippetsLoading } = snippetsQuery

    const pageQueries = [configProfilesQuery, snippetsQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (isConfigProfilesLoading || isSnippetsLoading || !configProfiles || !snippets) {
        return <LoadingScreen />
    }

    return <ConfigPageComponent configProfiles={configProfiles.configProfiles} />
}
