import {
    useGetConfigProfiles,
    useGetNodePlugins,
    useGetNodes,
    useGetNodesTags,
    useGetNodeSecretKey,
    useGetNodeIntegrations
} from '@shared/api/hooks'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import NodesPageComponent from '../components/nodes.page.component'

export function NodesPageConnector() {
    const nodesQuery = useGetNodes({ rQueryParams: { refetchOnMount: 'always' } })
    const nodePluginsQuery = useGetNodePlugins()
    const nodeIntegrationsQuery = useGetNodeIntegrations()
    const configProfilesQuery = useGetConfigProfiles()

    useGetNodeSecretKey()
    useGetNodesTags()

    const { data: nodes, isLoading } = nodesQuery
    const { data: nodePlugins } = nodePluginsQuery
    const { data: nodeIntegrations } = nodeIntegrationsQuery

    const pageQueries = [nodesQuery, nodePluginsQuery, nodeIntegrationsQuery, configProfilesQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    return (
        <NodesPageComponent
            isLoading={isLoading}
            nodes={nodes}
            nodePlugins={nodePlugins}
            nodeIntegrations={nodeIntegrations}
        />
    )
}
