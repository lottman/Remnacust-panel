import { useGetNodePlugins, useGetNodes } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { NodePluginsBasePageComponent } from '../components/node-plugins-base-page.component'

export function NodePluginsBasePageConnector() {
    const nodePluginsQuery = useGetNodePlugins({})
    const nodesQuery = useGetNodes()

    const { data: plugins, isLoading: isPluginsLoading } = nodePluginsQuery
    const { data: nodes, isLoading: isNodesLoading } = nodesQuery

    const pageQueries = [nodePluginsQuery, nodesQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (isPluginsLoading || isNodesLoading || !plugins || !nodes) {
        return <LoadingScreen />
    }

    return <NodePluginsBasePageComponent nodes={nodes} plugins={plugins.nodePlugins} />
}
