import {
    Accordion,
    Alert,
    Badge,
    Button,
    Group,
    Paper,
    Stack,
    Switch,
    Text,
    TextInput
} from '@mantine/core'
import { CustomRemarksSchema } from '@remnawave/backend-contract'
import { RemarksManager } from '@widgets/dashboard/subscription-settings/settings/cards/managers/remarks-manager.widget'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiClockCountdown, PiListChecks, PiProhibit, PiSnowflake } from 'react-icons/pi'
import { TbDeviceFloppy, TbDevices2, TbListLetters, TbRestore, TbX } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { SubscriptionExtraRemarks } from '@shared/ui/forms/subscription-extra-remarks'

import { ActiveExpiryRules } from './active-expiry-rules'
import classes from './remarks-editor.module.css'
import {
    draftValue,
    hasRemoteRemarks,
    prepareRemarks,
    type CustomRemarks,
    type remarkFields
} from './remarks-editor.utils'
import { useRemarksDraft } from './use-remarks-draft'

interface Props {
    value: CustomRemarks | null
    inherited?: CustomRemarks
    external?: boolean
    isPending: boolean
    showRemarks?: boolean
    onSave: (value: CustomRemarks | null) => Promise<CustomRemarks | null>
}

export function CustomRemarksEditor({
    value,
    inherited,
    external = false,
    isPending,
    showRemarks = true,
    onSave
}: Props) {
    const uiText = useUiText()
    const { t } = useTranslation()
    const { state, dispatch, dirty } = useRemarksDraft(value, inherited)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [saving, setSaving] = useState(false)
    const saveInFlight = useRef(false)
    const [sections, setSections] = useState<string[]>(['active'])
    const pending = isPending || saving
    const edit = (next: CustomRemarks) => {
        dispatch({ type: 'edit', value: next })
        setErrors({})
        setSaved(false)
    }
    const updateField = (field: (typeof remarkFields)[number], remarks: string[]) =>
        edit({ ...state.draft, [field]: remarks })
    const reset = () => {
        dispatch({ type: 'reset', inherited })
        setErrors({})
        setSaveError(null)
        setSaved(false)
    }
    const save = async () => {
        if (!dirty || pending || saveInFlight.current) return
        const submitted = structuredClone(draftValue(state))
        let payload = submitted === null ? null : prepareRemarks(submitted)
        if (payload) {
            const result = CustomRemarksSchema.safeParse(payload)
            if (!result.success) {
                setErrors(
                    Object.fromEntries(
                        result.error.issues.map((issue) => [
                            issue.path.join('.'),
                            uiText('remarks-invalid-field')
                        ])
                    )
                )
                setSaveError(uiText('remarks-validation'))
                setSections((current) => [
                    ...new Set([
                        ...current,
                        ...result.error.issues.map((issue) => {
                            const field = String(issue.path[0])
                            if (field === 'activeExpiry') return 'active'
                            if (field === 'action') return 'options'
                            if (field.startsWith('HWID') || field.startsWith('hostTraffic'))
                                return 'devices'
                            return 'statuses'
                        })
                    ])
                ])
                return
            }
            payload = result.data
        }
        setErrors({})
        setSaveError(null)
        setSaved(false)
        saveInFlight.current = true
        setSaving(true)
        try {
            const result = await onSave(payload)
            dispatch({ type: 'saved', value: result, submitted, inherited })
            setSaved(true)
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : uiText('remarks-save-error'))
        } finally {
            saveInFlight.current = false
            setSaving(false)
        }
    }
    const manager = (
        field: (typeof remarkFields)[number],
        title: string,
        color: string,
        icon: React.ReactNode
    ) => (
        <Stack gap={4} key={field}>
            <RemarksManager
                title={title}
                iconColor={color}
                icon={icon}
                initialRemarks={state.draft[field]}
                onChange={(lines) => updateField(field, lines)}
            />
            {errors[field] && (
                <Text c="red" size="sm" role="alert">
                    {errors[field]}
                </Text>
            )}
        </Stack>
    )
    const rules = state.draft.activeExpiry?.rules ?? []
    return (
        <form
            className={classes.editor}
            noValidate
            onSubmit={(event) => {
                event.preventDefault()
                void save()
            }}
        >
            <Stack gap="lg">
                <Group gap="sm">
                    <TbListLetters size={24} />
                    <Text fw={700} size="lg">
                        {t('subscription-settings.widget.custom-remarks')}
                    </Text>
                </Group>
                <Text c="dimmed" size="sm">
                    {uiText('remarks-page-help')}
                </Text>
                <Alert color="blue">{uiText('remarks-refresh-needed')}</Alert>
                {!showRemarks && <Alert color="orange">{uiText('remarks-display-disabled')}</Alert>}
                {hasRemoteRemarks(state) && (
                    <Alert color="orange" title={uiText('remarks-remote-title')}>
                        {uiText('remarks-remote-help')}
                    </Alert>
                )}
                <fieldset disabled={pending} className={classes.fieldset}>
                    <Stack gap="lg">
                        {external && (
                            <Paper p="md" withBorder>
                                <Stack gap="sm">
                                    <Switch
                                        label={t(
                                            'external-squads-custom-remarks.widget.enable-override'
                                        )}
                                        description={uiText('remarks-override-help')}
                                        checked={state.override}
                                        onChange={(event) => {
                                            dispatch({
                                                type: 'override',
                                                enabled: event.currentTarget.checked
                                            })
                                            setSaved(false)
                                        }}
                                    />
                                    <Badge
                                        variant="light"
                                        color={state.override ? 'orange' : 'cyan'}
                                        style={{ alignSelf: 'flex-start' }}
                                    >
                                        {uiText(
                                            state.override
                                                ? 'remarks-full-replacement'
                                                : 'remarks-inherited'
                                        )}
                                    </Badge>
                                </Stack>
                            </Paper>
                        )}
                        {state.override ? (
                            <Accordion
                                multiple
                                value={sections}
                                onChange={setSections}
                                variant="separated"
                            >
                                <Accordion.Item value="active">
                                    <Accordion.Control icon={<PiClockCountdown size={22} />}>
                                        <Group gap="sm">
                                            <Text fw={600}>{uiText('remarks-active-title')}</Text>
                                            <Badge variant="light">{rules.length}</Badge>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <ActiveExpiryRules
                                            rules={rules}
                                            errors={errors}
                                            onChange={(next) =>
                                                edit({
                                                    ...state.draft,
                                                    activeExpiry: { rules: next }
                                                })
                                            }
                                        />
                                    </Accordion.Panel>
                                </Accordion.Item>
                                <Accordion.Item value="statuses">
                                    <Accordion.Control icon={<PiListChecks size={22} />}>
                                        {uiText('remarks-status-title')}
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap="md">
                                            <Text c="dimmed" size="sm">
                                                {uiText('remarks-status-help')}
                                            </Text>
                                            {manager(
                                                'expiredUsers',
                                                t(
                                                    'subscription-user-remarks-card.widget.subscription-expired'
                                                ),
                                                'orange',
                                                <PiClockCountdown size={22} />
                                            )}
                                            {manager(
                                                'limitedUsers',
                                                t(
                                                    'subscription-user-remarks-card.widget.subscription-limited'
                                                ),
                                                'orange',
                                                <PiListChecks size={22} />
                                            )}
                                            {manager(
                                                'disabledUsers',
                                                t(
                                                    'subscription-user-remarks-card.widget.subscription-disabled'
                                                ),
                                                'gray',
                                                <PiProhibit size={22} />
                                            )}
                                            {manager(
                                                'frozenUsers',
                                                t(
                                                    'subscription-user-remarks-card.widget.subscription-frozen'
                                                ),
                                                'blue',
                                                <PiSnowflake size={22} />
                                            )}
                                            {manager(
                                                'emptyHosts',
                                                t(
                                                    'subscription-user-remarks-card.widget.empty-hosts'
                                                ),
                                                'blue',
                                                <PiListChecks size={22} />
                                            )}
                                        </Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                                <Accordion.Item value="devices">
                                    <Accordion.Control icon={<TbDevices2 size={22} />}>
                                        {uiText('remarks-devices-title')}
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap="md">
                                            {manager(
                                                'HWIDRegistrationBlocked',
                                                uiText('new-devices-denied-34c7816'),
                                                'orange',
                                                <TbDevices2 size={22} />
                                            )}
                                            {manager(
                                                'HWIDBlocked',
                                                uiText('device-blocked-hwid-5bc86b1'),
                                                'red',
                                                <TbX size={22} />
                                            )}
                                            {manager(
                                                'HWIDMaxDevicesExceeded',
                                                t(
                                                    'subscription-user-remarks-card.widget.hwid-max-devices-exceeded'
                                                ),
                                                'red',
                                                <TbDevices2 size={22} />
                                            )}
                                            {manager(
                                                'HWIDNotSupported',
                                                t(
                                                    'subscription-user-remarks-card.widget.hwid-not-supported'
                                                ),
                                                'red',
                                                <TbX size={22} />
                                            )}
                                            {manager(
                                                'hostTrafficPaused',
                                                uiText('host-or-tag-traffic-paused-9df80dc'),
                                                'yellow',
                                                <TbDevices2 size={22} />
                                            )}
                                            {manager(
                                                'hostTrafficLimit',
                                                uiText('host-traffic-limit-reached-850782c'),
                                                'orange',
                                                <TbDevices2 size={22} />
                                            )}
                                        </Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                                <Accordion.Item value="options">
                                    <Accordion.Control icon={<TbListLetters size={22} />}>
                                        {uiText('remarks-options-title')}
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap="lg">
                                            <SubscriptionExtraRemarks
                                                value={state.draft}
                                                onChange={(extras) =>
                                                    edit({ ...state.draft, ...extras })
                                                }
                                            />
                                            <Switch
                                                label={uiText('remarks-action-enabled')}
                                                checked={state.draft.action != null}
                                                onChange={(event) =>
                                                    edit({
                                                        ...state.draft,
                                                        action: event.currentTarget.checked
                                                            ? { text: '', buttonText: '', url: '' }
                                                            : null
                                                    })
                                                }
                                            />
                                            {state.draft.action && (
                                                <Stack gap="sm">
                                                    <TextInput
                                                        label={uiText('text-71988c4')}
                                                        maxLength={500}
                                                        value={state.draft.action.text}
                                                        error={errors['action.text']}
                                                        onChange={(event) =>
                                                            edit({
                                                                ...state.draft,
                                                                action: {
                                                                    ...state.draft.action!,
                                                                    text: event.currentTarget.value
                                                                }
                                                            })
                                                        }
                                                    />
                                                    <TextInput
                                                        label={uiText('button-text-ec208ea')}
                                                        required
                                                        maxLength={60}
                                                        value={state.draft.action.buttonText}
                                                        error={errors['action.buttonText']}
                                                        onChange={(event) =>
                                                            edit({
                                                                ...state.draft,
                                                                action: {
                                                                    ...state.draft.action!,
                                                                    buttonText:
                                                                        event.currentTarget.value
                                                                }
                                                            })
                                                        }
                                                    />
                                                    <TextInput
                                                        label={uiText('https-url-c3cf95f')}
                                                        required
                                                        type="url"
                                                        maxLength={2048}
                                                        value={state.draft.action.url}
                                                        error={errors['action.url']}
                                                        onChange={(event) =>
                                                            edit({
                                                                ...state.draft,
                                                                action: {
                                                                    ...state.draft.action!,
                                                                    url: event.currentTarget.value
                                                                }
                                                            })
                                                        }
                                                    />
                                                </Stack>
                                            )}
                                        </Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            </Accordion>
                        ) : (
                            <Text c="dimmed" size="sm">
                                {uiText('remarks-inherited-help')}
                            </Text>
                        )}
                    </Stack>
                </fieldset>
                {saveError && (
                    <Alert role="alert" color="red" title={uiText('remarks-save-error')}>
                        <Text size="sm" className={classes.wrap}>
                            {saveError}
                        </Text>
                        <Text size="sm">{uiText('remarks-draft-preserved')}</Text>
                    </Alert>
                )}
                <Group justify="space-between" className={classes.controls}>
                    <Text role="status" size="sm" c={dirty ? 'orange' : 'dimmed'}>
                        {uiText(
                            dirty
                                ? 'remarks-unsaved'
                                : saved
                                  ? 'remarks-saved'
                                  : 'remarks-up-to-date'
                        )}
                    </Text>
                    <Group gap="sm">
                        <Button
                            type="button"
                            variant="default"
                            leftSection={<TbRestore />}
                            disabled={pending || (!dirty && !hasRemoteRemarks(state))}
                            onClick={reset}
                        >
                            {t('common.action.reset')}
                        </Button>
                        <Button
                            type="submit"
                            color="teal"
                            variant="soft"
                            leftSection={<TbDeviceFloppy />}
                            loading={pending}
                            disabled={!dirty}
                        >
                            {t('common.action.save')}
                        </Button>
                    </Group>
                </Group>
            </Stack>
        </form>
    )
}
