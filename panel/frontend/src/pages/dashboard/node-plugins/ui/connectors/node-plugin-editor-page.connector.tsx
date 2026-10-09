import { Navigate, useParams } from 'react-router'

import { useGetNodePlugin } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { NodePluginEditorPageComponent } from '../components/node-plugin-editor-page.component'

export function NodePluginEditorPageConnector() {
    const { uuid } = useParams()

    const nodePluginQuery = useGetNodePlugin({
        route: {
            uuid: uuid as string
        },
        rQueryParams: {
            enabled: !!uuid
        }
    })

    const { data: plugin, isLoading: isPluginLoading } = nodePluginQuery

    const pageQueries = [nodePluginQuery]
    if (!uuid) return <Navigate to={ROUTES.DASHBOARD.HOME} replace />
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (isPluginLoading || !plugin) {
        return <LoadingScreen />
    }

    return <NodePluginEditorPageComponent plugin={plugin} />
}
