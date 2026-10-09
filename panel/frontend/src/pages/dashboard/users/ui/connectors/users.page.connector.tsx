import {
    useGetExternalSquads,
    useGetInternalSquads,
    useGetNodes,
    useGetUserTags
} from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import UsersPageComponent from '../components/users.page.component'

export function UsersPageConnector() {
    const internalSquadsQuery = useGetInternalSquads()
    const externalSquadsQuery = useGetExternalSquads()
    const nodesQuery = useGetNodes()
    const userTagsQuery = useGetUserTags()

    const { isLoading: isInternalSquadsLoading } = internalSquadsQuery
    const { isLoading: isExternalSquadsLoading } = externalSquadsQuery
    const { isLoading: isNodesLoading } = nodesQuery
    const { isLoading: isTagsLoading } = userTagsQuery

    const pageQueries = [internalSquadsQuery, externalSquadsQuery, nodesQuery, userTagsQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (isInternalSquadsLoading || isExternalSquadsLoading || isNodesLoading || isTagsLoading) {
        return <LoadingScreen />
    }

    return <UsersPageComponent />
}
