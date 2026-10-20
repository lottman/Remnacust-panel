import NiceModal, { useModal } from '@ebay/nice-modal-react'
import {
    ActionIcon,
    Badge,
    CopyButton,
    Drawer,
    Group,
    Stack,
    TextInput,
    ThemeIcon,
    Text,
    Box,
    Button,
    useComputedColorScheme
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { githubDarkTheme, githubLightTheme } from 'json-edit-react'
import { JsonEditor } from 'json-edit-react'
import { useTranslation } from 'react-i18next'
import {
    PiEyeSlashDuotone,
    PiWifiHighDuotone,
    PiLinkBreakDuotone,
    PiProhibitDuotone,
    PiCheck,
    PiCopy,
    PiEmptyDuotone,
    PiQrCodeDuotone
} from 'react-icons/pi'
import { TbJson } from 'react-icons/tb'

import { useNiceMantineModal } from '@shared/_modals/use-nice-modal'
import { useGetConnectionKeysByUserId, useGetRawSubscription } from '@shared/api/hooks'
import { translateUiText as uiText } from '@shared/i18n/interface-text'
import { EmptyPageLayout } from '@shared/ui/layouts/empty-page'
import { LoaderModalShared } from '@shared/ui/loader-modal'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { PageQueryError } from '@shared/ui/page-query-error'
import { QrCodeBuilder } from '@shared/ui/qr-code-builder'
import { SectionCardRoot } from '@shared/ui/section-card/section-card.root'
import { SectionCardSection } from '@shared/ui/section-card/section-card.section'

import { connectionKeyLabel } from './connection-key-label'

interface IProps {
    userId: number
    shortUuid: string
}

export const ConnectionKeysDrawer = NiceModal.create((props: IProps) => {
    const { userId, shortUuid } = props
    const { t } = useTranslation()
    const colorScheme = useComputedColorScheme('dark')

    const modal = useModal()
    const { modalProps } = useNiceMantineModal({
        modal,
        drawer: true
    })

    const keysQuery = useGetConnectionKeysByUserId({
        route: {
            userId: userId
        }
    })
    const { data: connectionKeys, isLoading } = keysQuery

    const rawQuery = useGetRawSubscription({
        route: { shortUuid },
        rQueryParams: { enabled: false }
    })

    const renderQrCode = (link: string, remark: string) => {
        modals.open({
            centered: true,
            size: 'auto',
            title: (
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={PiQrCodeDuotone}
                    iconVariant="soft"
                    title={remark}
                />
            ),
            children: <QrCodeBuilder data={link} title={remark} />
        })
    }

    const renderLinkItem = (link: string) => {
        const name = connectionKeyLabel(link)

        return (
            <TextInput
                key={link}
                label={name}
                leftSection={
                    <CopyButton timeout={2000} value={link}>
                        {({ copied, copy }) => (
                            <ActionIcon
                                aria-label={`${t('common.action.copy')}: ${name}`}
                                color={copied ? 'teal' : 'gray'}
                                onClick={copy}
                                variant="subtle"
                            >
                                {copied ? <PiCheck size="16px" /> : <PiCopy size="16px" />}
                            </ActionIcon>
                        )}
                    </CopyButton>
                }
                readOnly
                rightSection={
                    <ActionIcon
                        aria-label={`${t('view-user-modal.widget.qr-code')}: ${name}`}
                        onClick={() => renderQrCode(link, name)}
                        variant="subtle"
                    >
                        <PiQrCodeDuotone size="16px" />
                    </ActionIcon>
                }
                value={link}
            />
        )
    }

    const renderSection = (keys: string[], label: string, icon: React.ReactNode, color: string) => {
        if (!keys.length) return null

        return (
            <SectionCardRoot gap="sm">
                <SectionCardSection>
                    <Group gap="xs">
                        <ThemeIcon color={color} size="sm" variant="light">
                            {icon}
                        </ThemeIcon>
                        <Text c={color} fw={500} size="sm">
                            {label}
                        </Text>
                        <Badge color={color} size="sm" variant="light">
                            {keys.length}
                        </Badge>
                    </Group>
                </SectionCardSection>
                {keys.map(renderLinkItem)}
            </SectionCardRoot>
        )
    }

    const renderLinks = () => {
        const hasNoKeys =
            !connectionKeys?.enabledKeys.length &&
            !connectionKeys?.disabledKeys.length &&
            !connectionKeys?.hiddenKeys.length

        if (hasNoKeys) {
            return <EmptyPageLayout icon={<PiEmptyDuotone size="3rem" />} />
        }

        return (
            <Stack gap="md">
                {renderSection(
                    connectionKeys?.enabledKeys ?? [],
                    t('connectionKeys.active'),
                    <PiWifiHighDuotone />,
                    'teal'
                )}

                {renderSection(
                    connectionKeys?.hiddenKeys ?? [],
                    t('connectionKeys.hidden'),
                    <PiEyeSlashDuotone />,
                    'gray'
                )}
                {renderSection(
                    connectionKeys?.disabledKeys ?? [],
                    t('connectionKeys.disabled'),
                    <PiProhibitDuotone />,
                    'orange'
                )}
            </Stack>
        )
    }

    const renderRawSubscription = async () => {
        const result = await rawQuery.refetch()
        if (result.isError || result.data === undefined) return
        modals.open({
            centered: true,
            size: 'xl',
            title: (
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={TbJson}
                    iconVariant="soft"
                    title={uiText('raw-subscription-9e7ce17')}
                />
            ),
            children: (
                <Box>
                    <JsonEditor
                        collapse={({ path }) => {
                            if (path.length === 0) return false
                            if (path[0] !== 'resolvedProxyConfigs') return true
                            return path.length > 2
                        }}
                        data={JSON.parse(JSON.stringify(result.data))}
                        indent={4}
                        keySort={([a], [b]) => {
                            if (a === 'resolvedProxyConfigs') return -1
                            if (b === 'resolvedProxyConfigs') return 1
                            return 0
                        }}
                        maxWidth="100%"
                        rootName=""
                        theme={colorScheme === 'light' ? githubLightTheme : githubDarkTheme}
                        viewOnly
                        jsonStringify={(data) => JSON.stringify(data)}
                    />
                </Box>
            )
        })
    }

    return (
        <Drawer
            {...modalProps}
            padding="lg"
            position="right"
            size="md"
            title={
                <BaseOverlayHeader
                    iconColor="teal"
                    IconComponent={PiLinkBreakDuotone}
                    iconVariant="soft"
                    title={t('get-user-subscription-links.feature.connection-keys')}
                />
            }
        >
            <Stack>
                <Button
                    fullWidth
                    onClick={renderRawSubscription}
                    leftSection={<TbJson size="16px" />}
                    variant="soft"
                    loading={rawQuery.isFetching}
                >
                    {uiText('raw-subscription-9e7ce17')}
                </Button>
                {rawQuery.isError && rawQuery.data === undefined && (
                    <PageQueryError queries={[{ ...rawQuery, refetch: renderRawSubscription }]} />
                )}
                {isLoading ? (
                    <LoaderModalShared mih="240px" />
                ) : keysQuery.isError && connectionKeys === undefined ? (
                    <PageQueryError queries={[keysQuery]} />
                ) : (
                    <Stack>{renderLinks()}</Stack>
                )}
            </Stack>
        </Drawer>
    )
})
