import { Box, BoxProps, Group, Popover, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbDots } from 'react-icons/tb'

import { AppearanceControl } from '@shared/ui/appearance/appearance'

import { GithubControl } from './GithubControl'
import { HeaderControl } from './HeaderControl'
import classes from './HeaderControls.module.css'
import { LanguageControl } from './LanguageControl'
import { LogoutControl } from './LogoutControl'
import { RecapControl } from './RecapControl'
import { SupportControl } from './SupportControl'
import { TelegramControl } from './TelegramControl'
import { VersionControl } from './VersionControl'

interface HeaderControlsProps extends BoxProps {
    githubLink?: string
    isGithubLoading?: boolean
    stars?: number
    telegramLink: string
    withGithub?: boolean
    withLanguage?: boolean
    withLogout?: boolean
    withRecap?: boolean
    withSupport?: boolean
    withTelegram?: boolean
    withVersion?: boolean
    withAppearance?: boolean
}
export function HeaderControls({
    githubLink,
    withGithub = true,
    withTelegram = true,
    withSupport = true,
    withLogout = true,
    withLanguage = true,
    withVersion = true,
    withRecap = false,
    withAppearance = true,
    telegramLink,
    stars,
    isGithubLoading,
    ...others
}: HeaderControlsProps) {
    const { t } = useTranslation()
    const [moreOpened, setMoreOpened] = useState(false)
    const secondary = [
        withTelegram && {
            label: 'Telegram',
            control: <TelegramControl label="Telegram" link={telegramLink} />
        },
        withGithub &&
            githubLink && {
                label: 'GitHub',
                control: (
                    <GithubControl
                        label="GitHub"
                        link={githubLink}
                        stars={stars}
                        isLoading={isGithubLoading}
                    />
                )
            },
        withSupport && {
            label: t('design-ui.support'),
            control: <SupportControl label={t('design-ui.support')} />
        },
        withRecap && {
            label: t('design-ui.recap'),
            control: <RecapControl label={t('design-ui.recap')} />
        }
    ].filter(Boolean) as { label: string; control: React.ReactNode }[]
    return (
        <Group gap={6} wrap="nowrap" {...others}>
            {withVersion && (
                <Box className={classes.desktopVersion}>
                    <VersionControl />
                </Box>
            )}
            {(secondary.length > 0 || withVersion) && (
                <Popover
                    opened={moreOpened}
                    onChange={setMoreOpened}
                    position="bottom-end"
                    width={272}
                    shadow="md"
                    trapFocus
                    withArrow={false}
                >
                    <Popover.Target>
                        <HeaderControl
                            aria-label={t('design-ui.more')}
                            aria-expanded={moreOpened}
                            title={t('design-ui.more')}
                            onClick={() => setMoreOpened((value) => !value)}
                        >
                            <TbDots size={22} />
                        </HeaderControl>
                    </Popover.Target>
                    <Popover.Dropdown className={classes.dropdown}>
                        <Stack gap={10}>
                            <Text size="xs" c="dimmed">
                                {t('design-ui.more')}
                            </Text>
                            {withVersion && (
                                <Group className={classes.mobileVersion} justify="space-between">
                                    <Text size="sm">{t('design-ui.build')}</Text>
                                    <VersionControl />
                                </Group>
                            )}
                            {secondary.map((item) => (
                                <Box key={item.label} onClick={() => setMoreOpened(false)}>
                                    {item.control}
                                </Box>
                            ))}
                        </Stack>
                    </Popover.Dropdown>
                </Popover>
            )}
            {withLanguage && <LanguageControl />}
            {withAppearance && <AppearanceControl />}
            {withLogout && <LogoutControl />}
        </Group>
    )
}
