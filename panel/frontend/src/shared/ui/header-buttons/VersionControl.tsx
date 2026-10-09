import { Box, Group, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import clsx from 'clsx'
import { useMemo } from 'react'

import { useGetRemnawaveMetadata } from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { isPanelVersionNewer } from '@shared/utils/panel-version'

import { useRemnawaveInfo } from '@entities/dashboard/updates-store'

import { Logo } from '../logo'
import { BaseOverlayHeader } from '../overlays/base-overlay-header'
import { BuildInfoModal } from '../sidebar/build-info-modal'
import { HeaderControl } from './HeaderControl'
import { SkeletonHeaderControl } from './SkeletonHeaderControl'
import classes from './VersionControl.module.css'

export function VersionControl() {
    const uiText = useUiText()

    const remnawaveInfo = useRemnawaveInfo()
    const { data: remnawaveMetadata, isLoading } = useGetRemnawaveMetadata()

    const isNewVersionAvailable = useMemo(() => {
        if (!remnawaveMetadata) return false

        const currentVersion = remnawaveMetadata.version
        const latest = remnawaveInfo.latestVersion || '0.0.0'
        return isPanelVersionNewer(latest, currentVersion)
    }, [remnawaveInfo.latestVersion, remnawaveMetadata])

    if (isLoading || !remnawaveMetadata) {
        return <SkeletonHeaderControl width={85} />
    }

    const handleClick = () => {
        modals.open({
            title: (
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={Logo}
                    iconVariant="soft"
                    title={uiText('build-info-642ae0c')}
                />
            ),
            centered: true,
            size: 'md',
            withCloseButton: true,
            children: (
                <BuildInfoModal
                    isNewVersionAvailable={isNewVersionAvailable}
                    remnawaveMetadata={remnawaveMetadata}
                />
            )
        })
    }

    return (
        <HeaderControl
            className={classes.version}
            aria-label={`${uiText('build-info-642ae0c')}: ${remnawaveMetadata.version}${
                isNewVersionAvailable
                    ? ` · ${uiText('update-available-ff8b555')}: ${remnawaveInfo.latestVersion}`
                    : ''
            }`}
            data-update-available={isNewVersionAvailable || undefined}
            onClick={handleClick}
            title={
                isNewVersionAvailable
                    ? `${uiText('update-available-ff8b555')}: ${remnawaveInfo.latestVersion}`
                    : uiText('build-info-642ae0c')
            }
            w="auto"
        >
            <Group gap={8} ml={10} mr={10} wrap="nowrap">
                <Box className={classes.icon} data-icon-motion-target aria-hidden="true">
                    <Logo size={20} />
                </Box>
                <Text
                    className={clsx({ [classes.newVersion]: isNewVersionAvailable })}
                    ff="text"
                    fw={600}
                    size="sm"
                >
                    {remnawaveMetadata.version}
                </Text>
            </Group>
        </HeaderControl>
    )
}
