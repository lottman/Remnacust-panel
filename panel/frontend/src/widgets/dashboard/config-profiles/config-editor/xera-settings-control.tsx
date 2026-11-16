import {
    Alert,
    Box,
    Button,
    Code,
    Group,
    NumberInput,
    Select,
    Stack,
    Text,
    UnstyledButton
} from '@mantine/core'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbAdjustmentsHorizontal, TbChevronDown } from 'react-icons/tb'

import { HeadingIcon } from '@shared/ui/heading-icon'

import {
    applyXeraAdaptiveSettings,
    newXeraAdaptiveSettings,
    readXeraSettings,
    validateXeraAdaptiveSettings,
    XERA_ADAPTIVE_MODES,
    XeraAdaptiveMode,
    XeraSettingsIssue,
    XeraSettingsError,
    XeraSettingsTarget
} from './xera-settings'

export type XeraEditorCoreMode = 'custom' | 'default' | 'loading' | 'error'

interface IProps {
    coreMode: XeraEditorCoreMode
    editorReady: boolean
    onApply: (source: string, next: string) => boolean
    value: string
}

interface DraftSettings {
    mode: XeraAdaptiveMode
    minStreams: number | string
    maxStreams: number | string
}

function AdaptiveFields({
    value,
    target,
    disabled,
    onApply
}: {
    value: string
    target: XeraSettingsTarget
    disabled: boolean
    onApply: IProps['onApply']
}) {
    const { t } = useTranslation()
    const [enabled, setEnabled] = useState(target.adaptive !== null)
    const [draft, setDraft] = useState<DraftSettings>(
        () => target.adaptive ?? newXeraAdaptiveSettings()
    )
    const [failure, setFailure] = useState<
        XeraSettingsIssue | 'document-changed' | 'apply-failed' | null
    >(null)
    const valid = validateXeraAdaptiveSettings(draft)
    const unchanged =
        target.adaptive !== null &&
        draft.mode === target.adaptive.mode &&
        draft.minStreams === target.adaptive.minStreams &&
        draft.maxStreams === target.adaptive.maxStreams
    const apply = () => {
        if (disabled || !enabled || !validateXeraAdaptiveSettings(draft)) return
        try {
            const next = applyXeraAdaptiveSettings(value, target.id, draft)
            setFailure(onApply(value, next) ? null : 'document-changed')
        } catch (error) {
            setFailure(error instanceof XeraSettingsError ? error.code : 'apply-failed')
        }
    }
    return (
        <Stack gap="sm">
            {!enabled && (
                <Group justify="space-between" align="center">
                    <Text size="sm" c="dimmed">
                        {t('xera-settings.manual')}
                    </Text>
                    <Button
                        disabled={disabled}
                        size="compact-sm"
                        variant="light"
                        onClick={() => {
                            setDraft(newXeraAdaptiveSettings())
                            setEnabled(true)
                            setFailure(null)
                        }}
                    >
                        {t('xera-settings.enable')}
                    </Button>
                </Group>
            )}
            <Select
                allowDeselect={false}
                data={XERA_ADAPTIVE_MODES.map((mode) => ({
                    value: mode,
                    label: t(`xera-settings.mode-${mode}`)
                }))}
                disabled={disabled || !enabled}
                label={t('xera-settings.mode')}
                onChange={(mode) => {
                    if (!mode) return
                    setDraft((current) => ({ ...current, mode: mode as XeraAdaptiveMode }))
                    setFailure(null)
                }}
                value={draft.mode}
            />
            <Group align="flex-start" grow>
                <NumberInput
                    allowDecimal={false}
                    allowNegative={false}
                    clampBehavior="none"
                    disabled={disabled || !enabled}
                    label={t('xera-settings.minimum')}
                    min={1}
                    max={32}
                    onChange={(minStreams) => {
                        setDraft((current) => ({ ...current, minStreams }))
                        setFailure(null)
                    }}
                    value={draft.minStreams}
                />
                <NumberInput
                    allowDecimal={false}
                    allowNegative={false}
                    clampBehavior="none"
                    disabled={disabled || !enabled}
                    label={t('xera-settings.maximum')}
                    min={1}
                    max={32}
                    onChange={(maxStreams) => {
                        setDraft((current) => ({ ...current, maxStreams }))
                        setFailure(null)
                    }}
                    value={draft.maxStreams}
                />
            </Group>
            {enabled && !valid && (
                <Alert color="red" role="alert">
                    {t('xera-settings.invalid-bounds')}
                </Alert>
            )}
            <Text c="dimmed" size="xs">
                {t('xera-settings.requests-help')}
            </Text>
            <Text c="dimmed" size="xs">
                {t('xera-settings.apply-help')}
            </Text>
            {failure && (
                <Alert color="red" role="alert">
                    {t(`xera-settings.${failure}`)}
                </Alert>
            )}
            <Group justify="flex-end">
                <Button
                    disabled={disabled || !enabled || !valid || unchanged}
                    onClick={apply}
                    size="sm"
                    variant="light"
                >
                    {t('xera-settings.apply')}
                </Button>
            </Group>
        </Stack>
    )
}

