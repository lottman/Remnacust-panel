import {
    useGetExternalSquads,
    useGetSubpageConfigs,
    useGetSubscriptionTemplates
} from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { ExternalSquadsPageComponent } from '../components/external-squads.page.component'

export function ExternalSquadsPageConnector() {
    const externalSquadsQuery = useGetExternalSquads()
    const subscriptionTemplatesQuery = useGetSubscriptionTemplates()
    const subpageConfigsQuery = useGetSubpageConfigs()

    const { data: externalSquads, isLoading: isExternalSquadsLoading } = externalSquadsQuery
    const { isLoading: isTemplatesLoading } = subscriptionTemplatesQuery
    const { isLoading: isSubpageConfigsLoading } = subpageConfigsQuery

    const pageQueries = [externalSquadsQuery, subscriptionTemplatesQuery, subpageConfigsQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (
        isExternalSquadsLoading ||
        !externalSquads ||
        isTemplatesLoading ||
        isSubpageConfigsLoading
    ) {
        return <LoadingScreen />
    }
    return <ExternalSquadsPageComponent externalSquads={externalSquads.externalSquads} />
}
