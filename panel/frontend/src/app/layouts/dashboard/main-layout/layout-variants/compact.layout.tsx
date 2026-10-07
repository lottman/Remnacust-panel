import { AppShell, Group, Divider } from '@mantine/core'

import { LayoutBrand, LayoutMain } from '../layout-shared'
import classes from '../layout.module.css'
import { DesktopNavigation } from '../navbar/desktop-navigation.layout'

interface IProps {
    headerControls: React.ReactNode
    isHiResDesktop: boolean
}

export const CompactLayout = (props: IProps) => {
    const { headerControls, isHiResDesktop } = props

    return (
        <AppShell
            className={classes.appShellFadeIn}
            header={{ height: isHiResDesktop ? 64 : 116, offset: false }}
            padding="xl"
        >
            <AppShell.Header
                className={classes.header}
                style={{
                    insetInlineStart: isHiResDesktop ? '10vw' : 'var(--app-shell-padding)',
                    insetInlineEnd: isHiResDesktop ? '10vw' : 'var(--app-shell-padding)',
                    top: 'calc(12px + env(safe-area-inset-top, 0px))',
                    width: 'auto'
                }}
                withBorder={false}
            >
                <div className={classes.brandRow}>
                    <Group align="stretch" gap="xs" h="100%" style={{ minWidth: 0 }} wrap="nowrap">
                        <LayoutBrand gap="xs" style={{ flexShrink: 0 }} wrap="nowrap" />

                        {isHiResDesktop && (
                            <>
                                <Divider
                                    h="50%"
                                    orientation="vertical"
                                    style={{
                                        alignSelf: 'center',
                                        marginLeft: '10px',
                                        marginRight: '10px'
                                    }}
                                />

                                <DesktopNavigation />
                            </>
                        )}
                    </Group>

                    <Group className={classes.headerControls} gap="xs" wrap="nowrap">
                        {headerControls}
                    </Group>
                </div>
                {!isHiResDesktop && (
                    <div className={classes.navRowDesktop}>
                        <DesktopNavigation />
                    </div>
                )}
            </AppShell.Header>

            <LayoutMain
                pl={isHiResDesktop ? '10vw' : undefined}
                pr={isHiResDesktop ? '10vw' : undefined}
                pt="calc(var(--app-shell-header-height) + 24px + env(safe-area-inset-top, 0px))"
            />
        </AppShell>
    )
}