export function XeraSettingsControl({ coreMode, editorReady, onApply, value }: IProps) {
    const { t, i18n } = useTranslation()
    const panelId = useId()
    const [expanded, setExpanded] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [appliedText, setAppliedText] = useState<string | null>(null)
    const document = useMemo(() => (expanded ? readXeraSettings(value) : null), [expanded, value])
    const selected =
        selectedId === null
            ? document?.targets[0]
            : document?.targets.find((target) => target.id === selectedId)
    const disabled = coreMode !== 'custom' || !editorReady
    const modeHint =
        coreMode === 'custom'
            ? 'requires-core'
            : coreMode === 'default'
              ? 'requires-custom'
              : coreMode === 'loading'
                ? 'mode-loading'
                : 'mode-error'
    return (
        <Box
            dir={i18n.dir()}
            style={{ flexShrink: 0, borderBottom: '1px solid var(--mantine-color-default-border)' }}
        >
            <UnstyledButton
                aria-controls={panelId}
                aria-expanded={expanded}
                aria-label={t('xera-settings.title')}
                onClick={() => setExpanded((current) => !current)}
                p="sm"
                w="100%"
            >
                <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                        <HeadingIcon size={32}>
                            <TbAdjustmentsHorizontal size={18} />
                        </HeadingIcon>
                        <Text fw={600} size="sm">
                            {t('xera-settings.title')}
                        </Text>
                    </Group>
                    <TbChevronDown
                        aria-hidden
                        size={16}
                        style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
                    />
                </Group>
            </UnstyledButton>
            <Box hidden={!expanded} id={panelId}>
                {expanded && document && (
                    <Stack
                        gap="sm"
                        p="sm"
                        pt={0}
                        style={{
                            maxHeight: 'min(28vh, 260px)',
                            overflowY: 'auto',
                            overscrollBehavior: 'contain'
                        }}
                    >
                        <Text c="dimmed" size="xs">
                            {t(`xera-settings.${modeHint}`)}
                        </Text>
                        {document.issue ? (
                            <Alert color="yellow" role="alert">
                                {t(`xera-settings.${document.issue}`)}
                            </Alert>
                        ) : document.targets.length === 0 ? (
                            <Text size="sm" c="dimmed">
                                {t('xera-settings.empty')}
                            </Text>
                        ) : (
                            <>
                                <Select
                                    allowDeselect={false}
                                    data={document.targets.map((target) => ({
                                        value: target.id,
                                        label: `${t(`xera-settings.${target.kind}`)} · ${target.tag ?? `#${target.index + 1}`}`
                                    }))}
                                    label={t('xera-settings.target')}
                                    onChange={setSelectedId}
                                    value={selected?.id ?? null}
                                />
                                {!selected && (
                                    <Alert color="yellow" role="alert">
                                        {t('xera-settings.target-changed')}
                                    </Alert>
                                )}
                                {selected && (
                                    <>
                                        <Code
                                            style={{
                                                overflowWrap: 'anywhere',
                                                whiteSpace: 'normal'
                                            }}
                                        >
                                            {`${selected.kind}[${selected.index}].${selected.adaptivePath.slice(2).join('.')}`}
                                        </Code>
                                        <Text size="xs" c="dimmed">
                                            {t(
                                                selected.kind === 'inbounds'
                                                    ? 'xera-settings.inbound-help'
                                                    : 'xera-settings.outbound-help'
                                            )}
                                        </Text>
                                        {selected.issue ? (
                                            <Alert color="yellow" role="alert">
                                                {t(`xera-settings.${selected.issue}`)}
                                            </Alert>
                                        ) : (
                                            <AdaptiveFields
                                                disabled={disabled}
                                                key={`${selected.id}:${JSON.stringify(selected.adaptive)}`}
                                                onApply={(source, next) => {
                                                    if (!onApply(source, next)) return false
                                                    setAppliedText(next)
                                                    return true
                                                }}
                                                target={selected}
                                                value={value}
                                            />
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        {appliedText === value && (
                            <Text role="status" size="sm" c="teal">
                                {t('xera-settings.applied')}
                            </Text>
                        )}
                    </Stack>
                )}
            </Box>
        </Box>
    )
}
