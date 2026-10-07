import { Stack } from '@mantine/core'
import { SessionsExplorerWidget } from '@widgets/dashboard/sessions-explorer/sessions-explorer-widget'
import { useTranslation } from 'react-i18next'

import { Page } from '@shared/ui'

export default function SessionsExplorerPageComponent() {
    const { t } = useTranslation()

    return (
        <Page title={t('constants.sessions-explorer')}>
            <Stack>
                <div>
                    <SessionsExplorerWidget />
                </div>
            </Stack>
        </Page>
    )
}
