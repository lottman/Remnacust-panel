import HostsPageComponent from '@pages/dashboard/hosts/ui/components/hosts.page.component'

import {
    useGetConfigProfiles,
    useGetHosts,
    useGetHostTags,
    useGetInternalSquads,
    useGetNodes,
    useGetSubscriptionTemplates
} from '@shared/api/hooks'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

export function HostsPageConnector() {
    const hostsQuery = useGetHosts()
    const internalSquadsQuery = useGetInternalSquads()
    const configProfilesQuery = useGetConfigProfiles()
    const hostTagsQuery = useGetHostTags()
    const nodesQuery = useGetNodes()
    const subscriptionTemplatesQuery = useGetSubscriptionTemplates()

    const { data: hosts, isLoading: isHostsLoading } = hostsQuery
    const { isLoading: isInternalSquadsLoading } = internalSquadsQuery
    const { data: configProfiles, isLoading: isConfigProfilesLoading } = configProfilesQuery
    const { data: hostTags, isLoading: isHostTagsLoading } = hostTagsQuery
    const { isLoading: isNodesLoading } = nodesQuery
    const { isLoading: isSubscriptionTemplatesLoading } = subscriptionTemplatesQuery

    const pageQueries = [
        hostsQuery,
        internalSquadsQuery,
        configProfilesQuery,
        hostTagsQuery,
        nodesQuery,
        subscriptionTemplatesQuery
    ]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    return (
        <HostsPageComponent
            configProfiles={configProfiles?.configProfiles}
            hosts={hosts}
            hostTags={hostTags?.tags}
            isLoading={
                isConfigProfilesLoading ||
                isHostsLoading ||
                isHostTagsLoading ||
                isNodesLoading ||
                isSubscriptionTemplatesLoading ||
                isInternalSquadsLoading
            }
        />
    )
}
