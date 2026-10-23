import {
    Alert,
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
    Stack,
    Text,
    TextInput,
    Title
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbPlus, TbTrash } from 'react-icons/tb'

import { instance } from '@shared/api'

import { type JsonObject } from './autoselect-model'
import styles from './autoselect-panel.module.css'
import { editClientTemplate, type ClientFormat } from './client-template-model'
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
const compatible = (kind: string, format: ClientFormat) =>
    ['geoip', 'geosite'].includes(kind) ||
    (format === 'SINGBOX'
        ? kind.startsWith('singbox-')
        : format === 'XRAY_JSON'
          ? false
          : kind.startsWith('mihomo-') && (format === 'MIHOMO' || !kind.startsWith('mihomo-text-')))

export function GeofilesPanel({
    text,
    config,
    format,
    onChange
}: {
    text: string
    config: JsonObject
    format: ClientFormat
    onChange: (value: string) => void
}) {
    const { t } = useTranslation()
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
    const [name, setName] = useState('')
    const [kind, setKind] = useState<string | null>('geoip')
    const [url, setUrl] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [progress, setProgress] = useState<number | null>(null)
    const [error, setError] = useState(false)
    const [selected, setSelected] = useState<string | null>(null)
    const [presetId, setPresetId] = useState<string | null>(geofilePresets[0].id)
    const preset = geofilePresets.find((item) => item.id === presetId)
    const refs: Reference[] = Array.isArray(config.remnacust?.geofiles)
        ? config.remnacust.geofiles
        : []
    const targets = [
        ...new Set([
            'DIRECT',
            'REJECT',
            ...(format === 'XRAY_JSON'
                ? [
                      'proxy',
                      ...(config.routing?.balancers ?? []).map((item: JsonObject) => item.tag),
                      ...(config.remnawave?.injectHosts ?? []).map(
                          (item: JsonObject) => item.tagPrefix
                      ),
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
            setError(false)
        } catch {
            setError(true)
        }
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
            setSelected(item.id)
            setError(false)
            if (source === 'file') setFile(null)
            if (source === 'url') setUrl('')
            setProgress(null)
        },
        onError: () => {
            setError(true)
            setProgress(null)
        }
    })
    const remove = useMutation({
        mutationFn: (id: string) => instance.delete(`/api/geofiles/${id}`),
        onSuccess: () => {
            void client.invalidateQueries({ queryKey })
            setError(false)
        },
        onError: () => setError(true)
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
            <Alert color="blue" title={t('geofiles.delivery-title')}>
                {t(format === 'XRAY_JSON' ? 'geofiles.delivery-xray' : 'geofiles.delivery-native')}
            </Alert>
            {(error || filesQuery.isError) && (
                <Alert color="red" withCloseButton onClose={() => setError(false)}>
                    {t('geofiles.operation-failed')}{' '}
                    {filesQuery.isError && (
                        <Button variant="subtle" onClick={() => void filesQuery.refetch()}>
                            {t('common.action.refresh')}
                        </Button>
                    )}
                </Alert>
            )}
            <Card p="md" className={styles.card}>
                <Stack gap="md">
                    <Title order={4}>{t('geofiles.library')}</Title>
                    <Text size="sm" c="dimmed">
                        {t('geofiles.library-help')}
                    </Text>
                    {filesQuery.isPending ? (
                        <Loader size="sm" />
                    ) : (
                        <Select
                            searchable
                            clearable
                            label={t('geofiles.choose')}
                            value={selected}
                            onChange={setSelected}
                            data={files
                                .filter((item) => compatible(item.kind, format))
                                .map((item) => ({
                                    value: item.id,
                                    label: `${item.name} · ${item.kind} · ${(item.size / 1048576).toFixed(1)} MiB`
                                }))}
                            nothingFoundMessage={t('geofiles.no-compatible')}
                        />
                    )}
                    <Button
                        leftSection={<TbPlus size={16} />}
                        disabled={!selected || refs.some((ref) => ref.id === selected)}
                        onClick={() => {
                            const item = files.find((file) => file.id === selected)
                            if (item)
                                patch([
                                    ...refs,
                                    {
                                        id: item.id,
                                        ...(['geoip', 'geosite'].includes(item.kind)
                                            ? { categories: [] }
                                            : {}),
                                        target: 'DIRECT',
                                        downloadToClient: item.kind === 'singbox-srs',
                                        clientRefreshIntervalSeconds: 86400
                                    }
                                ])
                        }}
                    >
                        {t('geofiles.attach')}
                    </Button>
                    {selected && files.find((item) => item.id === selected) && (
                        <Group justify="space-between">
                            <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                                SHA-256: {files.find((item) => item.id === selected)?.sha256}
                            </Text>
                            <Button
                                color="red"
                                variant="subtle"
                                leftSection={<TbTrash size={16} />}
                                loading={remove.isPending}
                                disabled={refs.some((ref) => ref.id === selected)}
                                onClick={() =>
                                    modals.openConfirmModal({
                                        title: t('geofiles.delete-title'),
                                        children: <Text>{t('geofiles.delete-help')}</Text>,
                                        labels: {
                                            confirm: t('common.action.delete'),
                                            cancel: t('common.action.cancel')
                                        },
                                        confirmProps: { color: 'red' },
                                        onConfirm: () => selected && remove.mutate(selected)
                                    })
                                }
                            >
                                {t('common.action.delete')}
                            </Button>
                        </Group>
                    )}
                </Stack>
            </Card>
            {selected && files.some((item) => item.id === selected) && (
                <Card p="md" className={styles.card}>
                    <GeofileRefreshSettings
                        key={selected}
                        id={selected}
                        refresh={files.find((item) => item.id === selected)?.refresh}
                        onUpdated={() => void client.invalidateQueries({ queryKey })}
                    />
                </Card>
            )}
            {refs.map((reference, index) => {
                const item = files.find((file) => file.id === reference.id)
                const categories = reference.categories ?? []
                const dat = !!item && ['geoip', 'geosite'].includes(item.kind)
                const download = reference.downloadToClient ?? !dat
                const target =
                    reference.target ?? (reference.downloadToClient === false ? 'DIRECT' : '')
                const supported = format !== 'XRAY_JSON'
                return (
                    <Card key={index} p="md" className={styles.card}>
                        <Stack gap="md">
                            <Group justify="space-between">
                                <Group>
                                    <Title order={4}>{item?.name ?? reference.id}</Title>
                                    {item && <Badge variant="light">{item.kind}</Badge>}
                                    {item && (
                                        <Badge variant="light" color="blue">
                                            {t(
                                                download
                                                    ? 'geofiles.delivery-download'
                                                    : 'geofiles.delivery-inline'
                                            )}
                                        </Badge>
                                    )}
                                </Group>
                                <Button
                                    color="red"
                                    variant="subtle"
                                    onClick={() => patch(refs.filter((_, i) => i !== index))}
                                >
                                    {t('geofiles.detach')}
                                </Button>
                            </Group>
                            {!item && !filesQuery.isPending && (
                                <Alert color="red">{t('geofiles.missing')}</Alert>
                            )}
                            {item && ['geoip', 'geosite'].includes(item.kind) && (
                                <TagsInput
                                    label={t('geofiles.categories')}
                                    description={t('geofiles.categories-help')}
                                    clearable
                                    value={categories}
                                    data={[...new Set([...(item.categories ?? []), ...categories])]}
                                    error={
                                        !categories.length
                                            ? t('geofiles.select-category')
                                            : undefined
                                    }
                                    onChange={(value) =>
                                        patch(
                                            refs.map((ref, i) =>
                                                i === index ? { ...ref, categories: value } : ref
                                            )
                                        )
                                    }
                                />
                            )}
                            <Select
                                label={t('geofiles.target')}
                                placeholder={t('geofiles.choose-target')}
                                error={!target ? t('geofiles.choose-target') : undefined}
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
                                            i === index ? { ...ref, target: value } : ref
                                        )
                                    )
                                }
                            />
                            <Switch
                                label={t('geofiles.download-to-client')}
                                description={t('geofiles.download-to-client-help')}
                                checked={download}
                                disabled={!supported || item?.kind === 'singbox-srs'}
                                onChange={(event) =>
                                    patch(
                                        refs.map((ref, i) =>
                                            i === index
                                                ? {
                                                      ...ref,
                                                      downloadToClient: event.currentTarget.checked
                                                  }
                                                : ref
                                        )
                                    )
                                }
                            />
                            {!supported && (
                                <Text size="xs" c="dimmed">
                                    {t('geofiles.xray-download-limit')}
                                </Text>
                            )}
                            {item?.kind === 'singbox-srs' && (
                                <Text size="xs" c="dimmed">
                                    {t('geofiles.srs-download-limit')}
                                </Text>
                            )}
                            {download && supported && (
                                <NumberInput
                                    hideControls
                                    label={t('geofiles.client-interval')}
                                    description={t('geofiles.client-interval-help')}
                                    min={5}
                                    max={43200}
                                    allowDecimal={false}
                                    value={(reference.clientRefreshIntervalSeconds ?? 86400) / 60}
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
                            <Text size="xs" c="dimmed">
                                {t(download ? 'geofiles.download-help' : 'geofiles.inline-help')}
                            </Text>
                            {item && download && !dat && (
                                <Text size="xs" c="dimmed" dir="ltr" className={styles.path}>
                                    {item.url}
                                </Text>
                            )}
                        </Stack>
                    </Card>
                )
            })}
            <Card p="md" className={styles.card}>
                <Stack gap="md">
                    <div>
                        <Title order={4}>{t('geofiles.presets')}</Title>
                        <Text size="sm" c="dimmed" mt={4}>
                            {t('geofiles.presets-help')}
                        </Text>
                    </div>
                    <Select
                        label={t('geofiles.choose-preset')}
                        value={presetId}
                        onChange={setPresetId}
                        allowDeselect={false}
                        searchable
                        data={['V2Fly', 'MetaCubeX'].map((provider) => ({
                            group: provider,
                            items: geofilePresets
                                .filter((item) => item.provider === provider)
                                .map((item) => ({ value: item.id, label: item.name }))
                        }))}
                    />
                    {preset && (
                        <>
                            <Text size="sm">{t(`geofiles.preset-${preset.description}`)}</Text>
                            <Text size="xs" c="dimmed" dir="ltr" className={styles.path}>
                                {preset.url}
                            </Text>
                        </>
                    )}
                    <Button
                        variant="light"
                        disabled={!preset}
                        loading={upload.isPending}
                        onClick={() => preset && upload.mutate(preset)}
                    >
                        {t('geofiles.import-preset')}
                    </Button>
                </Stack>
            </Card>
            <Card p="md" className={styles.card}>
                <Stack gap="md">
                    <Title order={4}>{t('geofiles.add')}</Title>
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
                                if (filename.endsWith('.srs')) setKind('singbox-srs')
                                else if (filename.endsWith('.json')) setKind('singbox-json')
                                else if (filename.endsWith('.dat') && filename.includes('geosite'))
                                    setKind('geosite')
                                else if (filename.endsWith('.dat') && filename.includes('geoip'))
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
                        disabled={!file || !kind || file.size > 64 * 1024 * 1024}
                        loading={upload.isPending}
                        onClick={() => upload.mutate('file')}
                    >
                        {t('geofiles.upload')}
                    </Button>
                    {progress !== null && (
                        <Progress value={progress} aria-label={t('geofiles.upload')} />
                    )}
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
                        {t('geofiles.import')}
                    </Button>
                    <Text size="xs" c="dimmed">
                        {t('geofiles.security-help')}
                    </Text>
                </Stack>
            </Card>
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
