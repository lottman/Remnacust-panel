import { useGetSubpageConfigs } from '@shared/api/hooks'
import { LoadingScreen } from '@shared/ui'
import { hasPageQueryError, PageQueryError } from '@shared/ui/page-query-error'

import { SubpageConfigBasePageComponent } from '../components/subpage-config-base-page.component'

export function SubpageConfigBasePageConnector() {
    const subpageConfigsQuery = useGetSubpageConfigs({})

    const { data: subpageConfigs, isLoading: isSubpageConfigsLoading } = subpageConfigsQuery

    const pageQueries = [subpageConfigsQuery]
    if (hasPageQueryError(pageQueries)) return <PageQueryError queries={pageQueries} />

    if (isSubpageConfigsLoading || !subpageConfigs) {
        return <LoadingScreen />
    }

    return <SubpageConfigBasePageComponent configs={subpageConfigs.configs} />
}
