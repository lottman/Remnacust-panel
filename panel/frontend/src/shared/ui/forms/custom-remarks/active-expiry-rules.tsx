import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Card,
    Divider,
    Group,
    MultiSelect,
    NumberInput,
    Paper,
    Select,
    Stack,
    Switch,
    Text
} from '@mantine/core'
import { RemarksManager } from '@widgets/dashboard/subscription-settings/settings/cards/managers/remarks-manager.widget'
import { useTranslation } from 'react-i18next'
import { PiArrowDown, PiArrowUp, PiClockCountdown, PiGlobe, PiPlus, PiTrash } from 'react-icons/pi'

import { useGetExternalSquads, useGetInternalSquads } from '@shared/api/hooks'
import { useUiText } from '@shared/i18n/interface-text'

import classes from './remarks-editor.module.css'
import { newExpiryRule, squadOptions, type ActiveExpiryRule } from './remarks-editor.utils'

function RulePreview({ rule }: { rule: ActiveExpiryRule }) {
    const uiText = useUiText()
    return (
        <Paper p="md" withBorder className={classes.preview}>
            <Text fw={600} size="sm">
                {uiText('remarks-preview')}
            </Text>
            <Text c="dimmed" size="xs" mb="sm">
                {uiText('remarks-preview-help')}
            </Text>
            <Stack gap="xs">
                {rule.remarks
                    .filter((line) => line.trim())
                    .map((line, index) => {
                        if (line.trim() === '{HOSTS}')
                            return (
                                <Group key={index} gap="xs">
                                    <PiGlobe />
                                    <Text size="sm">{uiText('remarks-example-hosts')}</Text>
                                </Group>
                            )
                        let text = line
                        let buttonText: string | undefined
                        try {
                            const action = JSON.parse(line)
                            if (action.type === 'link') {
                                text = action.text ?? ''
                                buttonText = action.buttonText
                            }
                        } catch {
                            text = line
                        }
                        const example = text
                            .replace(
                                /\{\{DAYS_LEFT\}\}/g,
                                String(Math.min(3, rule.daysBeforeExpiry))
                            )
                            .replace(/\{\{USERNAME\}\}/g, 'demo-user')
                        return (
                            <Stack gap={4} key={index}>
                                <Text size="sm" className={classes.wrap}>
                                    {example}
                                </Text>
                                {buttonText && <Badge variant="outline">{buttonText}</Badge>}
                            </Stack>
                        )
                    })}
            </Stack>
        </Paper>
    )
}

