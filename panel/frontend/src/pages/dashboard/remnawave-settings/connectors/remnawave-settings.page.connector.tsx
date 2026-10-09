import { useGetApiTokens, useGetRemnawaveSettings, useGetScopes } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui/loading-screen'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { RemnawaveSettingsPageComponent } from '../components'

export const RemnawaveSettingsConnector = () => {
    const remnawaveSettingsQuery = useGetRemnawaveSettings()
    const apiTokensQuery = useGetApiTokens()
    const scopesQuery = useGetScopes()

    const { data: remnawaveSettings, isLoading: isRemnawaveSettingsLoading } =
        remnawaveSettingsQuery
    const { data: apiTokensData, isLoading: isApiTokensLoading } = apiTokensQuery
    const { data: scopes, isLoading: isScopesLoading } = scopesQuery

    const pageQueries = [remnawaveSettingsQuery, apiTokensQuery, scopesQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (
        isRemnawaveSettingsLoading ||
        isApiTokensLoading ||
        isScopesLoading ||
        !remnawaveSettings ||
        !apiTokensData ||
        !scopes
    ) {
        return <LoadingScreen />
    }

    return (
        <RemnawaveSettingsPageComponent
            apiTokensData={apiTokensData}
            remnawaveSettings={remnawaveSettings}
        />
    )
}
