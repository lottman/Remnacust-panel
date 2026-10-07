import { useEffect } from 'react'

import { useIsMobile } from '@shared/hooks'
import { HeaderControls } from '@shared/ui/header-buttons'
import { QuickLauncher } from '@shared/ui/quick-launcher'

import {
    useIsLoadingRemnawaveUpdates,
    useRemnawaveInfo,
    useUpdatesStoreActions
} from '@entities/dashboard/updates-store'

import { DASHBOARD_LINKS } from './layout-shared'
import { MobileLayout } from './layout-variants/mobile.layout'
import { SidebarLayout } from './layout-variants/sidebar.layout'
import { useQuickLauncherRoutes } from './menu-sections/use-quick-launcher-routes'

import '@shared/_modals/modal-registry'

export function MainLayout() {
    const isMobile = useIsMobile()

    const remnawaveInfo = useRemnawaveInfo()
    const isLoadingUpdates = useIsLoadingRemnawaveUpdates()
    const { getRemnawaveInfo } = useUpdatesStoreActions()
    useEffect(() => {
        void getRemnawaveInfo()
    }, [getRemnawaveInfo])
    const launcherRoutes = useQuickLauncherRoutes()

    const headerControls = (
        <HeaderControls
            {...DASHBOARD_LINKS}
            isGithubLoading={isLoadingUpdates}
            stars={remnawaveInfo.starsCount}
            withGithub
            withRecap
            withSupport
            withTelegram
        />
    )

    if (isMobile) {
        return (
            <MobileLayout
                headerControls={headerControls}
                isSocialButtons={isMobile}
                isLoadingUpdates={isLoadingUpdates}
                remnawaveInfo={remnawaveInfo}
            />
        )
    }

    return (
        <>
            <SidebarLayout headerControls={headerControls} />
            <QuickLauncher routes={launcherRoutes} />
        </>
    )
}
