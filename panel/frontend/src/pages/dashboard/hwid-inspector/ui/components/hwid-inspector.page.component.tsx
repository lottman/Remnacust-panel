import { Stack } from '@mantine/core'
import { HwidInspectorLeaderboardWidget } from '@widgets/dashboard/hwid-inspector/hwid-inspector-leaderboard'
import { HwidInspectorMetrics } from '@widgets/dashboard/hwid-inspector/hwid-inspector-metrics'
import { HwidInspectorTableWidget } from '@widgets/dashboard/hwid-inspector/hwid-inspector-table'
import { useTranslation } from 'react-i18next'

import { Page } from '@shared/ui'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'

export default function HwidInspectorPageComponent() {
    const { t } = useTranslation()

    return (
        <Page title={t('constants.hwid-inspector')}>
            <PageHeaderShared title={t('constants.hwid-inspector')} />
            <Stack>
                <HwidInspectorMetrics />

                <div>
                    <HwidInspectorLeaderboardWidget />
                </div>

                <div>
                    <HwidInspectorTableWidget />
                </div>
            </Stack>
        </Page>
    )
}
