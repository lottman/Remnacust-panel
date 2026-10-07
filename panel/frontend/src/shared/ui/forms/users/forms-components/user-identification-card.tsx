import { ActionIcon, Box, Code, Group, Popover, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { GetUserByIdCommand, USERS_STATUS } from '@remnawave/backend-contract'
import { UserStatusBadge } from '@widgets/dashboard/users/user-status-badge'
import dayjs from 'dayjs'
import { githubDarkTheme, JsonEditor } from 'json-edit-react'
import { ForwardRefComponent, HTMLMotionProps, Variants } from 'motion/react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { HiQuestionMarkCircle } from 'react-icons/hi'
import { PiLinkBreak, PiLinkDuotone, PiUserCircle } from 'react-icons/pi'
import {
    TbCalendar,
    TbDevices,
    TbFlame,
    TbJson,
    TbQrcode,
    TbRadar,
    TbServerCog,
    TbTimeline,
    TbUser,
    TbWifi
} from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { useGetUserMetadata } from '@shared/api/hooks'
import { translateUiText as uiText } from '@shared/i18n/interface-text'
import { CopyableCodeBlock } from '@shared/ui/copyable-code-block'
import { CopyableFieldShared } from '@shared/ui/copyable-field/copyable-field'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'
import { resolveCountryCode } from '@shared/utils/misc/resolve-country-code'
import { formatRelativeDateUtil, formatTimeUtil, getTimeAgoUtil } from '@shared/utils/time-utils'

import { getUserExpirationState } from './user-expiration'
import classes from './user-identification-card.module.css'

interface IProps {
    cardVariants: Variants
    lastConnectedNode?: null | { countryCode: string; name: string; uuid: string }
    motionWrapper: ForwardRefComponent<HTMLDivElement, HTMLMotionProps<'div'>>
    user: GetUserByIdCommand.Response['response']
}

const statusIconColorMap = {
    [USERS_STATUS.ACTIVE]: 'teal',
    [USERS_STATUS.DISABLED]: 'gray',
    [USERS_STATUS.EXPIRED]: 'red',
    [USERS_STATUS.LIMITED]: 'yellow'
} as const

const getLastSeenIndicatorColor = (lastSeen: Date | string) => {
    const diffMs = Date.now() - new Date(lastSeen).getTime()
    const diffMinutes = diffMs / 60_000
    if (diffMinutes <= 5) return 'var(--mantine-color-teal-4)'
    if (diffMinutes <= 60) return 'var(--mantine-color-yellow-4)'
    return 'var(--mantine-color-red-4)'
}

export const UserIdentificationCard = memo((props: IProps) => {
    const { t, i18n } = useTranslation()

    const { cardVariants, lastConnectedNode, motionWrapper, user } = props

    const MotionWrapper = motionWrapper

    const { data: metadata, isLoading: isMetadataLoading } = useGetUserMetadata({
        route: { userId: user.id }
    })

    const statusIconColor = statusIconColorMap[user.status] ?? 'gray'

    const expirationState = getUserExpirationState(user.expireAt)
    const expirationFormattedDate =
        expirationState === 'unknown'
            ? t('get-expiration-text.util.unknown')
            : dayjs(user.expireAt).locale(i18n.language).format('D MMM YYYY, HH:mm')

    return (
        <MotionWrapper variants={cardVariants}>
            <SectionCard.Root className={classes.card} data-user-identification>
                <SectionCard.Section>
                    <Group
                        align="center"
                        className={classes.header}
                        justify="space-between"
                        wrap="nowrap"
                    >
                        <Box className={classes.identity}>
                            <BaseOverlayHeader
                                iconColor={statusIconColor}
                                IconComponent={TbUser}
                                iconSize={20}
                                iconVariant="soft"
                                title={user.username}
                                subtitle={`ID ${user.id}`}
                                titleOrder={5}
                                withCopy
                            />
                        </Box>

                        <Group className={classes.status} gap="xs">
                            <UserStatusBadge
                                h={28}
                                key="view-user-status-badge"
                                size="lg"
                                status={user.status}
                            />
                        </Group>
                    </Group>
                </SectionCard.Section>

                <SectionCard.Section>
                    <Group className={classes.actions} gap="xs" justify="flex-start">
                        <Group className={classes.actionGroup} gap={6} justify="flex-start">
                            <Tooltip label={t('view-user-modal.widget.qr-code')}>
                                <ActionIcon
                                    aria-label={t('view-user-modal.widget.qr-code')}
                                    color="teal"
                                    onClick={() => {
                                        showModal('users_subscriptionQrCodeModal', {
                                            subscriptionUrl: user.subscriptionUrl,
                                            username: user.username
                                        })
                                    }}
                                    size="lg"
                                    variant="soft"
                                >
                                    <TbQrcode size={22} />
                                </ActionIcon>
                            </Tooltip>

                            <Tooltip
                                label={t('get-user-subscription-links.feature.connection-keys')}
                            >
                                <ActionIcon
                                    aria-label={t(
                                        'get-user-subscription-links.feature.connection-keys'
                                    )}
                                    color="teal"
                                    onClick={() => {
                                        showModal('users_connectionKeysDrawer', {
                                            userId: user.id,
                                            shortUuid: user.shortUuid
                                        })
                                    }}
                                    size="lg"
                                    variant="soft"
                                >
                                    <PiLinkBreak size="22px" />
                                </ActionIcon>
                            </Tooltip>

                            <Tooltip label={uiText('metadata-9eddf57')}>
                                <ActionIcon
                                    aria-label={uiText('metadata-9eddf57')}
                                    color="teal"
                                    disabled={!metadata}
                                    loading={isMetadataLoading}
                                    onClick={() => {
                                        if (!metadata) return
                                        modals.open({
                                            centered: true,
                                            size: 'auto',
                                            title: (
                                                <BaseOverlayHeader
                                                    iconColor="teal"
                                                    IconComponent={TbJson}
                                                    iconVariant="soft"
                                                    title={uiText('metadata-9eddf57')}
                                                />
                                            ),
                                            children: (
                                                <Box>
                                                    <JsonEditor
                                                        collapse={3}
                                                        data={metadata.metadata as object}
                                                        indent={4}
                                                        maxWidth="100%"
                                                        rootName=""
                                                        theme={githubDarkTheme}
                                                        viewOnly
                                                    />
                                                </Box>
                                            )
                                        })
                                    }}
                                    size="lg"
                                    variant="soft"
                                >
                                    <TbJson size={22} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>

                        <Group className={classes.actionGroup} gap={6} justify="flex-start">
                            <Tooltip label={t('view-user-modal.widget.detailed-info')}>
                                <ActionIcon
                                    aria-label={t('view-user-modal.widget.detailed-info')}
                                    color="cyan"
                                    onClick={() =>
                                        showModal('users_detailedUserInfoDrawer', {
                                            userId: user.id
                                        })
                                    }
                                    size="lg"
                                    variant="soft"
                                >
                                    <PiUserCircle size={22} />
                                </ActionIcon>
                            </Tooltip>

                            <Tooltip label={t('view-user-modal.widget.accessible-nodes')}>
                                <ActionIcon
                                    aria-label={t('view-user-modal.widget.accessible-nodes')}
                                    color="cyan"
                                    onClick={() => {
                                        showModal('users_userAccessibleNodesModal', {
                                            userId: user.id
                                        })
                                    }}
                                    size="lg"
                                    variant="soft"
                                >
                                    <TbServerCog size={22} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>

                        <Group className={classes.actionGroup} gap={6} justify="flex-start">
                            <Tooltip
                                label={t(
                                    'get-user-torrent-blocker-reports.feature.blocker-reports'
                                )}
                            >
                                <ActionIcon
                                    aria-label={t(
                                        'get-user-torrent-blocker-reports.feature.blocker-reports'
                                    )}
                                    color="indigo"
                                    onClick={() =>
                                        showModal('users_userTorrentBlockerReportsModal', {
                                            userId: user.id
                                        })
                                    }
                                    size="lg"
                                    variant="soft"
                                >
                                    <TbFlame size="22px" />
                                </ActionIcon>
                            </Tooltip>

                            <Tooltip
                                label={t(
                                    'get-user-subscription-request-history.feature.request-history'
                                )}
                            >
                                <ActionIcon
                                    aria-label={t(
                                        'get-user-subscription-request-history.feature.request-history'
                                    )}
                                    color="indigo"
                                    onClick={() =>
                                        showModal('users_userSubscriptionRequestsModal', {
                                            userId: user.id
                                        })
                                    }
                                    size="lg"
                                    variant="soft"
                                >
                                    <TbTimeline size="22px" />
                                </ActionIcon>
                            </Tooltip>

                            <Tooltip label={t('get-hwid-user-devices.feature.hwid-devices')}>
                                <ActionIcon
                                    aria-label={t('get-hwid-user-devices.feature.hwid-devices')}
                                    color="indigo"
                                    onClick={() => {
                                        showModal('users_userHwidDevicesModal', {
                                            userId: user.id
                                        })
                                    }}
                                    size="lg"
                                    variant="soft"
                                >
                                    <TbDevices size="22px" />
                                </ActionIcon>
                            </Tooltip>

                            <Tooltip label={t('common.field.active-sessions')}>
                                <ActionIcon
                                    aria-label={t('common.field.active-sessions')}
                                    color="indigo"
                                    onClick={() => {
                                        showModal('users_userActiveSessionDrawer', {
                                            userId: user.id
                                        })
                                    }}
                                    size="lg"
                                    variant="soft"
                                >
                                    <TbRadar size="22px" />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    </Group>
                </SectionCard.Section>

                <SectionCard.Section>
                    <Box className={classes.details}>
                        <Paper
                            className={classes.detailTile}
                            data-expiration={expirationState}
                            bd="1px solid color-mix(in srgb, var(--detail-color) 24%, var(--panel-border))"
                            bg="color-mix(in srgb, var(--detail-color) 8%, var(--panel-surface))"
                        >
                            <TbCalendar color="var(--detail-color)" size={20} />
                            <Stack gap={3}>
                                <Text c="dimmed" size="xs">
                                    {t('create-user-modal.widget.expiry-date')}
                                </Text>
                                <Text c="var(--detail-color)" fw={600} size="sm">
                                    {expirationFormattedDate}
                                </Text>
                            </Stack>
                        </Paper>

                        {user.userTraffic.onlineAt && (
                            <Paper
                                className={classes.detailTile}
                                bd="1px solid var(--panel-border)"
                                bg="var(--panel-subtle)"
                                p="xs"
                                radius="md"
                            >
                                <Tooltip
                                    label={
                                        <Stack gap={2} p={4}>
                                            <Text c="white" fw={600} size="xs">
                                                {t('detailed-user-info-drawer.widget.last-online')}
                                            </Text>
                                            <Text c="white" fw={600} size="xs">
                                                {formatRelativeDateUtil(
                                                    user.userTraffic.onlineAt,
                                                    t,
                                                    i18n.language
                                                )}
                                            </Text>
                                            <Text c="dimmed" ff="monospace" size="xs">
                                                {formatTimeUtil({
                                                    time: user.userTraffic.onlineAt,
                                                    template: 'TIME_FIRST_DATETIME',
                                                    language: i18n.language
                                                })}
                                            </Text>
                                        </Stack>
                                    }
                                >
                                    <Group gap="xs" justify="center" wrap="nowrap">
                                        <TbWifi
                                            color={getLastSeenIndicatorColor(
                                                user.userTraffic.onlineAt
                                            )}
                                            size={18}
                                        />
                                        <Stack gap={3}>
                                            <Text c="dimmed" size="xs">
                                                {t('detailed-user-info-drawer.widget.last-online')}
                                            </Text>
                                            <Text c="var(--panel-text)" fw={600} size="sm">
                                                {getTimeAgoUtil(
                                                    user.userTraffic.onlineAt,
                                                    t,
                                                    i18n.language
                                                )}
                                            </Text>
                                        </Stack>
                                    </Group>
                                </Tooltip>
                            </Paper>
                        )}

                        {lastConnectedNode && (
                            <Paper
                                component="button"
                                type="button"
                                aria-label={t(
                                    'detailed-user-info-drawer.widget.last-connected-node'
                                )}
                                className={classes.detailTile}
                                bd="1px solid var(--panel-border)"
                                bg="var(--panel-subtle)"
                                p="xs"
                                radius="md"
                                onClick={() => {
                                    showModal('nodes_editNodeModal', {
                                        nodeUuid: lastConnectedNode.uuid
                                    })
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <Tooltip
                                    label={t(
                                        'detailed-user-info-drawer.widget.last-connected-node'
                                    )}
                                >
                                    <Group align="center" gap="xs" justify="center" wrap="nowrap">
                                        {resolveCountryCode(lastConnectedNode.countryCode, 20)}

                                        <Stack gap={3}>
                                            <Text c="dimmed" size="xs">
                                                {t(
                                                    'detailed-user-info-drawer.widget.last-connected-node'
                                                )}
                                            </Text>
                                            <Text c="var(--panel-text)" fw={600} size="sm">
                                                {lastConnectedNode.name}
                                            </Text>
                                        </Stack>
                                    </Group>
                                </Tooltip>
                            </Paper>
                        )}
                    </Box>
                </SectionCard.Section>

                <SectionCard.Section>
                    <CopyableFieldShared
                        label={
                            <Group gap={4} justify="flex-start">
                                <Text fw={500} fz="sm">
                                    {t('common.field.subscription-url')}
                                </Text>
                                <Popover shadow="md" width={280} withArrow>
                                    <Popover.Target>
                                        <ActionIcon
                                            aria-label={t('common.field.subscription-url')}
                                            color="gray"
                                            size="sm"
                                            variant="subtle"
                                        >
                                            <HiQuestionMarkCircle size={16} />
                                        </ActionIcon>
                                    </Popover.Target>
                                    <Popover.Dropdown>
                                        <Stack gap="sm">
                                            <Text fw={600} size="sm">
                                                {t('common.field.subscription-url')}
                                            </Text>
                                            <Text c="dimmed" size="sm">
                                                {t(
                                                    'view-user-modal.widget.subscription-url-description-line-1'
                                                )}{' '}
                                                <Code bg="gray.1" c="dark.4" fw={700}>
                                                    SUB_PUBLIC_DOMAIN
                                                </Code>
                                                <br />
                                                {t(
                                                    'view-user-modal.widget.subscription-url-description-line-2'
                                                )}
                                            </Text>
                                            <CopyableCodeBlock value="docker compose down && docker compose up -d" />
                                        </Stack>
                                    </Popover.Dropdown>
                                </Popover>
                            </Group>
                        }
                        leftSection={<PiLinkDuotone size="16px" />}
                        value={user.subscriptionUrl}
                    />
                </SectionCard.Section>
            </SectionCard.Root>
        </MotionWrapper>
    )
})
