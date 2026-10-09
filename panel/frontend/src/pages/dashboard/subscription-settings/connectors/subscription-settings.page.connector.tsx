import { useGetSubscriptionSettings } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui/loading-screen'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { SubscriptionSettingsPageComponent } from '../components'

export const SubscriptionSettingsConnector = () => {
    const subscriptionSettingsQuery = useGetSubscriptionSettings()

    const { data: subscriptionSettings } = subscriptionSettingsQuery

    const pageQueries = [subscriptionSettingsQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (!subscriptionSettings) {
        return <LoadingScreen />
    }

    return <SubscriptionSettingsPageComponent subscriptionSettings={subscriptionSettings} />
}
