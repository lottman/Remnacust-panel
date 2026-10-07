import { Stack } from '@mantine/core'
import { TorrentBlockerReportsTableWidget } from '@widgets/dashboard/torrent-blocker-reports/torrent-blocker-reports-table'
import { TorrentBlockerStatsWidget } from '@widgets/dashboard/torrent-blocker-reports/torrent-blocker-stats'
import { useTranslation } from 'react-i18next'

import { Page } from '@shared/ui'

export default function TorrentBlockerReportsPageComponent() {
    const { t } = useTranslation()

    return (
        <Page title={t('constants.tb-reports')}>
            <Stack>
                <TorrentBlockerStatsWidget />

                <div>
                    <TorrentBlockerReportsTableWidget />
                </div>
            </Stack>
        </Page>
    )
}
