import { useGetApiTokens, useGetRemnawaveSettings, useGetScopes } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui/loading-screen'

import { RemnawaveSettingsPageComponent } from '../components'

export const RemnawaveSettingsConnector = () => {
    const { data: remnawaveSettings, isLoading: isRemnawaveSettingsLoading } =
        useGetRemnawaveSettings()
    const { data: apiTokensData, isLoading: isApiTokensLoading } = useGetApiTokens()
    const { data: scopes, isLoading: isScopesLoading } = useGetScopes()

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
