import { AppShell, Center, Group, GroupProps, Loader } from '@mantine/core'
import { Suspense } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'

import { DisclaimerGuard } from '@shared/hocs/guards/disclaimer-guard'
import { DisclaimerOverlay } from '@shared/ui/disclaimer-overlay'
import { SidebarLogoShared } from '@shared/ui/sidebar'
import { SidebarTitleShared } from '@shared/ui/sidebar/sidebar-title'

export const DASHBOARD_LINKS = {
    githubLink: 'https://github.com/lottman',
    telegramLink: 'https://t.me/lottman'
} as const

type LayoutMainProps = Omit<React.ComponentProps<typeof AppShell.Main>, 'children'>

export const LayoutMain = (props: LayoutMainProps) => (
    <AppShell.Main {...props}>
        <DisclaimerGuard>
            <Suspense
                fallback={
                    <Center mih="50vh">
                        <Loader />
                    </Center>
                }
            >
                <Outlet />
            </Suspense>
        </DisclaimerGuard>
        <DisclaimerOverlay />
        <ScrollRestoration />
    </AppShell.Main>
)

export const LayoutBrand = (props: GroupProps) => (
    <Group {...props}>
        <SidebarLogoShared />
        <SidebarTitleShared />
    </Group>
)
