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
    Switch,
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
import { TbPlus, TbTrash } from 'react-icons/tb'

import { instance } from '@shared/api'
import { useGetSubscriptionSettings } from '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks'
import { ROUTES } from '@shared/constants/routes'

import { type JsonObject } from './autoselect-model'
import styles from './autoselect-panel.module.css'
import { editClientTemplate, readClientTemplate, type ClientFormat } from './client-template-model'
import { attachLibraryGeofile, compatibleGeofile, geofileCatalog } from './geofile-library-model'
import { geofilePresets } from './geofile-presets'
import { GeofileRefreshSettings, type GeofileRefresh } from './geofile-refresh-settings'

interface Geofile {
    id: string
    name: string
    kind: string
    size: number
    sha256: string
    filename: string
    url: string
    categories?: string[]
    refresh?: GeofileRefresh
}
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
    getValue
}: {
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
        refetchInterval: 60_000
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
        'geofiles.operation-failed' | 'geofiles.delete-in-use' | 'geofiles.attach-failed' | null
    >(null)
    const [selection, setSelection] = useState<string | null>(null)
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
    const needsJsonDelivery =
        format === 'XRAY_JSON' && refs.some((reference) => reference.downloadToClient === true)
    const subscriptionSettings = useGetSubscriptionSettings({
        rQueryParams: {
            enabled: needsJsonDelivery,
            refetchOnMount: 'always',
            refetchOnWindowFocus: 'always'
        }
    })
    const jsonAtBase = subscriptionSettings.data?.serveJsonAtBaseSubscription
    const targets = [
        ...new Set([
            'DIRECT',
            'REJECT',
            ...(format === 'XRAY_JSON'
                ? [
                      ...(!config.remnawave?.injectHosts ||
                      config.remnawave?.addVirtualHostAsOutbound
                          ? ['proxy']
                          : []),
                      ...(config.routing?.balancers ?? []).map((item: JsonObject) => item.tag),
                      ...(config.remnawave?.injectHosts ?? [])
                          .filter(
                              (item: JsonObject) =>
                                  !item.useHostRemarkAsTag && !item.useHostTagAsTag
                          )
                          .map((item: JsonObject) => item.tagPrefix),
                      ...(config.outbounds ?? []).map((item: JsonObject) => item.tag)
                  ]
                : format === 'SINGBOX'
                  ? (config.outbounds ?? []).map((item: JsonObject) => item.tag)
                  : [
                        ...(config['proxy-groups'] ?? []).map((item: JsonObject) => item.name),
                        ...(config.proxies ?? []).map((item: JsonObject) => item.name)
                    ])
        ])
    ].filter((value): value is string => typeof value === 'string')
    const patch = (value: Reference[]) => {
        try {
            onChange(
                editClientTemplate(
                    text,
                    format,
                    ['remnacust', 'geofiles'],
                    value.length ? value : undefined
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
        onSuccess: (item, source) => {
            client.setQueryData<Geofile[]>(queryKey, (previous) => [
                item,
                ...(previous ?? []).filter((existing) => existing.id !== item.id)
            ])
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
        },
        onError: () => {
            setError('geofiles.operation-failed')
            setProgress(null)
        }
    })
    const remove = useMutation({
        mutationFn: (id: string) => instance.delete(`/api/geofiles/${id}`),
        onSuccess: (_, id) => {
            client.setQueryData<Geofile[]>(queryKey, (previous) =>
                (previous ?? []).filter((item) => item.id !== id)
            )
            setSelection(null)
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
            void client.invalidateQueries({ queryKey })
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
            {needsJsonDelivery && (
                <Alert
                    role="status"
                    aria-live="polite"
                    color={subscriptionSettings.isError || jsonAtBase === false ? 'yellow' : 'blue'}
                    title={t('geofiles.json-delivery-title')}
                >
                    <Stack gap="xs">
                        <Text size="sm">
                            {t(
                                subscriptionSettings.isError
                                    ? 'geofiles.json-setting-unknown'
                                    : subscriptionSettings.isFetching || jsonAtBase === undefined
                                      ? 'geofiles.json-setting-loading'
                                      : jsonAtBase
                                        ? 'geofiles.json-setting-enabled'
                                        : 'geofiles.json-setting-disabled',
                                { setting: jsonSettingName }
                            )}
                        </Text>
                        <Anchor
                            href={ROUTES.DASHBOARD.MANAGEMENT.SUBSCRIPTION_SETTINGS}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                        >
                            {t('geofiles.open-subscription-settings')}
                        </Anchor>
                        {subscriptionSettings.isError && (
                            <Button
                                variant="subtle"
                                size="xs"
                                loading={subscriptionSettings.isFetching}
                                onClick={() => void subscriptionSettings.refetch()}
                            >
                                {t('common.action.refresh')}
                            </Button>
                        )}
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
                                                        key={selectedFile.id}
                                                        id={selectedFile.id}
                                                        refresh={selectedFile.refresh}
                                                        onUpdated={() =>
                                                            void client.invalidateQueries({
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
                    const download = reference.downloadToClient ?? !dat
                    const target =
                        reference.target ?? (reference.downloadToClient === false ? 'DIRECT' : '')
                    const xray = format === 'XRAY_JSON'
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
                                                  : target}
                                        </Text>
                                    </div>
                                    <Group gap="xs">
                                        {dat && !categories.length && (
                                            <Badge variant="light" color="yellow">
                                                {t('geofiles.select-category')}
                                            </Badge>
                                        )}
                                        <Badge variant="light" color="blue">
                                            {t(
                                                download
                                                    ? 'geofiles.delivery-download'
                                                    : 'geofiles.delivery-inline'
                                            )}
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
                                            data={[...new Set([...targets, reference.target])]
                                                .filter(Boolean)
                                                .map((value) => ({
                                                    value,
                                                    label:
                                                        value === 'DIRECT'
                                                            ? t('geofiles.direct')
                                                            : value === 'REJECT'
                                                              ? t('geofiles.reject')
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
                                        <Stack gap="md">
                                            <Switch
                                                label={t('geofiles.download-to-client')}
                                                description={t(
                                                    xray
                                                        ? 'geofiles.delivery-choice-xray'
                                                        : 'geofiles.delivery-choice-help',
                                                    { setting: jsonSettingName }
                                                )}
                                                checked={download}
                                                disabled={item?.kind === 'singbox-srs'}
                                                onChange={(event) =>
                                                    patch(
                                                        refs.map((ref, i) =>
                                                            i === index
                                                                ? {
                                                                      ...ref,
                                                                      target,
                                                                      downloadToClient:
                                                                          event.currentTarget
                                                                              .checked
                                                                  }
                                                                : ref
                                                        )
                                                    )
                                                }
                                            />
                                            {download && (
                                                <NumberInput
                                                    hideControls
                                                    label={t('geofiles.client-interval')}
                                                    description={t(
                                                        xray
                                                            ? 'geofiles.client-interval-xray-help'
                                                            : 'geofiles.client-interval-help'
                                                    )}
                                                    min={5}
                                                    max={43200}
                                                    allowDecimal={false}
                                                    value={
                                                        (reference.clientRefreshIntervalSeconds ??
                                                            86400) / 60
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
                                            )}
                                        </Stack>
                                    </div>
                                    <Accordion variant="separated">
                                        <Accordion.Item value="delivery-help">
                                            <Accordion.Control>
                                                {t('geofiles.delivery-details')}
                                            </Accordion.Control>
                                            <Accordion.Panel>
                                                <Stack gap="sm">
                                                    <Text size="sm">
                                                        {t(
                                                            xray
                                                                ? 'geofiles.download-to-client-xray-help'
                                                                : 'geofiles.download-to-client-help',
                                                            { setting: jsonSettingName }
                                                        )}
                                                    </Text>
                                                    {xray && (
                                                        <Text size="xs" c="dimmed">
                                                            {t('geofiles.xray-download-limit')}
                                                        </Text>
                                                    )}
                                                    {item?.kind === 'singbox-srs' && (
                                                        <Text size="xs" c="dimmed">
                                                            {t('geofiles.srs-download-limit')}
                                                        </Text>
                                                    )}
                                                    <Text size="xs" c="dimmed">
                                                        {t(
                                                            download
                                                                ? xray
                                                                    ? 'geofiles.xray-download-help'
                                                                    : 'geofiles.download-help'
                                                                : 'geofiles.inline-help'
                                                        )}
                                                    </Text>
                                                    {item && download && !dat && (
                                                        <Text
                                                            size="xs"
                                                            c="dimmed"
                                                            dir="ltr"
                                                            className={styles.path}
                                                        >
                                                            {item.url}
                                                        </Text>
                                                    )}
                                                </Stack>
                                            </Accordion.Panel>
                                        </Accordion.Item>
                                    </Accordion>
                                    <Group justify="flex-end" className={styles.selectionActions}>
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
                                        : 'geofiles.delivery-native'
                                )}
                            </Text>
                            <Text size="sm">{t('geofiles.happ-check-help')}</Text>
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
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
