import { useGetInternalSquads } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { InternalSquadsPageComponent } from '../components/internal-squads.page.component'

export function InternalSquadsPageConnector() {
    const internalSquadsQuery = useGetInternalSquads()

    const { data: internalSquads, isLoading: isInternalSquadsLoading } = internalSquadsQuery

    const pageQueries = [internalSquadsQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (isInternalSquadsLoading || !internalSquads) {
        return <LoadingScreen />
    }

    return <InternalSquadsPageComponent internalSquads={internalSquads.internalSquads} />
}
