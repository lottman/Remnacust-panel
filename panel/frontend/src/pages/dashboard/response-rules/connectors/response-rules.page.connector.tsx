import { TSubscriptionTemplateType } from '@remnawave/backend-contract'

import { useGetSubscriptionSettings, useGetSubscriptionTemplates } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { ResponseRulesPageComponent } from '../components/response-rules.page.component'

export function ResponseRulesPageConnector() {
    const settingsQuery = useGetSubscriptionSettings()
    const templatesQuery = useGetSubscriptionTemplates({})
    const { data: subscriptionSettings, isLoading: isSubscriptionSettingsLoading } = settingsQuery
    const { data: templates, isLoading: isTemplatesLoading } = templatesQuery

    const pageQueries = [settingsQuery, templatesQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (
        isSubscriptionSettingsLoading ||
        !subscriptionSettings ||
        isTemplatesLoading ||
        !templates
    ) {
        return <LoadingScreen />
    }

    const groupedTemplates = templates.templates.reduce(
        (acc, template) => {
            if (!acc[template.templateType]) {
                acc[template.templateType] = []
            }
            acc[template.templateType].push(template.name)
            return acc
        },
        {} as Record<TSubscriptionTemplateType, string[]>
    )

    return (
        <ResponseRulesPageComponent
            groupedTemplates={groupedTemplates}
            responseRules={subscriptionSettings.responseRules}
            subscriptionSettingsUuid={subscriptionSettings.uuid}
        />
    )
}
