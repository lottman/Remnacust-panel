import type { JsonObject } from './autoselect-model'
import type { ClientFormat } from './client-template-model'

import {
    Alert,
    Badge,
    Button,
    Card,
    Group,
    Modal,
    Pagination,
    Select,
    Stack,
    Text,
    Textarea,
    Title
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbFileImport, TbPencil, TbPlus, TbTrash } from 'react-icons/tb'

import styles from './autoselect-panel.module.css'
import {
    addressRuleGroups,
    changeAddressRule,
    importAddressRules,
    parseAddressRuleImport,
    MAX_ADDRESS_RULE_TEXT_BYTES,
    type AddressRuleGroup
} from './geofile-address-rules'
import { addressRuleTargetKey, addressRuleTargets, type AddressRuleTarget } from './geofile-targets'

const selectedTargetKey = (target: AddressRuleTarget | undefined) =>
    target ? addressRuleTargetKey(target) : null

interface Editor {
    mode: 'addresses' | 'import'
    previous?: AddressRuleGroup
    addresses: string
    target: AddressRuleTarget | undefined
    initialTarget: AddressRuleTarget | undefined
    keepTargets?: boolean
}

type RuleErrorKey =
    | 'geofiles.editor-conflict'
    | 'geofiles.choose-target'
    | 'geofiles.manual-limit'
    | 'geofiles.manual-invalid'
    | 'geofiles.manual-import-invalid'
    | 'geofiles.manual-import-conditions'
    | 'geofiles.manual-import-format'

const failureKey = (failure: unknown, importing = false): RuleErrorKey => {
    const code = failure instanceof Error ? failure.message : ''
    return code === 'address-rule-stale'
        ? 'geofiles.editor-conflict'
        : code === 'address-rule-target'
          ? 'geofiles.choose-target'
          : code === 'address-rule-limit'
            ? 'geofiles.manual-limit'
            : code === 'address-rule-import-conditions'
              ? 'geofiles.manual-import-conditions'
              : code === 'address-rule-import-format'
                ? 'geofiles.manual-import-format'
                : importing
                  ? 'geofiles.manual-import-invalid'
                  : 'geofiles.manual-invalid'
}

