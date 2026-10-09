import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router'

import { useGetSubscriptionPageConfig } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { SubpageConfigEditorPageComponent } from '../components/subpage-config-editor-page.component'

export function SubpageConfigEditorPageConnector() {
    const { uuid } = useParams()
    const { t } = useTranslation()

    const subscriptionPageConfigQuery = useGetSubscriptionPageConfig({
        route: {
            uuid: uuid as string
        },
        rQueryParams: {
            enabled: !!uuid
        }
    })

    const { data: config, isLoading: isConfigLoading } = subscriptionPageConfigQuery

    const pageQueries = [subscriptionPageConfigQuery]
    if (!uuid) return <Navigate to={ROUTES.DASHBOARD.HOME} replace />
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (isConfigLoading || !config) {
        return <LoadingScreen text={t('common.message.loading')} />
    }

    return <SubpageConfigEditorPageComponent config={config} />
}
