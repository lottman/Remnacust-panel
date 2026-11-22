import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'

import {
    useGetConfigProfiles,
    useGetNodePlugins,
    useGetNodes,
    useGetNodeIntegrations
} from '@shared/api/hooks'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import NodesPageComponent from '../components/nodes.page.component'

export function NodesPageConnector() {
    const { t } = useTranslation()
    const nodesQuery = useGetNodes({ rQueryParams: { refetchOnMount: 'always' } })
    const nodePluginsQuery = useGetNodePlugins()
    const nodeIntegrationsQuery = useGetNodeIntegrations()
    const configProfilesQuery = useGetConfigProfiles()

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
            onRefresh={async () => {
                const results = await Promise.allSettled(
                    pageQueries.map((query) => query.refetch({ cancelRefetch: false }))
                )
                if (
                    results.every(
                        (result) => result.status === 'fulfilled' && result.value.isSuccess
                    )
                ) {
                    notifications.show({
                        id: 'nodes-refresh',
                        message: t('nodesRefresh.completed'),
                        color: 'teal'
                    })
                }
            }}
        />
    )
}