export function GeofileAddressRules({
    config,
    format,
    getValue,
    onChange
}: {
    config: JsonObject
    format: ClientFormat
    getValue: () => string
    onChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const mobile = useMediaQuery('(max-width: 48em)')
    const [editor, setEditor] = useState<Editor | null>(null)
    const [error, setError] = useState<
        | 'geofiles.editor-conflict'
        | 'geofiles.choose-target'
        | 'geofiles.manual-limit'
        | 'geofiles.manual-invalid'
        | 'geofiles.manual-import-invalid'
        | 'geofiles.manual-import-conditions'
        | 'geofiles.manual-import-format'
        | null
    >(null)
    const [page, setPage] = useState(1)
    const importText = editor?.mode === 'import' ? editor.addresses : ''
    const preview = useMemo(() => {
        if (!importText.trim()) return null
        try {
            const rules = parseAddressRuleImport(importText)
            return {
                rules: rules.length,
                count: rules.reduce((sum, rule) => sum + rule.addresses.length, 0)
            }
        } catch (failure) {
            return { error: failureKey(failure, true) }
        }
    }, [importText])
    const { groups, invalid } = useMemo(() => {
        try {
            return { groups: addressRuleGroups(config, format), invalid: false }
        } catch {
            return { groups: [], invalid: true }
        }
    }, [config, format])
    const targets = addressRuleTargets(config, format)
    const defaultTarget = targets.find(
        (target) => target.kind === 'action' && target.name === 'DIRECT'
    )
    const editorTargets = [
        ...new Map(
            [...targets, ...(editor?.target ? [editor.target] : [])].map((target) => [
                addressRuleTargetKey(target),
                target
            ])
        ).values()
    ]
    const pages = Math.max(1, Math.ceil(groups.length / 10))
    const currentPage = Math.min(page, pages)
    const targetLabel = (target: AddressRuleTarget) =>
        target.kind === 'action' && target.name === 'DIRECT'
            ? t('geofiles.direct')
            : target.kind === 'action' && target.name === 'REJECT'
              ? t('geofiles.reject')
              : t('geofiles.route-target', { name: target.name })
    const close = () => {
        if (!editor) return
        const dirty =
            editor.addresses !== (editor.previous?.addresses.join('\n') ?? '') ||
            selectedTargetKey(editor.target) !== selectedTargetKey(editor.initialTarget) ||
            !!editor.keepTargets
        if (!dirty) {
            setEditor(null)
            return
        }
        modals.openConfirmModal({
            title: t('geofiles.editor-discard-title'),
            children: <Text size="sm">{t('geofiles.editor-discard-help')}</Text>,
            labels: { confirm: t('geofiles.discard-changes'), cancel: t('common.action.cancel') },
            onConfirm: () => {
                setEditor(null)
                setError(null)
            }
        })
    }
    const apply = (
        previous: AddressRuleGroup | undefined,
        addresses?: string,
        target?: AddressRuleTarget
    ) => {
        try {
            onChange(changeAddressRule(getValue(), format, previous, addresses, target))
            setEditor(null)
            setError(null)
        } catch (failure) {
            setError(failureKey(failure))
        }
    }
    const applyImport = () => {
        if (!editor) return
        try {
            if (!editor.keepTargets && !editor.target) throw new Error('address-rule-target')
            onChange(
                importAddressRules(
                    getValue(),
                    format,
                    editor.addresses,
                    editor.keepTargets ? undefined : editor.target
                )
            )
            setEditor(null)
            setError(null)
        } catch (failure) {
            setError(failureKey(failure, true))
        }
    }
    return (
        <Card p="md" className={styles.card}>
            <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                    <div className={styles.sectionHeader}>
                        <Title order={4}>{t('geofiles.manual-title')}</Title>
                        <Text size="sm" c="dimmed" mt={4}>
                            {t('geofiles.manual-help')}
                        </Text>
                    </div>
                    <Group gap="xs">
                        <Button
                            variant="default"
                            leftSection={<TbFileImport size={16} />}
                            disabled={invalid}
                            onClick={() => {
                                setError(null)
                                setEditor({
                                    mode: 'import',
                                    addresses: '',
                                    target: undefined,
                                    initialTarget: undefined
                                })
                            }}
                        >
                            {t('geofiles.manual-import')}
                        </Button>
                        <Button
                            leftSection={<TbPlus size={16} />}
                            disabled={invalid}
                            onClick={() => {
                                setError(null)
                                setEditor({
                                    mode: 'addresses',
                                    addresses: '',
                                    target: defaultTarget,
                                    initialTarget: defaultTarget
                                })
                            }}
                        >
                            {t('geofiles.manual-add')}
                        </Button>
                    </Group>
                </Group>
                {error && !editor && (
                    <Alert color="red" role="alert">
                        {t(error)}
                    </Alert>
                )}
                {invalid && (
                    <Alert color="red" role="alert">
                        {t('geofiles.manual-invalid')} {t('geofiles.manual-help')}
                    </Alert>
                )}
                {!invalid && !groups.length && (
                    <Text size="sm" c="dimmed">
                        {t('geofiles.manual-empty')}
                    </Text>
                )}
                {groups.slice((currentPage - 1) * 10, currentPage * 10).map((group) => (
                    <Group
                        key={group.start}
                        justify="space-between"
                        wrap="wrap"
                        className={styles.section}
                    >
                        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                            <Group gap="xs">
                                <Badge variant="light">{targetLabel(group.target)}</Badge>
                                {group.noResolve && (
                                    <Badge variant="outline" dir="ltr">
                                        no-resolve
                                    </Badge>
                                )}
                                <Text size="xs" c="dimmed">
                                    {t('geofiles.address-count', { count: group.addresses.length })}
                                </Text>
                            </Group>
                            <Text size="sm" className={styles.summary} lineClamp={2} dir="auto">
                                {group.addresses.slice(0, 3).join(', ')}
                            </Text>
                            {group.oversized && (
                                <Alert color="yellow" role="status">
                                    {t('geofiles.manual-limit')} {t('geofiles.manual-help')}
                                </Alert>
                            )}
                        </Stack>
                        <Group gap="xs">
                            <Button
                                variant="default"
                                leftSection={<TbPencil size={16} />}
                                disabled={group.oversized}
                                onClick={() => {
                                    setError(null)
                                    setEditor({
                                        mode: 'addresses',
                                        previous: group,
                                        addresses: group.addresses.join('\n'),
                                        target: group.target,
                                        initialTarget: group.target
                                    })
                                }}
                            >
                                {t('common.action.edit')}
                            </Button>
                            <Button
                                variant="subtle"
                                color="red"
                                aria-label={t('common.action.delete')}
                                onClick={() =>
                                    modals.openConfirmModal({
                                        title: t('geofiles.manual-delete'),
                                        labels: {
                                            confirm: t('common.action.delete'),
                                            cancel: t('common.action.cancel')
                                        },
                                        confirmProps: { color: 'red' },
                                        onConfirm: () => apply(group)
                                    })
                                }
                            >
                                <TbTrash size={16} />
                            </Button>
                        </Group>
                    </Group>
                ))}
                {pages > 1 && (
                    <Pagination
                        total={pages}
                        value={currentPage}
                        onChange={setPage}
                        size="sm"
                        siblings={0}
                    />
                )}
            </Stack>
            <Modal
                opened={editor !== null}
                onClose={close}
                title={t(
                    editor?.mode === 'import' ? 'geofiles.manual-import' : 'geofiles.manual-title'
                )}
                size="lg"
                fullScreen={mobile}
                closeButtonProps={{ 'aria-label': t('common.action.close') }}
            >
                {editor && (
                    <Stack gap="md">
                        <Textarea
                            label={t(
                                editor.mode === 'import'
                                    ? 'geofiles.manual-import-json'
                                    : 'geofiles.addresses'
                            )}
                            description={t(
                                editor.mode === 'import'
                                    ? 'geofiles.manual-import-help'
                                    : 'geofiles.manual-address-help'
                            )}
                            placeholder={
                                editor.mode === 'import'
                                    ? '{"type":"field","domain":["domain:example.com"],"outboundTag":"direct"}'
                                    : 'example.com\nfull:login.example.com\n192.0.2.0/24'
                            }
                            value={editor.addresses}
                            onChange={(event) => {
                                setError(null)
                                setEditor({ ...editor, addresses: event.currentTarget.value })
                            }}
                            minRows={10}
                            autosize
                            maxRows={22}
                            maxLength={MAX_ADDRESS_RULE_TEXT_BYTES}
                            spellCheck={false}
                            autoCapitalize="off"
                            dir="ltr"
                        />
                        {preview &&
                            (preview.error ? (
                                <Alert color="red" role="alert">
                                    {t(preview.error)}
                                </Alert>
                            ) : (
                                <Text size="sm" role="status">
                                    {t('geofiles.manual-import-summary', {
                                        rules: preview.rules,
                                        count: preview.count
                                    })}
                                </Text>
                            ))}
                        <Select
                            label={t('geofiles.target')}
                            description={
                                editor.mode === 'import'
                                    ? t('geofiles.manual-import-target-help')
                                    : undefined
                            }
                            value={editor.keepTargets ? 'pasted' : selectedTargetKey(editor.target)}
                            placeholder={t('geofiles.choose-target')}
                            allowDeselect={false}
                            searchable
                            data={[
                                ...(editor.mode === 'import'
                                    ? [
                                          {
                                              value: 'pasted',
                                              label: t('geofiles.manual-import-targets')
                                          }
                                      ]
                                    : []),
                                ...editorTargets.map((target) => ({
                                    value: addressRuleTargetKey(target),
                                    label: targetLabel(target)
                                }))
                            ]}
                            onChange={(value) => {
                                setError(null)
                                if (editor.mode === 'import' && value === 'pasted') {
                                    setEditor({ ...editor, target: undefined, keepTargets: true })
                                    return
                                }
                                const target = editorTargets.find(
                                    (target) => addressRuleTargetKey(target) === value
                                )
                                if (target) setEditor({ ...editor, target, keepTargets: false })
                            }}
                        />
                        {error && !preview?.error && (
                            <Alert color="red" role="alert">
                                {t(error)}
                            </Alert>
                        )}
                        <Group justify="flex-end">
                            <Button variant="default" onClick={close}>
                                {t('common.action.cancel')}
                            </Button>
                            <Button
                                disabled={
                                    (!editor.target && !editor.keepTargets) ||
                                    !editor.addresses.trim() ||
                                    !!preview?.error
                                }
                                onClick={() =>
                                    editor.mode === 'import'
                                        ? applyImport()
                                        : apply(editor.previous, editor.addresses, editor.target)
                                }
                            >
                                {t(
                                    editor.mode === 'import'
                                        ? 'geofiles.manual-import-apply'
                                        : 'common.action.save'
                                )}
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Card>
    )
}
