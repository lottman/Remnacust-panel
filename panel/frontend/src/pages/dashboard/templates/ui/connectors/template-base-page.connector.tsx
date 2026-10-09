import { SUBSCRIPTION_TEMPLATE_TYPE, TSubscriptionTemplateType } from '@remnawave/backend-contract'
import { Navigate, useParams } from 'react-router'

import { useGetSubscriptionTemplates } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { TemplateBasePageComponent } from '../components/template-base-page.component'

export function TemplateBasePageConnector() {
    const { type } = useParams()
    const validType = [
        SUBSCRIPTION_TEMPLATE_TYPE.CLASH,
        SUBSCRIPTION_TEMPLATE_TYPE.MIHOMO,
        SUBSCRIPTION_TEMPLATE_TYPE.SINGBOX,
        SUBSCRIPTION_TEMPLATE_TYPE.STASH,
        SUBSCRIPTION_TEMPLATE_TYPE.XRAY_JSON
    ].some((value) => value === type)

    const subscriptionTemplatesQuery = useGetSubscriptionTemplates({
        rQueryParams: { enabled: validType }
    })

    const { data: templates, isLoading: isTemplatesLoading } = subscriptionTemplatesQuery

    const pageQueries = [subscriptionTemplatesQuery]
    if (!validType) return <Navigate to={ROUTES.DASHBOARD.HOME} replace />
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (isTemplatesLoading || !templates) {
        return <LoadingScreen />
    }

    let title: string

    switch (type as TSubscriptionTemplateType) {
        case SUBSCRIPTION_TEMPLATE_TYPE.CLASH:
            title = 'Clash'
            break
        case SUBSCRIPTION_TEMPLATE_TYPE.MIHOMO:
            title = 'Mihomo'
            break
        case SUBSCRIPTION_TEMPLATE_TYPE.SINGBOX:
            title = 'Singbox'
            break
        case SUBSCRIPTION_TEMPLATE_TYPE.STASH:
            title = 'Stash'
            break
        case SUBSCRIPTION_TEMPLATE_TYPE.XRAY_JSON:
            title = 'Xray JSON'
            break
        default:
            return <Navigate to={ROUTES.DASHBOARD.HOME} replace />
    }

    return (
        <TemplateBasePageComponent
            templates={templates.templates.filter((template) => template.templateType === type)}
            title={title}
            type={type as TSubscriptionTemplateType}
        />
    )
}
