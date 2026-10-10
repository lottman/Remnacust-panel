import { CodeHighlight } from '@mantine/code-highlight'
import { Button, Card, Group, Paper, Stack, Switch, Text, Transition } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import {
    DEFAULT_SUBSCRIPTION_REMARKS,
    GetExternalSquadByUuidCommand
} from '@remnawave/backend-contract'
import { RemarksManager } from '@widgets/dashboard/subscription-settings/settings/cards/managers/remarks-manager.widget'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiClockCountdown, PiClockUser, PiListChecks, PiProhibit } from 'react-icons/pi'
import { TbDeviceFloppy, TbDevices2, TbListLetters, TbX } from 'react-icons/tb'

import { queryClient } from '@shared/api'
import { QueryKeys, useUpdateExternalSquad } from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'
import {
    SubscriptionExtraRemarks,
    type ExtraRemarks
} from '@shared/ui/forms/subscription-extra-remarks'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'

interface IProps {
    externalSquad: GetExternalSquadByUuidCommand.Response['response']
}

export const ExternalSquadsCustomRemarksTabWidget = (props: IProps) => {
    const uiText = useUiText()

    const { externalSquad } = props
    const { t } = useTranslation()

    const defaultRemarks = {
        expired: DEFAULT_SUBSCRIPTION_REMARKS.expiredUsers,
        limited: DEFAULT_SUBSCRIPTION_REMARKS.limitedUsers,
        disabled: DEFAULT_SUBSCRIPTION_REMARKS.disabledUsers,
        emptyHosts: DEFAULT_SUBSCRIPTION_REMARKS.emptyHosts,
        HWIDMaxDevicesExceeded: DEFAULT_SUBSCRIPTION_REMARKS.HWIDMaxDevicesExceeded,
        HWIDNotSupported: DEFAULT_SUBSCRIPTION_REMARKS.HWIDNotSupported
    }

    const [extras, setExtras] = useState<ExtraRemarks>(externalSquad.customRemarks ?? {})
    const [isOverrideEnabled, setIsOverrideEnabled] = useState<boolean>(false)
    const [remarks, setRemarks] = useState<Record<string, string[]>>({
        expired: defaultRemarks.expired,
        limited: defaultRemarks.limited,
        disabled: defaultRemarks.disabled,
        emptyHosts: defaultRemarks.emptyHosts,
        HWIDMaxDevicesExceeded: defaultRemarks.HWIDMaxDevicesExceeded,
        HWIDNotSupported: defaultRemarks.HWIDNotSupported
    })

    const [previousSquad, setPreviousSquad] = useState<typeof externalSquad | null>(null)
    if (previousSquad !== externalSquad) {
        setPreviousSquad(externalSquad)
        const currentRemarks = externalSquad.customRemarks
        setExtras(currentRemarks ?? {})
        if (currentRemarks) {
            setIsOverrideEnabled(true)

            const processRemarks = (remarksData: string | string[] | undefined): string[] => {
                if (!remarksData) return ['']
                if (typeof remarksData === 'string') {
                    return remarksData.split('\n').filter(Boolean).length > 0
                        ? remarksData.split('\n').filter(Boolean)
                        : ['']
                }
                return Array.isArray(remarksData) && remarksData.length > 0 ? remarksData : ['']
            }

            setRemarks({
                expired: processRemarks(currentRemarks.expiredUsers),
                limited: processRemarks(currentRemarks.limitedUsers),
                disabled: processRemarks(currentRemarks.disabledUsers),
                emptyHosts: processRemarks(currentRemarks.emptyHosts),
                HWIDMaxDevicesExceeded: processRemarks(currentRemarks.HWIDMaxDevicesExceeded),
                HWIDNotSupported: processRemarks(currentRemarks.HWIDNotSupported)
            })
        } else {
            setIsOverrideEnabled(false)
            setRemarks({
                expired: defaultRemarks.expired,
                limited: defaultRemarks.limited,
                disabled: defaultRemarks.disabled,
                emptyHosts: defaultRemarks.emptyHosts,
                HWIDMaxDevicesExceeded: defaultRemarks.HWIDMaxDevicesExceeded,
                HWIDNotSupported: defaultRemarks.HWIDNotSupported
            })
        }
    }

    const updateExpiredRemarks = useCallback((newRemarks: string[]) => {
        setRemarks((prev) => ({ ...prev, expired: newRemarks }))
    }, [])

    const updateLimitedRemarks = useCallback((newRemarks: string[]) => {
        setRemarks((prev) => ({ ...prev, limited: newRemarks }))
    }, [])

    const updateDisabledRemarks = useCallback((newRemarks: string[]) => {
        setRemarks((prev) => ({ ...prev, disabled: newRemarks }))
    }, [])

    const updateEmptyHostsRemarks = useCallback((newRemarks: string[]) => {
        setRemarks((prev) => ({ ...prev, emptyHosts: newRemarks }))
    }, [])

    const updateHWIDMaxDevicesExceededRemarks = useCallback((newRemarks: string[]) => {
        setRemarks((prev) => ({ ...prev, HWIDMaxDevicesExceeded: newRemarks }))
    }, [])

    const updateHWIDNotSupportedRemarks = useCallback((newRemarks: string[]) => {
        setRemarks((prev) => ({ ...prev, HWIDNotSupported: newRemarks }))
    }, [])
    const { mutate: updateExternalSquad, isPending: isUpdatingExternalSquad } =
        useUpdateExternalSquad({
            mutationFns: {
                onSuccess: (data) => {
                    if (data) {
                        queryClient.setQueryData(
                            QueryKeys.externalSquads.getExternalSquad({
                                uuid: data.uuid
                            }).queryKey,
                            data
                        )
                    }
                },
                onError: (error) => {
                    if ((error.cause as unknown as { errorCode: string })?.errorCode === 'A231') {
                        modals.open({
                            centered: true,
                            size: 'auto',
                            title: (
                                <BaseOverlayHeader
                                    iconColor="red"
                                    IconComponent={TbX}
                                    iconVariant="soft"
                                    title={t('subscription-settings.widget.validation-error')}
                                />
                            ),
                            children: <CodeHighlight language="json" code={error.message} />
                        })
                    }
                }
            }
        })

    const handleUpdateExternalSquad = () => {
        if (!externalSquad?.uuid) return

        if (!isOverrideEnabled) {
            updateExternalSquad({
                variables: {
                    uuid: externalSquad.uuid,
                    customRemarks: null
                }
            })
            return
        }

        const filterEmptyStrings = (arr: string[]): string[] => {
            const filtered = arr.filter((item) => item.trim() !== '')
            return filtered.length > 0 ? filtered : ['']
        }

        const expiredFiltered = filterEmptyStrings(remarks.expired)
        const limitedFiltered = filterEmptyStrings(remarks.limited)
        const disabledFiltered = filterEmptyStrings(remarks.disabled)
        const emptyHostsFiltered = filterEmptyStrings(remarks.emptyHosts)
        const HWIDMaxDevicesExceededFiltered = filterEmptyStrings(remarks.HWIDMaxDevicesExceeded)
        const HWIDNotSupportedFiltered = filterEmptyStrings(remarks.HWIDNotSupported)
        const HWIDBlockedFiltered = filterEmptyStrings(
            externalSquad.customRemarks?.HWIDBlocked ?? ['Device is blocked']
        )
        const hostTrafficLimitFiltered = filterEmptyStrings(
            externalSquad.customRemarks?.hostTrafficLimit ?? ['Host traffic limit reached']
        )

        if (
            expiredFiltered[0] === '' ||
            limitedFiltered[0] === '' ||
            disabledFiltered[0] === '' ||
            HWIDMaxDevicesExceededFiltered[0] === '' ||
            HWIDNotSupportedFiltered[0] === '' ||
            emptyHostsFiltered[0] === ''
        ) {
            notifications.show({
                color: 'red',
                title: t('subscription-settings.widget.validation-error'),
                message: t(
                    'subscription-settings.widget.you-must-add-at-least-one-remark-with-text'
                )
            })
            return
        }

        updateExternalSquad({
            variables: {
                uuid: externalSquad.uuid,
                customRemarks: {
                    ...extras,
                    combineSubscriptionAndHwidRemarks:
                        extras.combineSubscriptionAndHwidRemarks ?? true,
                    subscriptionAndHwidRemarkOrder: extras.subscriptionAndHwidRemarkOrder ?? [
                        'EXPIRED',
                        'DISABLED',
                        'HWID_BLOCKED'
                    ],
                    expiredUsers: expiredFiltered,
                    limitedUsers: limitedFiltered,
                    disabledUsers: disabledFiltered,
                    emptyHosts: emptyHostsFiltered,
                    HWIDMaxDevicesExceeded: HWIDMaxDevicesExceededFiltered,
                    HWIDNotSupported: HWIDNotSupportedFiltered,
                    HWIDRegistrationBlocked:
                        extras.HWIDRegistrationBlocked ??
                        DEFAULT_SUBSCRIPTION_REMARKS.HWIDRegistrationBlocked,
                    HWIDBlocked: HWIDBlockedFiltered,
                    hostTrafficPaused:
                        extras.hostTrafficPaused ?? DEFAULT_SUBSCRIPTION_REMARKS.hostTrafficPaused,
                    hostTrafficLimit: hostTrafficLimitFiltered
                }
            }
        })
    }

    const handleToggleOverride = (checked: boolean) => {
        setIsOverrideEnabled(checked)
    }

    return (
        <Card p="md" withBorder>
            <Stack gap="md">
                {isOverrideEnabled && (
                    <>
                        <SubscriptionExtraRemarks value={extras} onChange={setExtras} />
                        <RemarksManager
                            icon={<TbDevices2 size="24px" />}
                            iconColor="orange"
                            initialRemarks={
                                extras.HWIDRegistrationBlocked ??
                                DEFAULT_SUBSCRIPTION_REMARKS.HWIDRegistrationBlocked
                            }
                            onChange={(value) =>
                                setExtras((prev) => ({ ...prev, HWIDRegistrationBlocked: value }))
                            }
                            title={uiText('message-c736fb4')}
                        />
                    </>
                )}
                {isOverrideEnabled && (
                    <RemarksManager
                        icon={<TbDevices2 size="24px" />}
                        iconColor="yellow"
                        initialRemarks={
                            extras.hostTrafficPaused ??
                            DEFAULT_SUBSCRIPTION_REMARKS.hostTrafficPaused
                        }
                        onChange={(value) =>
                            setExtras((prev) => ({ ...prev, hostTrafficPaused: value }))
                        }
                        title={uiText('message-15a13be')}
                    />
                )}
                <Group align="center" justify="space-between" wrap="nowrap">
                    <Stack gap={4}>
                        <Group gap="xs">
                            <TbListLetters size={20} />
                            <Text fw={600} size="md">
                                {t('subscription-settings.widget.custom-remarks')}
                            </Text>
                        </Group>
                        <Text c="dimmed" size="sm">
                            {t(
                                'external-squads-custom-remarks.widget.override-remarks-description'
                            )}
                        </Text>
                    </Stack>
                </Group>

                <Paper bg="dark.7" p="md" withBorder>
                    <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs" justify="start" wrap="nowrap">
                            <Text fw={500} size="sm">
                                {t('external-squads-custom-remarks.widget.enable-override')}
                            </Text>
                        </Group>
                        <Switch
                            checked={isOverrideEnabled}
                            onChange={(e) => handleToggleOverride(e.currentTarget.checked)}
                            size="md"
                        />
                    </Group>
                </Paper>

                <Transition
                    duration={200}
                    mounted={isOverrideEnabled}
                    timingFunction="linear"
                    transition="fade"
                >
                    {(styles) => (
                        <Stack gap="md" style={styles}>
                            <RemarksManager
                                icon={<TbDevices2 size="24px" />}
                                iconColor="red"
                                initialRemarks={remarks.HWIDMaxDevicesExceeded}
                                onChange={updateHWIDMaxDevicesExceededRemarks}
                                title={t(
                                    'subscription-user-remarks-card.widget.hwid-max-devices-exceeded'
                                )}
                            />

                            <RemarksManager
                                icon={<TbX size="24px" />}
                                iconColor="red"
                                initialRemarks={remarks.HWIDNotSupported}
                                onChange={updateHWIDNotSupportedRemarks}
                                title={t(
                                    'subscription-user-remarks-card.widget.hwid-not-supported'
                                )}
                            />

                            <RemarksManager
                                icon={<PiClockUser size="24px" />}
                                iconColor="red"
                                initialRemarks={remarks.expired}
                                onChange={updateExpiredRemarks}
                                title={`${t('common.field.user-status')}: EXPIRED`}
                            />

                            <RemarksManager
                                icon={<PiClockCountdown size="24px" />}
                                iconColor="orange"
                                initialRemarks={remarks.limited}
                                onChange={updateLimitedRemarks}
                                title={`${t('common.field.user-status')}: LIMITED`}
                            />

                            <RemarksManager
                                icon={<PiProhibit size="24px" />}
                                iconColor="gray"
                                initialRemarks={remarks.disabled}
                                onChange={updateDisabledRemarks}
                                title={`${t('common.field.user-status')}: DISABLED`}
                            />

                            <RemarksManager
                                icon={<PiListChecks size="24px" />}
                                iconColor="blue"
                                initialRemarks={remarks.emptyHosts}
                                onChange={updateEmptyHostsRemarks}
                                title={t('subscription-user-remarks-card.widget.empty-hosts')}
                            />
                        </Stack>
                    )}
                </Transition>

                <Button
                    color="teal"
                    fullWidth
                    leftSection={<TbDeviceFloppy size="1.2rem" />}
                    loading={isUpdatingExternalSquad}
                    onClick={handleUpdateExternalSquad}
                    size="md"
                    style={{
                        transition: 'all 0.2s ease'
                    }}
                    variant="soft"
                >
                    {t('common.action.save')}
                </Button>
            </Stack>
        </Card>
    )
}
