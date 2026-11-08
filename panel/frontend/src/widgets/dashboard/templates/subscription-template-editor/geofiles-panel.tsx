import type { Geofile, GeofileSelection } from './geofile-types'
import type { GetHostsCommand } from '@remnawave/backend-contract'

import {
    Accordion,
    Alert,
    Anchor,
    Badge,
    Button,
    Card,
    FileInput,
    Group,
    Loader,
    NumberInput,
    TagsInput,
    Progress,
    Select,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Title
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbPencil, TbPlus, TbTrash } from 'react-icons/tb'

import { instance } from '@shared/api'
import { useGetSubscriptionSettings } from '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks'
import { ROUTES } from '@shared/constants/routes'

import { type JsonObject } from './autoselect-model'
import styles from './autoselect-panel.module.css'
import { editClientTemplate, readClientTemplate, type ClientFormat } from './client-template-model'
import { GeofileAddressRules } from './geofile-address-rules-panel'
import { GeofileEditorModal } from './geofile-editor-modal'
import {
    attachLibraryGeofile,
    compatibleGeofile,
    geofileCatalog,
    replaceLibraryGeofile
} from './geofile-library-model'
import { geofilePresets } from './geofile-presets'
import { GeofileRefreshSettings } from './geofile-refresh-settings'
import { geofileTargetAliases, geofileTargets } from './geofile-targets'
interface Reference {
    id: string
    categories?: string[]
    target: string
    downloadToClient?: boolean
    clientRefreshIntervalSeconds?: number
}
const queryKey = ['template-geofiles']
const kinds = [
    'geoip',
    'geosite',
    'singbox-json',
    'singbox-srs',
    'mihomo-domain',
    'mihomo-ipcidr',
    'mihomo-classical',
    'mihomo-text-domain',
    'mihomo-text-ipcidr'
] as const

