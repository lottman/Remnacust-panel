import { Select, Stack } from '@mantine/core'
import { DateTimePicker, getTimeRange } from '@mantine/dates'
import { UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import {
    CreateUserCommand,
    GetExternalSquadsCommand,
    GetInternalSquadsCommand,
    UpdateUserCommand
} from '@remnawave/backend-contract'
import { useQuery } from '@tanstack/react-query'
import { InternalSquadsListWidget } from '@widgets/dashboard/users/internal-squads-list'
import dayjs from 'dayjs'
import { ForwardRefComponent, HTMLMotionProps, Variants } from 'motion/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiCalendarDuotone } from 'react-icons/pi'
import { TbShield, TbWebhook } from 'react-icons/tb'

import { subscriptionDomainItemsQuery } from '@shared/api/hooks/subscription-domains'
import { useUiText } from '@shared/i18n/interface-text'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'

import { FreezeScheduleField, freezeDeadlineDate } from './freeze-schedule-field'
import { getUserExpirationState } from './user-expiration'

interface IProps<T extends CreateUserCommand.RequestBody | UpdateUserCommand.RequestBody> {
    cardVariants: Variants
    externalSquads: GetExternalSquadsCommand.Response['response'] | undefined
    form: UseFormReturnType<T>
    isFrozen?: boolean
    frozenRemainingMs?: number | null
    frozenUntil?: Date | null
    internalSquads: GetInternalSquadsCommand.Response['response'] | undefined
    motionWrapper: ForwardRefComponent<HTMLDivElement, HTMLMotionProps<'div'>>
}

export const AccessSettingsCard = <
    T extends CreateUserCommand.RequestBody | UpdateUserCommand.RequestBody
>(
    props: IProps<T>
) => {
    const uiText = useUiText()
    const [minimumDate] = useState(() => new Date())

    const { t, i18n } = useTranslation()

    const { cardVariants, motionWrapper, form, internalSquads, externalSquads } = props

    const [searchQuery, setSearchQuery] = useState('')
    const [localExpireAt, setLocalExpireAt] = useState<Date | undefined>(undefined)
    const subscriptionDomains = useQuery(subscriptionDomainItemsQuery())

    const MotionWrapper = motionWrapper
    const [selectedStatus, setSelectedStatus] = useState(form.getValues().status)
    const [freezeDeadline, setFreezeDeadline] = useState(() =>
        freezeDeadlineDate(form.getValues().frozenUntil)
    )
    form.watch('status', ({ value }) => setSelectedStatus(value))
    form.watch('frozenUntil', ({ value }) => setFreezeDeadline(freezeDeadlineDate(value)))
    const isFrozen = props.isFrozen || selectedStatus === 'FROZEN'
    const freezeInput = form.getInputProps('frozenUntil')
    const expiryValue = localExpireAt ?? form.getValues().expireAt
    const expirationState = getUserExpirationState(expiryValue)

    const filteredInternalSquads = useMemo(() => {
        const allInternalSquads = internalSquads?.internalSquads || []
        if (!searchQuery.trim()) return allInternalSquads

        const query = searchQuery.toLowerCase().trim()
        return allInternalSquads.filter((internalSquad) =>
            internalSquad.name?.toLowerCase().includes(query)
        )
    }, [internalSquads, searchQuery])

    form.watch('expireAt', (value) => {
        setLocalExpireAt(value.value)
    })

    return (
        <MotionWrapper variants={cardVariants}>
            <SectionCard.Root>
                <SectionCard.Section>
                    <BaseOverlayHeader
                        iconColor="indigo"
                        IconComponent={TbShield}
                        iconSize={20}
                        iconVariant="soft"
                        title={t('access-settings-card.access-settings')}
                        titleOrder={5}
                    />
                </SectionCard.Section>

                <SectionCard.Section>
                    <Stack gap="md">
                        {isFrozen ? (
                            <DateTimePicker
                                label={t('create-user-modal.widget.expiry-date')}
                                description={t('frozen-user.help')}
                                locale={i18n.language}
                                value={
                                    expiryValue && dayjs(expiryValue).isValid()
                                        ? dayjs(expiryValue).format('YYYY-MM-DD HH:mm:ss')
                                        : null
                                }
                                valueFormat="D MMM YYYY, HH:mm"
                                leftSection={<PiCalendarDuotone size="16px" />}
                                disabled
                                styles={{
                                    input: { color: 'var(--mantine-color-blue-5)', opacity: 1 }
                                }}
                            />
                        ) : (
                            <DateTimePicker
                                dropdownType="modal"
                                headerControlsOrder={['previous', 'next', 'level']}
                                highlightToday
                                key={form.key('expireAt')}
                                label={t('create-user-modal.widget.expiry-date')}
                                locale={i18n.language}
                                minDate={minimumDate}
                                modalProps={{
                                    centered: true
                                }}
                                styles={{
                                    input: {
                                        color:
                                            expirationState === 'expired'
                                                ? 'var(--mantine-color-red-6)'
                                                : expirationState === 'soon'
                                                  ? 'var(--mantine-color-yellow-6)'
                                                  : undefined
                                    },
                                    calendarHeaderLevel: {
                                        justifyContent: 'flex-start',
                                        paddingInlineStart: 8
                                    },
                                    label: { fontWeight: 500 }
                                }}
                                submitButtonProps={{
                                    style: {
                                        borderRadius: 'var(--mantine-radius-md)',
                                        width: '20%'
                                    }
                                }}
                                timePickerProps={{
                                    withDropdown: true,
                                    scrollAreaProps: {
                                        styles: {
                                            content: {
                                                minWidth: 'fit-content' // TODO: MantineUI bug
                                            }
                                        }
                                    },
                                    presets: getTimeRange({
                                        startTime: '06:00:00',
                                        endTime: '18:00:00',
                                        interval: '01:30:00'
                                    })
                                }}
                                valueFormat="D MMM YYYY, HH:mm"
                                {...form.getInputProps('expireAt')}
                                description={
                                    props.isFrozen || form.values.status === 'FROZEN'
                                        ? t('frozen-user.help')
                                        : t('create-user-modal.widget.expire-at-description')
                                }
                                leftSection={<PiCalendarDuotone size="16px" />}
                                onChange={(date) => {
                                    const formInputProps = form.getInputProps('expireAt')
                                    if (formInputProps.onChange) {
                                        formInputProps.onChange(date)
                                    }

                                    if (date === 'Invalid Date') {
                                        notifications.show({
                                            title: uiText('invalid-date-cd63c7d'),
                                            message: uiText(
                                                'please-select-a-valid-date-defaulting-to-1-month-from-now-f05123b'
                                            ),
                                            color: 'red'
                                        })

                                        const currentDate = form.values.expireAt || new Date()
                                        const newDate = new Date(currentDate)
                                        newDate.setMonth(newDate.getMonth() + 1)
                                        // @ts-expect-error - TODO: fix ZOD schema
                                        form.setFieldValue('expireAt', newDate)
                                    }
                                }}
                                presets={[
                                    {
                                        value: dayjs(localExpireAt)
                                            .add(1, 'month')
                                            .format('YYYY-MM-DD HH:mm:ss'),
                                        label: t('create-user-modal.widget.1-month')
                                    },
                                    {
                                        value: dayjs(localExpireAt)
                                            .add(3, 'months')
                                            .format('YYYY-MM-DD HH:mm:ss'),
                                        label: t('create-user-modal.widget.3-months')
                                    },
                                    {
                                        value: dayjs(localExpireAt)
                                            .add(1, 'year')
                                            .format('YYYY-MM-DD HH:mm:ss'),
                                        label: t('create-user-modal.widget.1-year')
                                    },
                                    {
                                        value: dayjs().year(2099).format('YYYY-MM-DD HH:mm:ss'),
                                        label: t('create-user-modal.widget.2099-year')
                                    }
                                ]}
                            />
                        )}
                        {isFrozen && (
                            <FreezeScheduleField
                                value={
                                    props.isFrozen && props.frozenUntil
                                        ? props.frozenUntil
                                        : freezeDeadline
                                }
                                readOnly={props.isFrozen && Boolean(props.frozenUntil)}
                                onChange={(value) => freezeInput.onChange?.(value)}
                                error={form.errors.frozenUntil}
                            />
                        )}

                        <InternalSquadsListWidget
                            description={t('create-user-modal.widget.internal-squads-description')}
                            filteredInternalSquads={filteredInternalSquads}
                            formKey={form.key('activeInternalSquads')}
                            label={t('common.field.internal-squads')}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            {...form.getInputProps('activeInternalSquads')}
                        />

                        <Select
                            allowDeselect={true}
                            clearable
                            data={externalSquads?.externalSquads.map((externalSquad) => ({
                                label: externalSquad.name,
                                value: externalSquad.uuid
                            }))}
                            limit={100}
                            defaultValue={form.values.externalSquadUuid}
                            description={t(
                                'access-settings-card.select-an-external-squad-to-apply-custom-settings-to-this-user'
                            )}
                            key={form.key('externalSquadUuid')}
                            label={t('access-settings-card.external-squad')}
                            leftSection={<TbWebhook size="16px" />}
                            placeholder={t('access-settings-card.select-an-external-squad')}
                            {...form.getInputProps('externalSquadUuid')}
                        />

                        <Select
                            clearable
                            data={(subscriptionDomains.data ?? []).map((domain) => ({
                                value: domain.uuid,
                                label: `${domain.name} · ${domain.domain}${domain.path || '/'}${
                                    domain.isDefault
                                        ? ` · ${t('access-settings-card.default-domain')}`
                                        : ''
                                }`
                            }))}
                            description={t('access-settings-card.subscription-domain-description')}
                            disabled={subscriptionDomains.isLoading}
                            key={form.key('subscriptionDomainUuid')}
                            label={t('access-settings-card.subscription-domain')}
                            placeholder={t('access-settings-card.default-domain')}
                            {...form.getInputProps('subscriptionDomainUuid')}
                        />
                    </Stack>
                </SectionCard.Section>
            </SectionCard.Root>
        </MotionWrapper>
    )
}
