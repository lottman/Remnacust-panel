import {
    AppShell,
    Burger,
    CloseButton,
    FocusTrap,
    Group,
    ScrollArea,
    Text,
    Transition
} from '@mantine/core'
import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { TbChevronRight } from 'react-icons/tb'
import { Link, useLocation } from 'react-router'

import { ROUTES } from '@shared/constants'
import { useUiText } from '@shared/i18n/interface-text'
import { usePanelReducedMotion } from '@shared/ui/appearance/appearance'

import { LayoutBrand, LayoutMain } from '../layout-shared'
import classes from '../layout.module.css'
import { useMobileMenuSections } from '../menu-sections/mobile-menu-sections'
import { MobileNavigation } from '../navbar/mobile-navigation.layout'

interface IProps {
    closedSide: 'desktop' | 'mobile'
    footer?: React.ReactNode
    headerControls: React.ReactNode
    navbarRef?: React.Ref<HTMLDivElement>
    onNavClose?: () => void
    opened: boolean
    padding: string
    withFadeIn?: boolean
    toggle: () => void
}

export const SidebarShellLayout = ({
    closedSide,
    footer,
    headerControls,
    navbarRef,
    onNavClose,
    opened,
    padding,
    toggle
}: IProps) => {
    const uiText = useUiText()
    const { t } = useTranslation()
    const reducedMotion = usePanelReducedMotion()
    const mobile = closedSide === 'mobile'
    const { pathname } = useLocation()
    const sections = useMobileMenuSections()
    const entries = sections.flatMap((section) =>
        section.section.flatMap((item) => [
            { ...item, section: section.header },
            ...(item.dropdownItems ?? []).map((child) => ({ ...child, section: item.name }))
        ])
    )
    const current = entries
        .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
        .sort((a, b) => b.href.length - a.href.length)[0]
    const currentTitle =
        pathname === ROUTES.DASHBOARD.SUPPORT
            ? t('project-support.title')
            : (current?.name ?? t('constants.home'))
    const triggerRef = useRef<HTMLButtonElement>(null)
    const wasOpened = useRef(opened)
    useEffect(() => {
        if (mobile && wasOpened.current && !opened) triggerRef.current?.focus()
        wasOpened.current = opened
    }, [mobile, opened])
    useEffect(() => {
        if (!mobile || !opened) return
        const overflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = overflow
        }
    }, [mobile, opened])

    return (
        <AppShell
            header={{ height: 'calc(68px + env(safe-area-inset-top, 0px))', offset: false }}
            layout="alt"
            navbar={{
                width: 248,
                breakpoint: 'lg',
                collapsed: mobile
                    ? { mobile: !opened, desktop: true }
                    : { mobile: false, desktop: !opened }
            }}
            padding={padding}
            transitionDuration={reducedMotion ? 0 : 240}
            transitionTimingFunction="cubic-bezier(0.2, 0.8, 0.2, 1)"
        >
            <a className={classes.skipLink} href="#panel-main">
                {t('design-ui.skip-navigation')}
            </a>
            <AppShell.Header className={classes.header} withBorder={false}>
                <Group
                    className={classes.headerInner}
                    justify="space-between"
                    wrap="nowrap"
                    gap="sm"
                >
                    <Group className={classes.headerContext} wrap="nowrap" gap="sm">
                        <Burger
                            className={classes.menuTrigger}
                            aria-controls="panel-navigation"
                            aria-expanded={opened}
                            aria-label={uiText('navigation-3db65f8')}
                            onClick={toggle}
                            opened={mobile && opened}
                            ref={triggerRef}
                            size="sm"
                        />
                        <Group
                            className={classes.breadcrumb}
                            gap={8}
                            wrap="nowrap"
                            aria-label={uiText('navigation-3db65f8')}
                        >
                            <Text component={Link} to={ROUTES.DASHBOARD.HOME} size="sm" c="dimmed">
                                {t('constants.home')}
                            </Text>
                            <TbChevronRight size={14} aria-hidden />
                            <Text size="sm" fw={600} truncate>
                                {currentTitle}
                            </Text>
                        </Group>
                    </Group>
                    <Group className={classes.headerControls} wrap="nowrap" gap={6}>
                        {headerControls}
                    </Group>
                </Group>
            </AppShell.Header>
            <Transition
                mounted={mobile && opened}
                transition="fade"
                duration={reducedMotion ? 0 : 200}
                exitDuration={reducedMotion ? 0 : 160}
            >
                {(styles) => (
                    <button
                        className={classes.backdrop}
                        style={styles}
                        inert={!opened}
                        onClick={onNavClose ?? toggle}
                        aria-label={uiText('close-navigation-99904db')}
                        tabIndex={-1}
                    />
                )}
            </Transition>
            <FocusTrap active={mobile && opened}>
                <AppShell.Navbar
                    id="panel-navigation"
                    aria-hidden={!opened}
                    inert={!opened}
                    className={clsx(classes.sidebarWrapper, { [classes.sidebarClosed]: !opened })}
                    p={0}
                    ref={navbarRef}
                    w="min(248px, calc(100vw - 48px))"
                    withBorder={false}
                >
                    <AppShell.Section className={classes.logoSection}>
                        <LayoutBrand className={classes.brandContent} gap={10} wrap="nowrap" />
                        <CloseButton
                            aria-label={uiText('close-navigation-99904db')}
                            onClick={onNavClose ?? toggle}
                            className={classes.brandClose}
                            size={44}
                        />
                    </AppShell.Section>
                    <AppShell.Section
                        component={ScrollArea}
                        className={classes.scrollArea}
                        flex={1}
                        scrollbarSize={4}
                    >
                        <MobileNavigation onClose={onNavClose} />
                    </AppShell.Section>
                    {footer && (
                        <AppShell.Section className={classes.footerSection}>
                            {footer}
                        </AppShell.Section>
                    )}
                </AppShell.Navbar>
            </FocusTrap>
            <LayoutMain
                id="panel-main"
                tabIndex={-1}
                inert={mobile && opened}
                className={classes.main}
                pb="xl"
                pt="calc(var(--app-shell-header-height) + 28px)"
            />
        </AppShell>
    )
}