export function GeofilesPanel({
    text,
    config,
    format,
    onChange,
    getValue,
    hosts = []
}: {
    hosts?: GetHostsCommand.Response['response']
    text: string
    config: JsonObject
    format: ClientFormat
    onChange: (value: string) => void
    getValue: () => string
}) {
    const { t } = useTranslation()
    const jsonSettingName = t('subscription-settings.widget.serve-json-at-base-subscription')
    const client = useQueryClient()
    const filesQuery = useQuery({
        queryKey,
        queryFn: async ({ signal }) =>
            (await instance.get<{ response: Geofile[] }>('/api/geofiles', { signal })).data
                .response,
        staleTime: 20_000,
        refetchInterval: 60_000,
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always'
    })
    const files = filesQuery.data ?? []
    const [uploadSource, setUploadSource] = useState('library')
    const [openedFiles, setOpenedFiles] = useState<string[]>(['0'])
    const [name, setName] = useState('')
    const [kind, setKind] = useState<string | null>('geoip')
    const [url, setUrl] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [progress, setProgress] = useState<number | null>(null)
    const [error, setError] = useState<
        | 'geofiles.operation-failed'
        | 'geofiles.delete-in-use'
        | 'geofiles.attach-failed'
        | 'geofiles.copy-selection-changed'
        | null
    >(null)
    const [selection, setSelection] = useState<string | null>(null)
    const [editingFile, setEditingFile] = useState<Geofile | null>(null)
    const rememberFile = async (item: Geofile) => {
        await client.cancelQueries({ queryKey })
        client.setQueryData<Geofile[]>(queryKey, (previous) => [
            item,
            ...(previous ?? []).filter((existing) => existing.id !== item.id)
        ])
    }
    const savedFile = async (item: Geofile, sourceId: string, selections: GeofileSelection[]) => {
        await rememberFile(item)
        if (item.id !== sourceId && compatibleGeofile(item.kind, format)) {
            try {
                const current = getValue()
                const changed = replaceLibraryGeofile(
                    current,
                    format,
                    sourceId,
                    item,
                    selections
                        .filter((selection) => selection.format === format)
                        .map((selection) => selection.categories)
                )
                if (changed !== current) onChange(changed)
            } catch (failure) {
                setError(
                    failure instanceof Error && failure.message === 'geofile-copy-selection'
                        ? 'geofiles.copy-selection-changed'
                        : 'geofiles.attach-failed'
                )
            }
        }
        setSelection(`file:${item.id}`)
        await client.invalidateQueries({ queryKey: ['geofile-content', sourceId] })
        await client.invalidateQueries({ queryKey })
    }
    const editPreset = useMutation({
        mutationFn: async (item: (typeof geofilePresets)[number]) =>
            (
                await instance.post<{ response: Geofile }>(
                    '/api/geofiles/import',
                    { name: item.name, kind: item.kind, url: item.url },
                    { timeout: 45_000 }
                )
            ).data.response,
        onSuccess: async (item) => {
            await rememberFile(item)
            setSelection(`file:${item.id}`)
            setEditingFile(item)
            await client.invalidateQueries({ queryKey })
        },
        onError: () => setError('geofiles.operation-failed')
    })
    const requestedPreset = geofilePresets.find((item) => selection === `preset:${item.id}`)
    const selectedFile = files.find(
        (item) =>
            selection === `file:${item.id}` ||
            (!!requestedPreset && item.refresh?.sourceUrl === requestedPreset.url)
    )
    const selected = selectedFile?.id ?? null
    const preset = selectedFile ? undefined : requestedPreset
    const catalogValue = selected ? `file:${selected}` : preset ? `preset:${preset.id}` : null
    const refs: Reference[] = Array.isArray(config.remnacust?.geofiles)
        ? config.remnacust.geofiles
        : []
    const needsJsonDelivery = format === 'XRAY_JSON' && refs.length > 0
    const subscriptionSettings = useGetSubscriptionSettings({
        rQueryParams: {
            enabled: needsJsonDelivery,
            refetchOnMount: 'always',
            refetchOnWindowFocus: 'always'
        }
    })
    const jsonAtBase = subscriptionSettings.data?.serveJsonAtBaseSubscription
    const targetAliases = geofileTargetAliases(config, format)
    const hostLabels = new Map(hosts.map((host) => [`host:${host.uuid}`, host.remark]))
    const targets = [
        ...geofileTargets(config, format),
        ...(format === 'XRAY_JSON' ? hosts.map((host) => `host:${host.uuid}`) : [])
    ]
    const patch = (value: Reference[]) => {
        try {
            onChange(
                editClientTemplate(
                    text,
                    format,
                    ['remnacust', 'geofiles'],
                    value.length
                        ? value.map(({ downloadToClient, ...ref }) => ({
                              ...ref,
                              target:
                                  ref.target ?? (downloadToClient === false ? 'DIRECT' : ref.target)
                          }))
                        : undefined
                )
            )
            setError(null)
        } catch {
            setError('geofiles.operation-failed')
        }
    }
    const attach = (item: Geofile) => {
        const currentText = getValue()
        const currentRefs: Reference[] =
            readClientTemplate(currentText, format).remnacust?.geofiles ?? []
        const existing = currentRefs.findIndex((ref) => ref.id === item.id)
        onChange(attachLibraryGeofile(currentText, format, item))
        const key = String(existing < 0 ? currentRefs.length : existing)
        setOpenedFiles((opened) => [...new Set([...opened, key])])
        requestAnimationFrame(() =>
            document.getElementById(`geofile-settings-${key}`)?.scrollIntoView({ block: 'start' })
        )
    }
    const upload = useMutation({
        mutationFn: async (source: 'file' | 'url' | (typeof geofilePresets)[number]) => {
            setProgress(null)
            if (source === 'file') {
                if (!file || file.size > 64 * 1024 * 1024) throw new Error('file-size')
                return (
                    await instance.post<{ response: Geofile }>('/api/geofiles/upload', file, {
                        params: { name: name.trim() || file.name, kind },
                        headers: { 'Content-Type': 'application/octet-stream' },
                        timeout: 45_000,
                        onUploadProgress: (event) =>
                            setProgress(
                                event.total
                                    ? Math.min(100, (event.loaded / event.total) * 100)
                                    : null
                            )
                    })
                ).data.response
            }
            return (
                await instance.post<{ response: Geofile }>(
                    '/api/geofiles/import',
                    typeof source === 'object'
                        ? { name: source.name, kind: source.kind, url: source.url }
                        : { name: name.trim(), kind, url: url.trim() },
                    { timeout: 45_000 }
                )
            ).data.response
        },
        onSuccess: async (item, source) => {
            await rememberFile(item)
            setSelection(`file:${item.id}`)
            setError(null)
            setUploadSource('library')
            if (compatibleGeofile(item.kind, format)) {
                try {
                    attach(item)
                } catch {
                    setError('geofiles.attach-failed')
                }
            }
            if (source === 'file') setFile(null)
            if (source === 'url') setUrl('')
            setProgress(null)
            await client.invalidateQueries({ queryKey })
        },
        onError: () => {
            setError('geofiles.operation-failed')
            setProgress(null)
        }
    })
    const remove = useMutation({
        mutationFn: (id: string) => instance.delete(`/api/geofiles/${id}`),
        onSuccess: async (_, id) => {
            await client.cancelQueries({ queryKey })
            client.setQueryData<Geofile[]>(queryKey, (previous) =>
                (previous ?? []).filter((item) => item.id !== id)
            )
            setSelection((previous) => (previous === `file:${id}` ? null : previous))
            try {
                const currentText = getValue()
                const currentRefs: Reference[] =
                    readClientTemplate(currentText, format).remnacust?.geofiles ?? []
                if (currentRefs.some((reference) => reference.id === id))
                    onChange(
                        editClientTemplate(
                            currentText,
                            format,
                            ['remnacust', 'geofiles'],
                            currentRefs.filter((reference) => reference.id !== id)
                        )
                    )
                setError(null)
            } catch {
                setError('geofiles.operation-failed')
            }
            await client.invalidateQueries({ queryKey })
        },
        onError: (failure) =>
            setError(
                isAxiosError(failure) && failure.response?.status === 409
                    ? 'geofiles.delete-in-use'
                    : 'geofiles.operation-failed'
            )
    })
    const existingUrls = [
        ...(config.geodata?.assets ?? []).map((asset: JsonObject) => ({
            name: asset.file,
            url: asset.url
        })),
        ...Object.entries(config['geox-url'] ?? {}).map(([name, url]) => ({ name, url })),
        ...Object.entries(config['rule-providers'] ?? {}).map(([name, provider]) => ({
            name,
            url: (provider as JsonObject).url
        })),
        ...(config.route?.rule_set ?? [])
            .filter((item: JsonObject) => item.url)
            .map((item: JsonObject) => ({ name: item.tag, url: item.url }))
    ].filter((item) => typeof item.url === 'string')
    return (
        <Stack gap="md" className={styles.panel}>
            <Card p="md">
                <Title order={3}>{t('geofiles.title')}</Title>
                <Text size="sm" c="dimmed" mt={4}>
                    {t('geofiles.help')}
                </Text>
            </Card>
            {needsJsonDelivery && subscriptionSettings.isSuccess && jsonAtBase === false && (
                <Alert
                    role="status"
                    aria-live="polite"
                    color="yellow"
                    title={t('geofiles.json-delivery-title')}
                >
                    <Stack gap="xs">
                        <Text size="sm">
                            {t('geofiles.json-setting-disabled', { setting: jsonSettingName })}
                        </Text>
                        <Anchor
                            href={ROUTES.DASHBOARD.MANAGEMENT.SUBSCRIPTION_SETTINGS}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                        >
                            {t('geofiles.open-subscription-settings')}
                        </Anchor>
                    </Stack>
                </Alert>
            )}
            {(error || filesQuery.isError) && (
                <Alert color="red" withCloseButton onClose={() => setError(null)}>
                    {t(error ?? 'geofiles.operation-failed')}{' '}
                    {filesQuery.isError && (
                        <Button variant="subtle" onClick={() => void filesQuery.refetch()}>
                            {t('common.action.refresh')}
                        </Button>
                    )}
                </Alert>
            )}
            <Card p="md" className={styles.card}>
                <Stack gap="md">
                    <Title order={4}>{t('geofiles.presets')}</Title>
                    <Text size="sm" c="dimmed">
                        {t('geofiles.library-help')}
                    </Text>
                    <SegmentedControl
                        fullWidth
                        className={styles.sourceSwitch}
                        disabled={upload.isPending}
                        value={uploadSource}
                        onChange={setUploadSource}
                        data={[
                            { value: 'library', label: t('geofiles.library-source') },
                            { value: 'file', label: t('geofiles.from-computer') },
                            { value: 'url', label: t('geofiles.from-url') }
                        ]}
                    />
                    {uploadSource === 'library' && (
                        <>
                            {filesQuery.isPending ? (
                                <Loader size="sm" />
                            ) : (
                                <Select
                                    searchable
                                    clearable
                                    label={t('geofiles.choose-preset')}
                                    placeholder={t('geofiles.catalog-placeholder')}
                                    value={catalogValue}
                                    onChange={(value) => {
                                        setSelection(value)
                                        setError(null)
                                    }}
                                    data={geofileCatalog(files).map((group) => ({
                                        ...group,
                                        group:
                                            group.group === 'uploaded'
                                                ? t('geofiles.uploaded-group')
                                                : group.group
                                    }))}
                                    nothingFoundMessage={t('common.message.nothing-found')}
                                />
                            )}
                            {preset && (
                                <>
                                    <Text size="sm">
                                        {t(`geofiles.preset-${preset.description}`)}
                                    </Text>
                                    <Text size="xs" c="dimmed" dir="ltr" className={styles.path}>
                                        {preset.url}
                                    </Text>
                                </>
                            )}
                            {selectedFile && (
                                <>
                                    <Text size="sm" c="dimmed">
                                        {t('geofiles.available-everywhere')}
                                    </Text>
                                    {!compatibleGeofile(selectedFile.kind, format) && (
                                        <Alert color="yellow">
                                            {t('geofiles.incompatible-format')}
                                        </Alert>
                                    )}
                                </>
                            )}
                            {(selectedFile || preset) && (
                                <div className={styles.libraryActions}>
                                    <Button
                                        variant="default"
                                        leftSection={<TbPencil size={16} />}
                                        loading={editPreset.isPending}
                                        disabled={upload.isPending || remove.isPending}
                                        onClick={() => {
                                            if (selectedFile) setEditingFile(selectedFile)
                                            else if (preset) editPreset.mutate(preset)
                                        }}
                                    >
                                        {t(preset ? 'geofiles.edit-preset' : 'geofiles.edit-file')}
                                    </Button>
                                    <Button
                                        leftSection={<TbPlus size={16} />}
                                        disabled={
                                            !!selectedFile &&
                                            !compatibleGeofile(selectedFile.kind, format)
                                        }
                                        loading={upload.isPending}
                                        onClick={() => {
                                            if (preset) upload.mutate(preset)
                                            else if (
                                                selectedFile &&
                                                compatibleGeofile(selectedFile.kind, format)
                                            )
                                                (() => {
                                                    try {
                                                        attach(selectedFile)
                                                        setError(null)
                                                    } catch {
                                                        setError('geofiles.attach-failed')
                                                    }
                                                })()
                                        }}
                                    >
                                        {t(
                                            preset
                                                ? 'geofiles.import-preset'
                                                : refs.some((ref) => ref.id === selected)
                                                  ? 'geofiles.configure-attached'
                                                  : 'geofiles.attach'
                                        )}
                                    </Button>
                                    {selectedFile && (
                                        <Button
                                            color="red"
                                            variant="subtle"
                                            leftSection={<TbTrash size={16} />}
                                            loading={remove.isPending}
                                            onClick={() =>
                                                modals.openConfirmModal({
                                                    title: t('geofiles.delete-title'),
                                                    children: (
                                                        <Text>{t('geofiles.delete-help')}</Text>
                                                    ),
                                                    labels: {
                                                        confirm: t('common.action.delete'),
                                                        cancel: t('common.action.cancel')
                                                    },
                                                    confirmProps: { color: 'red' },
                                                    onConfirm: () => remove.mutate(selectedFile.id)
                                                })
                                            }
                                        >
                                            {t('geofiles.delete-from-library')}
                                        </Button>
                                    )}
                                </div>
                            )}
                            {selectedFile && (
                                <>
                                    <Accordion variant="separated">
                                        <Accordion.Item value="metadata">
                                            <Accordion.Control>
                                                {t('geofiles.library-settings')}
                                            </Accordion.Control>
                                            <Accordion.Panel>
                                                <Stack gap="md" className={styles.libraryBody}>
                                                    <Text size="xs" c="dimmed">
                                                        {t('geofiles.library-settings-help')}
                                                    </Text>
                                                    <Text
                                                        size="xs"
                                                        c="dimmed"
                                                        dir="ltr"
                                                        className={styles.path}
                                                    >
                                                        SHA-256: {selectedFile.sha256}
                                                    </Text>
                                                    <GeofileRefreshSettings
                                                        key={JSON.stringify([
                                                            selectedFile.id,
                                                            selectedFile.refresh?.sourceUrl,
                                                            selectedFile.refresh?.enabled,
                                                            selectedFile.refresh?.intervalSeconds
                                                        ])}
                                                        id={selectedFile.id}
                                                        refresh={selectedFile.refresh}
                                                        onUpdated={() =>
                                                            client.invalidateQueries({
                                                                queryKey
                                                            })
                                                        }
                                                    />
                                                </Stack>
                                            </Accordion.Panel>
                                        </Accordion.Item>
                                    </Accordion>
                                </>
                            )}
                        </>
                    )}
                    {uploadSource !== 'library' && (
                        <>
                            <Stack gap="md">
                                <div className={styles.fields}>
                                    <TextInput
                                        label={t('geofiles.name')}
                                        maxLength={128}
                                        value={name}
                                        onChange={(event) => setName(event.currentTarget.value)}
                                    />
                                    <Select
                                        label={t('geofiles.format')}
                                        value={kind}
                                        onChange={setKind}
                                        allowDeselect={false}
                                        data={kinds.map((value) => ({
                                            value,
                                            label: t(`geofiles.kind-${value}`)
                                        }))}
                                    />
                                </div>
                                {!compatibleGeofile(kind ?? '', format) && (
                                    <Text size="sm" c="dimmed">
                                        {t('geofiles.library-only-upload')}
                                    </Text>
                                )}
                                {uploadSource === 'file' && (
                                    <>
                                        <FileInput
                                            label={t('geofiles.from-computer')}
                                            placeholder={t('geofiles.click-to-upload')}
                                            accept=".dat,.srs,.json,.yaml,.yml,.txt"
                                            value={file}
                                            onChange={(value) => {
                                                setFile(value)
                                                if (value && !name) setName(value.name)
                                                if (value) {
                                                    const filename = value.name.toLowerCase()
                                                    if (filename.endsWith('.srs'))
                                                        setKind('singbox-srs')
                                                    else if (filename.endsWith('.json'))
                                                        setKind('singbox-json')
                                                    else if (
                                                        filename.endsWith('.dat') &&
                                                        filename.includes('geosite')
                                                    )
                                                        setKind('geosite')
                                                    else if (
                                                        filename.endsWith('.dat') &&
                                                        filename.includes('geoip')
                                                    )
                                                        setKind('geoip')
                                                }
                                            }}
                                            clearable
                                            error={
                                                file && file.size > 64 * 1024 * 1024
                                                    ? t('geofiles.size-limit')
                                                    : undefined
                                            }
                                        />
                                        <Button
                                            disabled={
                                                !file || !kind || file.size > 64 * 1024 * 1024
                                            }
                                            loading={upload.isPending}
                                            onClick={() => upload.mutate('file')}
                                        >
                                            {t(
                                                compatibleGeofile(kind ?? '', format)
                                                    ? 'geofiles.upload-and-attach'
                                                    : 'geofiles.upload'
                                            )}
                                        </Button>
                                    </>
                                )}
                                {progress !== null && (
                                    <Progress value={progress} aria-label={t('geofiles.upload')} />
                                )}
                                {uploadSource === 'url' && (
                                    <>
                                        <TextInput
                                            label={t('geofiles.from-url')}
                                            dir="ltr"
                                            type="url"
                                            placeholder="https://example.com/geosite.dat"
                                            value={url}
                                            onChange={(event) => setUrl(event.currentTarget.value)}
                                        />
                                        <Button
                                            variant="light"
                                            disabled={!url.trim() || !name.trim() || !kind}
                                            loading={upload.isPending}
                                            onClick={() => upload.mutate('url')}
                                        >
                                            {t(
                                                compatibleGeofile(kind ?? '', format)
                                                    ? 'geofiles.import-and-attach'
                                                    : 'geofiles.import'
                                            )}
                                        </Button>
                                    </>
                                )}
                                <Text size="xs" c="dimmed">
                                    {t('geofiles.security-help')}
                                </Text>
                            </Stack>
                        </>
                    )}
                </Stack>
            </Card>
            {!refs.length && (
                <Card withBorder p="lg">
                    <Text fw={600}>{t('geofiles.empty-title')}</Text>
                    <Text size="sm" c="dimmed" mt={4}>
                        {t('geofiles.empty-help')}
                    </Text>
                </Card>
            )}
            {!!refs.length && (
                <Title order={4}>{t('geofiles.attached-count', { count: refs.length })}</Title>
            )}
            <Accordion
                multiple
                value={openedFiles}
                onChange={setOpenedFiles}
                variant="separated"
                className={styles.selections}
            >
                {refs.map((reference, index) => {
                    const item = files.find((file) => file.id === reference.id)
                    const categories = reference.categories ?? []
                    const dat = !!item && ['geoip', 'geosite'].includes(item.kind)
                    const storedTarget =
                        reference.target ?? (reference.downloadToClient === false ? 'DIRECT' : '')
                    const target = targetAliases[storedTarget] ?? storedTarget
                    return (
                        <Accordion.Item
                            key={`${reference.id}:${index}`}
                            value={String(index)}
                            id={`geofile-settings-${index}`}
                            className={styles.fileItem}
                        >
                            <Accordion.Control>
                                <Group justify="space-between" gap="xs" wrap="wrap">
                                    <div className={styles.summary}>
                                        <Text fw={600}>{item?.name ?? reference.id}</Text>
                                        <Text size="xs" c={target === 'REJECT' ? 'red' : 'dimmed'}>
                                            {item?.kind} ·{' '}
                                            {target === 'DIRECT'
                                                ? t('geofiles.direct')
                                                : target === 'REJECT'
                                                  ? t('geofiles.reject')
                                                  : (hostLabels.get(target) ?? target)}
                                        </Text>
                                    </div>
                                    <Group gap="xs">
                                        {dat && !categories.length && (
                                            <Badge variant="light" color="yellow">
                                                {t('geofiles.select-category')}
                                            </Badge>
                                        )}
                                        <Badge variant="light" color="blue">
                                            {t('geofiles.delivery-auto')}
                                        </Badge>
                                    </Group>
                                </Group>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <Stack gap="md" className={styles.fileDetails}>
                                    {!item && !filesQuery.isPending && (
                                        <Alert color="red">{t('geofiles.missing')}</Alert>
                                    )}
                                    {item && !compatibleGeofile(item.kind, format) && (
                                        <Alert color="yellow">
                                            {t('geofiles.incompatible-format')}
                                        </Alert>
                                    )}
                                    {item && ['geoip', 'geosite'].includes(item.kind) && (
                                        <TagsInput
                                            label={t('geofiles.categories')}
                                            description={t('geofiles.categories-help')}
                                            clearable
                                            value={categories}
                                            data={[
                                                ...new Set([
                                                    ...(item.categories ?? []),
                                                    ...categories
                                                ])
                                            ]}
                                            error={
                                                !categories.length
                                                    ? t('geofiles.select-category')
                                                    : undefined
                                            }
                                            onChange={(value) =>
                                                patch(
                                                    refs.map((ref, i) =>
                                                        i === index
                                                            ? { ...ref, categories: value }
                                                            : ref
                                                    )
                                                )
                                            }
                                        />
                                    )}
                                    <div className={styles.fields}>
                                        <Select
                                            label={t('geofiles.target')}
                                            placeholder={t('geofiles.choose-target')}
                                            error={
                                                !target ? t('geofiles.choose-target') : undefined
                                            }
                                            value={target || null}
                                            allowDeselect={false}
                                            searchable
                                            data={[...new Set([...targets, target])]
                                                .filter(Boolean)
                                                .map((value) => ({
                                                    value,
                                                    label:
                                                        value === 'DIRECT'
                                                            ? t('geofiles.direct')
                                                            : value === 'REJECT'
                                                              ? t('geofiles.reject')
                                                              : hostLabels.has(value)
                                                                ? t('geofiles.via-host', {
                                                                      name: hostLabels.get(value)
                                                                  })
                                                                : value
                                                }))}
                                            onChange={(value) =>
                                                value &&
                                                patch(
                                                    refs.map((ref, i) =>
                                                        i === index
                                                            ? { ...ref, target: value }
                                                            : ref
                                                    )
                                                )
                                            }
                                        />
                                        <NumberInput
                                            hideControls
                                            label={t('geofiles.client-interval')}
                                            description={t('geofiles.client-interval-auto-help')}
                                            min={5}
                                            max={43200}
                                            allowDecimal={false}
                                            value={
                                                (reference.clientRefreshIntervalSeconds ?? 86400) /
                                                60
                                            }
                                            onChange={(value) => {
                                                if (typeof value === 'number')
                                                    patch(
                                                        refs.map((ref, i) =>
                                                            i === index
                                                                ? {
                                                                      ...ref,
                                                                      clientRefreshIntervalSeconds:
                                                                          value * 60
                                                                  }
                                                                : ref
                                                        )
                                                    )
                                            }}
                                        />
                                    </div>
                                    <Group justify="flex-end" className={styles.selectionActions}>
                                        {item && (
                                            <Button
                                                variant="default"
                                                leftSection={<TbPencil size={16} />}
                                                onClick={() => setEditingFile(item)}
                                            >
                                                {t('geofiles.edit-file')}
                                            </Button>
                                        )}
                                        <Button
                                            color="red"
                                            variant="subtle"
                                            onClick={() => {
                                                patch(refs.filter((_, i) => i !== index))
                                                setOpenedFiles((opened) =>
                                                    opened
                                                        .filter((key) => Number(key) !== index)
                                                        .map((key) =>
                                                            String(
                                                                Number(key) > index
                                                                    ? Number(key) - 1
                                                                    : Number(key)
                                                            )
                                                        )
                                                )
                                            }}
                                        >
                                            {t('geofiles.detach')}
                                        </Button>
                                    </Group>
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    )
                })}
            </Accordion>
            <Accordion variant="separated">
                <Accordion.Item value="delivery-guide">
                    <Accordion.Control>{t('geofiles.delivery-title')}</Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="sm">
                            <Text size="sm">
                                {t(
                                    format === 'XRAY_JSON'
                                        ? 'geofiles.delivery-xray'
                                        : 'geofiles.delivery-native',
                                    { setting: jsonSettingName }
                                )}
                            </Text>
                            {format === 'XRAY_JSON' && (
                                <Text size="xs" c="dimmed">
                                    {t('geofiles.xray-download-limit')}
                                </Text>
                            )}
                            {refs.some(
                                (ref) =>
                                    files.find((file) => file.id === ref.id)?.kind === 'singbox-srs'
                            ) && (
                                <Text size="xs" c="dimmed">
                                    {t('geofiles.srs-download-limit')}
                                </Text>
                            )}
                            <Text size="sm">{t('geofiles.happ-check-help')}</Text>
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
            <GeofileAddressRules
                config={config}
                format={format}
                hosts={hosts}
                getValue={getValue}
                onChange={onChange}
            />
            {editingFile && (
                <GeofileEditorModal
                    key={editingFile.id}
                    file={editingFile}
                    onClose={() => setEditingFile(null)}
                    onSaved={savedFile}
                    getCopySelections={() => {
                        const references: Reference[] =
                            readClientTemplate(getValue(), format).remnacust?.geofiles ?? []
                        return references
                            .filter((reference) => reference.id === editingFile.id)
                            .map((reference) => ({
                                format,
                                categories: [...(reference.categories ?? [])]
                            }))
                    }}
                />
            )}
            {existingUrls.length > 0 && (
                <Card p="md" className={styles.card}>
                    <Stack gap="sm">
                        <Title order={4}>{t('geofiles.existing')}</Title>
                        <Text size="sm" c="dimmed">
                            {t('geofiles.existing-help')}
                        </Text>
                        {existingUrls.map((item, i) => (
                            <Group key={i} justify="space-between">
                                <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                                    {String(item.name)}
                                </Text>
                                <Button
                                    variant="subtle"
                                    onClick={() => {
                                        setUploadSource('url')
                                        setUrl(item.url)
                                        setName(String(item.name))
                                    }}
                                >
                                    {t('geofiles.reuse-url')}
                                </Button>
                            </Group>
                        ))}
                    </Stack>
                </Card>
            )}
        </Stack>
    )
}
