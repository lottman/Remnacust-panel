import { useDisclosure, useHotkeys } from '@mantine/hooks'
import { useEffect } from 'react'
import { useLocation } from 'react-router'

import { IRemnawaveInfo } from '@entities/dashboard/updates-store'

import { SidebarShellLayout } from './sidebar-shell.layout'

interface IProps {
    headerControls: React.ReactNode
    isLoadingUpdates: boolean
    isSocialButtons: boolean
    remnawaveInfo: IRemnawaveInfo
}
export const MobileLayout = ({ headerControls }: IProps) => {
    const [opened, { toggle, close }] = useDisclosure()
    const { pathname } = useLocation()
    useHotkeys([['Escape', close]])
    useEffect(() => {
        close()
    }, [pathname, close])
    return (
        <SidebarShellLayout
            closedSide="mobile"
            headerControls={headerControls}
            onNavClose={close}
            opened={opened}
            padding="md"
            toggle={toggle}
        />
    )
}
