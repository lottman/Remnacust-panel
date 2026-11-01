import { Button, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { TbRefresh } from 'react-icons/tb'

import { usePanelUpdateStore } from '@entities/dashboard/panel-update/panel-update'
import { useRemnawaveInfo } from '@entities/dashboard/updates-store'

import classes from './panel-update.module.css'

export function PanelUpdateButton({ available }: { available: boolean }) {
    const { t } = useTranslation()
    const { latestVersion } = useRemnawaveInfo()
    const { status, starting, start } = usePanelUpdateStore()
    if (!available) return null
    const run = async () => {
        try {
            await start(latestVersion)
        } catch (error) {
            const autonomyPending = isAxiosError(error) && error.response?.data?.errorCode === 'NODE_CONTINUITY_NOT_READY'
            notifications.show({ color: 'red', message: t(autonomyPending ? 'panelUpdate.autonomyPending' : 'panelUpdate.startFailed') })
        }
    }
    return (
        <Stack gap={6} className={classes.appear}>
            <Button
                size="sm"
                radius="md"
                variant="default"
                leftSection={<TbRefresh size={16} />}
                disabled={!status?.available || status.active}
                loading={starting}
                onClick={run}
            >
                {t('panelUpdate.update', { version: latestVersion })}
            </Button>
            <Text size="xs" c="dimmed" ta="center">
                {t(status?.available ? 'panelUpdate.warning' : 'panelUpdate.setupRequired')}
            </Text>
        </Stack>
    )
}
