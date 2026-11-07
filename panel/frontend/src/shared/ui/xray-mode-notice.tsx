import { Anchor, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useXrayMode } from '@shared/api/hooks/xray-mode'
import { ROUTES } from '@shared/constants'

export function XrayModeNotice() {
    const { isCustom, isPending, isError } = useXrayMode()
    const { t } = useTranslation()
    if (isCustom || isPending) return null
    return (
        <Text size="sm" c="dimmed">
            {t(`xray-settings.${isError ? 'read-error' : 'requires-custom'}` as never)} ·{' '}
            <Anchor component={Link} to={ROUTES.DASHBOARD.MANAGEMENT.XRAY_SETTINGS} size="sm">
                {t('xray-settings.configure' as never)}
            </Anchor>
        </Text>
    )
}
