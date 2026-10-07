import { ActionIcon, Box, Divider, Group, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core'
import { GetUserHwidDevicesCommand } from '@remnawave/backend-contract'
import { useTranslation } from 'react-i18next'
import {
    PiAndroidLogo,
    PiAppleLogo,
    PiDeviceMobile,
    PiLinuxLogo,
    PiLockKey,
    PiLockKeyOpen,
    PiTrash,
    PiWindowsLogo
} from 'react-icons/pi'
import { TbExternalLink } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { CopyableFieldShared } from '@shared/ui/copyable-field/copyable-field'
import { SettingsCardShared } from '@shared/ui/settings-card'
import { formatTimeUtil } from '@shared/utils/time-utils'

interface IProps {
    actionsDisabled?: boolean
    blockPending?: boolean
    device: GetUserHwidDevicesCommand.Response['response']['devices'][number]
    index: number
    onDelete: (hwid: string) => void
    onToggleBlock: (hwid: string, blocked: boolean) => void
}

export const UserHwidDeviceItem = (props: IProps) => {
    const uiText = useUiText()

    const { index, device, onDelete, onToggleBlock, actionsDisabled, blockPending } = props
    const { t, i18n } = useTranslation()

    const resolvePlatform = (platform: null | string) => {
        if (!platform) return <PiDeviceMobile size={24} />
        switch (platform.toLowerCase()) {
            case 'android':
                return <PiAndroidLogo size={24} />
            case 'ios':
                return <PiAppleLogo size={24} />
            case 'linux':
                return <PiLinuxLogo size={24} />
            case 'macos':
                return <PiAppleLogo size={24} />
            case 'unknown':
                return <PiDeviceMobile size={24} />
            case 'windows':
                return <PiWindowsLogo size={24} />
            default:
                return <PiDeviceMobile size={24} />
        }
    }

    return (
        <SettingsCardShared.Container>
            <Group align="center" gap="xs" justify="space-between" wrap="nowrap">
                <Group align="center" gap="xs" wrap="nowrap">
                    <ThemeIcon color="indigo" size="lg" variant="soft">
                        {resolvePlatform(device.platform)}
                    </ThemeIcon>
                    <Text fw={600} size="md">
                        #{index + 1}
                    </Text>
                </Group>

                <Group gap="xs" wrap="nowrap">
                    <Tooltip
                        label={t(
                            device.blocked
                                ? 'hwid-notifications.unblock-device'
                                : 'hwid-notifications.block-device'
                        )}
                    >
                        <ActionIcon
                            aria-label={t(
                                device.blocked
                                    ? 'hwid-notifications.unblock-device'
                                    : 'hwid-notifications.block-device'
                            )}
                            disabled={actionsDisabled}
                            loading={blockPending}
                            color={device.blocked ? 'teal' : 'orange'}
                            onClick={() => onToggleBlock(device.hwid, !device.blocked)}
                            size="lg"
                            variant="soft"
                        >
                            {device.blocked ? (
                                <PiLockKeyOpen size="20px" />
                            ) : (
                                <PiLockKey size="20px" />
                            )}
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t('get-hwid-user-devices.feature.delete-device')}>
                        <ActionIcon
                            aria-label={t('get-hwid-user-devices.feature.delete-device')}
                            disabled={actionsDisabled}
                            color="red"
                            onClick={() => onDelete(device.hwid)}
                            size="lg"
                            variant="soft"
                        >
                            <PiTrash size="20px" />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
            <Divider />
            <SettingsCardShared.Content>
                <Stack gap="xs">
                    <CopyableFieldShared label="HWID" size="sm" value={device.hwid} />

                    <Group align="flex-end" gap="xs" wrap="nowrap">
                        <Box style={{ flex: 1 }}>
                            <CopyableFieldShared
                                label={t('common.field.ip-address')}
                                size="sm"
                                value={device.requestIp || '-'}
                            />
                        </Box>

                        {device.requestIp && (
                            <ActionIcon
                                color="cyan"
                                component="a"
                                href={`https://ipinfo.io/${device.requestIp}`}
                                rel="noopener noreferrer"
                                size="input-sm"
                                target="_blank"
                                variant="soft"
                            >
                                <TbExternalLink size={18} />
                            </ActionIcon>
                        )}
                    </Group>

                    <Group gap="xs" grow>
                        <CopyableFieldShared
                            label={t('common.field.platform')}
                            size="sm"
                            value={device.platform || t('get-hwid-user-devices.feature.unknown')}
                        />

                        <CopyableFieldShared
                            label={t('common.field.os-version')}
                            size="sm"
                            value={device.osVersion || t('get-hwid-user-devices.feature.unknown')}
                        />
                    </Group>

                    <CopyableFieldShared
                        label={t('get-hwid-user-devices.feature.model')}
                        size="sm"
                        value={device.deviceModel || t('get-hwid-user-devices.feature.unknown')}
                    />

                    <CopyableFieldShared
                        label={t('common.field.user-agent')}
                        size="sm"
                        value={device.userAgent || t('get-hwid-user-devices.feature.unknown')}
                    />

                    <CopyableFieldShared
                        label={t('get-hwid-user-devices.feature.added')}
                        size="sm"
                        value={formatTimeUtil({
                            time: device.createdAt,
                            template: 'TIME_FIRST_DATETIME',
                            language: i18n.language
                        })}
                    />

                    <CopyableFieldShared
                        label={uiText('updated-3a5ecca')}
                        size="sm"
                        value={formatTimeUtil({
                            time: device.updatedAt,
                            template: 'TIME_FIRST_DATETIME',
                            language: i18n.language
                        })}
                    />
                </Stack>
            </SettingsCardShared.Content>
        </SettingsCardShared.Container>
    )
}
