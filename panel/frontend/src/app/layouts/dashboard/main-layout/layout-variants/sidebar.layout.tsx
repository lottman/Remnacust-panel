import { useDisclosure, useHotkeys } from '@mantine/hooks'
import { useEffect } from 'react'
import { useLocation } from 'react-router'

import { SidebarShellLayout } from './sidebar-shell.layout'

interface IProps {
    headerControls: React.ReactNode
    mobile?: boolean
}

export const SidebarLayout = (props: IProps) => {
    const { headerControls, mobile = false } = props

    const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true)
    const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure()
    const { pathname } = useLocation()
    useHotkeys(mobile && mobileOpened ? [['Escape', closeMobile]] : [])
    useEffect(() => {
        closeMobile()
    }, [pathname, mobile, closeMobile])

    return (
        <SidebarShellLayout
            closedSide={mobile ? 'mobile' : 'desktop'}
            headerControls={headerControls}
            onNavClose={mobile ? closeMobile : undefined}
            opened={mobile ? mobileOpened : desktopOpened}
            padding={mobile ? 'md' : 'xl'}
            toggle={mobile ? toggleMobile : toggleDesktop}
            withFadeIn={!mobile}
        />
    )
}
