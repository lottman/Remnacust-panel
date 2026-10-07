import { Stack } from '@mantine/core'
import { DesktopColumnsInfraBillingWidget } from '@widgets/dashboard/infra-billing/desktop-columns'
import { MobileInfraBillingWidget } from '@widgets/dashboard/infra-billing/mobile'
import { StatsWidget } from '@widgets/dashboard/infra-billing/stats-widget/stats.widget'
import { useTranslation } from 'react-i18next'

import { useIsMobile, usePreventTableBackScroll } from '@shared/hooks'
import { Page } from '@shared/ui/page'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'

export const InfraBillingPageComponent = () => {
    const { t } = useTranslation()
    const isMobile = useIsMobile()

    usePreventTableBackScroll()

    return (
        <Page title={t('constants.infra-billing')}>
            <PageHeaderShared title={t('constants.infra-billing')} />
            <div>
                {isMobile ? (
                    <MobileInfraBillingWidget />
                ) : (
                    <Stack>
                        <StatsWidget />

                        <DesktopColumnsInfraBillingWidget />
                    </Stack>
                )}
            </div>
        </Page>
    )
}
