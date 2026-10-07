import { Stack } from '@mantine/core'
import { UsersMetrics } from '@widgets/dashboard/users/users-metrics'
import { UserTableWidget } from '@widgets/dashboard/users/users-table'
import { useTranslation } from 'react-i18next'

import { Page, PageHeaderShared } from '@shared/ui'

export default function UsersPageComponent() {
    const { t } = useTranslation()
    return (
        <Page title={t('constants.users')}>
            <PageHeaderShared title={t('constants.users')} />
            <Stack gap="lg">
                <UsersMetrics />
                <UserTableWidget />
            </Stack>
        </Page>
    )
}
