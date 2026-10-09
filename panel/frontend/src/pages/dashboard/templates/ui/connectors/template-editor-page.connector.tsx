import { SUBSCRIPTION_TEMPLATE_TYPE, TSubscriptionTemplateType } from '@remnawave/backend-contract'
import { Navigate, useParams } from 'react-router'

import { useGetHosts, useGetSubscriptionTemplate } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { TemplateEditorPageComponent } from '../components/template-editor-page.component.'

export function TemplateEditorPageConnector() {
    const { type, uuid } = useParams()
    const validType = [
        SUBSCRIPTION_TEMPLATE_TYPE.CLASH,
        SUBSCRIPTION_TEMPLATE_TYPE.MIHOMO,
        SUBSCRIPTION_TEMPLATE_TYPE.SINGBOX,
        SUBSCRIPTION_TEMPLATE_TYPE.STASH,
        SUBSCRIPTION_TEMPLATE_TYPE.XRAY_JSON
    ].some((value) => value === type)

    const subscriptionTemplateQuery = useGetSubscriptionTemplate({
        route: {
            uuid: uuid as string
        },
        rQueryParams: {
            enabled: !!uuid && validType
        }
    })

    const hostsQuery = useGetHosts({ rQueryParams: { enabled: !!uuid && validType } })

    const { data: template, isLoading: isTemplateLoading } = subscriptionTemplateQuery
    const { data: hosts, isLoading: isHostsLoading } = hostsQuery

    const pageQueries = [subscriptionTemplateQuery, hostsQuery]
    if (!validType || !uuid) return <Navigate to={ROUTES.DASHBOARD.HOME} replace />
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (isTemplateLoading || isHostsLoading || !template || !hosts) {
        return <LoadingScreen />
    }

    if (template.templateType !== type) return <Navigate to={ROUTES.DASHBOARD.HOME} replace />

    let title: string
    let editorType: 'json' | 'yaml'

    switch (type as TSubscriptionTemplateType) {
        case SUBSCRIPTION_TEMPLATE_TYPE.CLASH:
            title = 'Clash'
            editorType = 'yaml'
            break
        case SUBSCRIPTION_TEMPLATE_TYPE.MIHOMO:
            title = 'Mihomo'
            editorType = 'yaml'
            break
        case SUBSCRIPTION_TEMPLATE_TYPE.SINGBOX:
            title = 'Singbox'
            editorType = 'json'
            break
        case SUBSCRIPTION_TEMPLATE_TYPE.STASH:
            title = 'Stash'
            editorType = 'yaml'
            break
        case SUBSCRIPTION_TEMPLATE_TYPE.XRAY_JSON:
            title = 'Xray JSON'
            editorType = 'json'
            break
        default:
            return <Navigate to={ROUTES.DASHBOARD.HOME} replace />
    }

    return (
        <TemplateEditorPageComponent
            editorType={editorType}
            hosts={hosts}
            template={template}
            title={title}
        />
    )
}
