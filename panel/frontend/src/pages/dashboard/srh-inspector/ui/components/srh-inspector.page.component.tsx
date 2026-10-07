import { Stack } from '@mantine/core'
import { SrhInspectorMetrics } from '@widgets/dashboard/srh-inspector/srh-inspector-metrics'
import { SrhInspectorTableWidget } from '@widgets/dashboard/srh-inspector/srh-inspector-table'
import { useTranslation } from 'react-i18next'

import { Page } from '@shared/ui'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'

export default function SrhInspectorPageComponent() {
    const { t } = useTranslation()

    return (
        <Page title={t('constants.srh-inspector')}>
            <PageHeaderShared title={t('constants.srh-inspector')} />
            <Stack>
                <SrhInspectorMetrics />

                <div>
                    <SrhInspectorTableWidget />
                </div>
            </Stack>
        </Page>
    )
}