export function ActiveExpiryRules({
    rules,
    onChange,
    errors
}: {
    rules: ActiveExpiryRule[]
    onChange: (rules: ActiveExpiryRule[]) => void
    errors: Record<string, string>
}) {
    const uiText = useUiText()
    const { t } = useTranslation()
    const internal = useGetInternalSquads()
    const external = useGetExternalSquads()
    const update = (index: number, patch: Partial<ActiveExpiryRule>) =>
        onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))
    const move = (index: number, delta: number) => {
        const next = [...rules]
        ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
        onChange(next)
    }
    return (
        <Stack gap="md">
            <Text c="dimmed" size="sm">
                {uiText('remarks-active-help')}
            </Text>
            <Text size="sm">{uiText('remarks-rule-priority')}</Text>
            {!rules.length && (
                <Paper p="md" withBorder>
                    <Text c="dimmed" size="sm">
                        {uiText('remarks-no-rules')}
                    </Text>
                </Paper>
            )}
            {rules.map((rule, index) => {
                const prefix = 'activeExpiry.rules.' + index
                const invalid = Object.keys(errors).some(
                    (path) => path === prefix || path.startsWith(prefix + '.')
                )
                const marker = rule.remarks.some((line) => line.trim() === '{HOSTS}')
                return (
                    <Card key={rule.id} p="md" withBorder className={classes.rule}>
                        <Stack gap="md">
                            <Group justify="space-between">
                                <Group gap="sm">
                                    <Text fw={600}>
                                        {uiText('remarks-rule-number', { number: index + 1 })}
                                    </Text>
                                    <Badge color={marker ? 'cyan' : 'orange'} variant="light">
                                        {uiText(
                                            marker ? 'remarks-notes-hosts' : 'remarks-notes-only'
                                        )}
                                    </Badge>
                                </Group>
                                <Group gap={4}>
                                    <ActionIcon
                                        variant="subtle"
                                        disabled={index === 0}
                                        aria-label={uiText('remarks-rule-up', {
                                            number: index + 1
                                        })}
                                        onClick={() => move(index, -1)}
                                    >
                                        <PiArrowUp />
                                    </ActionIcon>
                                    <ActionIcon
                                        variant="subtle"
                                        disabled={index === rules.length - 1}
                                        aria-label={uiText('remarks-rule-down', {
                                            number: index + 1
                                        })}
                                        onClick={() => move(index, 1)}
                                    >
                                        <PiArrowDown />
                                    </ActionIcon>
                                    <ActionIcon
                                        color="red"
                                        variant="light"
                                        aria-label={uiText('remarks-remove-rule', {
                                            number: index + 1
                                        })}
                                        onClick={() =>
                                            onChange(rules.filter((_, i) => i !== index))
                                        }
                                    >
                                        <PiTrash />
                                    </ActionIcon>
                                </Group>
                            </Group>
                            <Switch
                                label={uiText('remarks-rule-enabled')}
                                checked={rule.enabled}
                                onChange={(e) =>
                                    update(index, { enabled: e.currentTarget.checked })
                                }
                            />
                            <div className={classes.conditions}>
                                <NumberInput
                                    label={uiText('remarks-window')}
                                    description={uiText('remarks-window-help')}
                                    min={1}
                                    max={3650}
                                    allowDecimal={false}
                                    allowNegative={false}
                                    value={rule.daysBeforeExpiry || ''}
                                    onChange={(value) =>
                                        update(index, {
                                            daysBeforeExpiry: typeof value === 'number' ? value : 0
                                        })
                                    }
                                    error={errors[prefix + '.daysBeforeExpiry']}
                                />
                                <Select
                                    label={uiText('remarks-scope')}
                                    allowDeselect={false}
                                    value={rule.scope}
                                    data={[
                                        { value: 'all', label: uiText('remarks-scope-all') },
                                        {
                                            value: 'selected',
                                            label: uiText('remarks-scope-selected')
                                        }
                                    ]}
                                    onChange={(scope) =>
                                        update(index, {
                                            scope: scope === 'selected' ? 'selected' : 'all'
                                        })
                                    }
                                    error={errors[prefix + '.scope']}
                                />
                            </div>
                            {rule.scope === 'selected' && (
                                <Stack gap="sm">
                                    <Text c="dimmed" size="sm">
                                        {uiText('remarks-scope-help')}
                                    </Text>
                                    <MultiSelect
                                        label={uiText('remarks-internal-squads')}
                                        searchable
                                        data={squadOptions(
                                            internal.data?.internalSquads ?? [],
                                            rule.internalSquadUuids,
                                            (id) => uiText('remarks-squad-unavailable', { id })
                                        )}
                                        value={rule.internalSquadUuids}
                                        onChange={(ids) =>
                                            update(index, { internalSquadUuids: ids })
                                        }
                                        error={errors[prefix + '.internalSquadUuids']}
                                        nothingFoundMessage={uiText('remarks-no-squads')}
                                    />
                                    <MultiSelect
                                        label={uiText('remarks-external-squads')}
                                        searchable
                                        data={squadOptions(
                                            external.data?.externalSquads ?? [],
                                            rule.externalSquadUuids,
                                            (id) => uiText('remarks-squad-unavailable', { id })
                                        )}
                                        value={rule.externalSquadUuids}
                                        onChange={(ids) =>
                                            update(index, { externalSquadUuids: ids })
                                        }
                                        error={errors[prefix + '.externalSquadUuids']}
                                        nothingFoundMessage={uiText('remarks-no-squads')}
                                    />
                                    {(internal.isPending || external.isPending) && (
                                        <Text role="status" c="dimmed" size="sm">
                                            {uiText('remarks-squads-loading')}
                                        </Text>
                                    )}
                                    {(internal.isError || external.isError) && (
                                        <Alert
                                            color="orange"
                                            title={uiText('remarks-squads-error')}
                                        >
                                            <Text size="sm">
                                                {uiText('remarks-squads-preserved')}
                                            </Text>
                                            <Button
                                                type="button"
                                                size="xs"
                                                variant="light"
                                                mt="xs"
                                                onClick={() => {
                                                    if (internal.isError) void internal.refetch()
                                                    if (external.isError) void external.refetch()
                                                }}
                                            >
                                                {t('common.action.try-again')}
                                            </Button>
                                        </Alert>
                                    )}
                                </Stack>
                            )}
                            <Divider />
                            <RemarksManager
                                mode="activeExpiry"
                                title={uiText('remarks-content')}
                                icon={<PiClockCountdown size={22} />}
                                iconColor="cyan"
                                initialRemarks={rule.remarks}
                                onChange={(remarks) => update(index, { remarks })}
                            />
                            {invalid && (
                                <Text role="alert" c="red" size="sm">
                                    {uiText('remarks-rule-invalid')}
                                </Text>
                            )}
                            {!marker && (
                                <Alert color="orange" title={uiText('remarks-notes-only')}>
                                    {uiText('remarks-notes-only-help')}
                                </Alert>
                            )}
                            <RulePreview rule={rule} />
                        </Stack>
                    </Card>
                )
            })}
            {errors['activeExpiry.rules'] && (
                <Text role="alert" c="red" size="sm">
                    {errors['activeExpiry.rules']}
                </Text>
            )}
            <Button
                type="button"
                disabled={rules.length >= 32}
                variant="light"
                leftSection={<PiPlus />}
                onClick={() =>
                    onChange([
                        ...rules,
                        newExpiryRule(crypto.randomUUID(), uiText('remarks-default-note'))
                    ])
                }
                style={{ alignSelf: 'flex-start' }}
            >
                {uiText('remarks-add-rule')}
            </Button>
        </Stack>
    )
}
