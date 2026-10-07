import { Alert, Button, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import { useGetBackups, useGetBackupSettings } from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { LoadingScreen, Page } from '@shared/ui'

import { BackupAccess } from '../ui/backup-access'
import { BackupsPageComponent } from '../ui/backups.page.component'

export function BackupsPageConnector() {
    const uiText = useUiText()

    return (
        <Page title={uiText('backups-3334fee')}>
            <BackupAccess>{(lock) => <UnlockedBackups lock={lock} />}</BackupAccess>
        </Page>
    )
}

function UnlockedBackups({ lock }: { lock: () => void }) {
    const { t } = useTranslation()
    const backupsQuery = useGetBackups({})
    const settingsQuery = useGetBackupSettings({})
    const { data: backups, isLoading: isBackupsLoading } = backupsQuery
    const { data: settings, isLoading: isSettingsLoading } = settingsQuery

    if (backupsQuery.isError || settingsQuery.isError) {
        return (
            <Stack gap="sm">
                <Alert color="red">{t('common.message.unknown-error')}</Alert>
                <Button
                    loading={backupsQuery.isFetching || settingsQuery.isFetching}
                    onClick={() =>
                        void Promise.all([backupsQuery.refetch(), settingsQuery.refetch()])
                    }
                    w="fit-content"
                >
                    {t('common.action.try-again')}
                </Button>
            </Stack>
        )
    }

    if (isBackupsLoading || !backups || isSettingsLoading || !settings) {
        return <LoadingScreen />
    }

    return <BackupsPageComponent onLock={lock} backups={backups.backups} settings={settings} />
}
