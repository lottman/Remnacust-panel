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
    const nodesQuery = useGetNodes()
    const nodePluginsQuery = useGetNodePlugins()
    const nodeIntegrationsQuery = useGetNodeIntegrations()
    const configProfilesQuery = useGetConfigProfiles()

    useGetNodeSecretKey()
    useGetNodesTags()

    const { data: nodes, isLoading } = nodesQuery
    const { data: nodePlugins, isLoading: isNodePluginsLoading } = nodePluginsQuery
    const { data: nodeIntegrations, isLoading: isNodeIntegrationsLoading } = nodeIntegrationsQuery
    const { isLoading: isConfigProfilesLoading } = configProfilesQuery

    const pageQueries = [nodesQuery, nodePluginsQuery, nodeIntegrationsQuery, configProfilesQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    return (
        <NodesPageComponent
            isLoading={
                isLoading ||
                isConfigProfilesLoading ||
                isNodePluginsLoading ||
                isNodeIntegrationsLoading ||
                !nodePlugins ||
                !nodeIntegrations
            }
            nodes={nodes}
            nodePlugins={nodePlugins}
            nodeIntegrations={nodeIntegrations}
        />
    )
}
