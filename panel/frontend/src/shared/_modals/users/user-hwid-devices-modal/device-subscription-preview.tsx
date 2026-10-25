import {
    Alert,
    Badge,
    Button,
    Code,
    Group,
    Paper,
    Select,
    Stack,
    Switch,
    Text,
    TextInput
} from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api/axios'

type Device = {
    hwid: string
    deviceModel: string | null
    platform: string | null
    userAgent: string | null
}
type Report = {
    allowed: boolean
    reason: 'responseRule' | 'deviceBlocked' | 'generationUnavailable' | null
    format: string
    rule?: string | null
    template?: string | null
    geofileDelivery?: 'downloadProfile' | 'inlineFallback' | 'inlineOrNative'
    bytes?: number
    config?: string | null
    configTooLarge?: boolean
    hosts: {
        uuid: string
        remark: string
        templateUuid: string | null
        included: boolean
        reason:
            | 'candidate'
            | 'subscriptionStatus'
            | 'trafficLimit'
            | 'formatExcluded'
            | 'ruleExcluded'
        speedLimitMbps: number | null
        deviceSpeedLimitMbps: number | null
    }[]
}
export function DeviceSubscriptionPreview({
    userId,
    devices
}: {
    userId: number
    devices: Device[]
}) {
    const { t } = useTranslation()
    const [hwid, setHwid] = useState<string | null>(null)
    const [path, setPath] = useState('base')
    const [agent, setAgent] = useState('')
    const [includeConfig, setIncludeConfig] = useState(false)
    const controller = useRef<AbortController | null>(null)
    useEffect(() => () => controller.current?.abort(), [])
    const preview = useMutation({
        mutationFn: async (request: {
            hwid: string
            path: string
            userAgent?: string
            includeConfig: boolean
        }) => {
            controller.current?.abort()
            controller.current = new AbortController()
            return (
                await instance.post<{ response: Report }>(
                    `/api/subscriptions/preview/${userId}`,
                    request,
                    { timeout: 35000, signal: controller.current.signal }
                )
            ).data.response
        }
    })
    const request = { hwid: hwid ?? '', path, userAgent: agent || undefined, includeConfig }
    const report =
        JSON.stringify(preview.variables) === JSON.stringify(request) ? preview.data : undefined
    return (
        <Paper withBorder p="md">
            <Stack gap="sm">
                <Text fw={600}>{t('operations.subscriptionPreview')}</Text>
                <Text size="sm" c="dimmed">
                    {t('operations.previewScope')}
                </Text>
                <Select
                    label={t('operations.device')}
                    searchable
                    value={hwid}
                    data={devices.map((d) => ({
                        value: d.hwid,
                        label: `${d.deviceModel || d.platform || 'HWID'} · ${d.hwid.slice(0, 12)}`
                    }))}
                    onChange={(value) => {
                        setHwid(value)
                        setAgent(devices.find((d) => d.hwid === value)?.userAgent ?? '')
                        setIncludeConfig(false)
                    }}
                />
                <Select
                    label={t('operations.subscriptionPath')}
                    value={path}
                    onChange={(value) => setPath(value ?? 'base')}
                    data={['base', 'json', 'mihomo', 'clash', 'singbox', 'stash'].map((value) => ({
                        value,
                        label: value === 'base' ? t('operations.basePath') : `/${value}`
                    }))}
                />
                <TextInput
                    label="User-Agent"
                    value={agent}
                    maxLength={512}
                    onChange={(e) => setAgent(e.currentTarget.value)}
                />
                <Switch
                    label={t('operations.showConfig')}
                    description={t('operations.configSensitive')}
                    checked={includeConfig}
                    onChange={(e) => setIncludeConfig(e.currentTarget.checked)}
                />
                <Button
                    variant="light"
                    disabled={!hwid || !agent}
                    loading={preview.isPending}
                    onClick={() => preview.mutate(request)}
                >
                    {t('operations.generatePreview')}
                </Button>
                {preview.isError && (
                    <Alert color="red" role="alert">
                        {t('operations.requestError')}
                    </Alert>
                )}
                {report && (
                    <Stack gap="xs" aria-live="polite">
                        {!report.allowed && (
                            <Alert color="yellow">
                                {t(
                                    `operations.preview_${report.reason ?? 'generationUnavailable'}`
                                )}
                            </Alert>
                        )}
                        <Group wrap="wrap">
                            <Badge>{report.format}</Badge>
                            {report.bytes !== undefined && <Text size="xs">{report.bytes} B</Text>}
                        </Group>
                        <Text size="sm">
                            {t('operations.responseRule')}: {report.rule ?? '—'}
                        </Text>
                        <Text size="sm">
                            {t('operations.template')}:{' '}
                            {report.template ?? t('operations.defaultTemplate')}
                        </Text>
                        {report.geofileDelivery && (
                            <Text size="sm">
                                {t(`operations.delivery_${report.geofileDelivery}`)}
                            </Text>
                        )}
                        {report.hosts.map((host) => (
                            <Paper key={host.uuid} p="xs" withBorder>
                                <Text size="sm" fw={500}>
                                    {host.remark}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {t(`operations.host_${host.reason}`)}
                                </Text>
                                {host.templateUuid && (
                                    <Text size="xs">
                                        {t('operations.hostTemplate')}: {host.templateUuid}
                                    </Text>
                                )}
                                <Text size="xs">
                                    {t('operations.configuredSpeed')}: {host.speedLimitMbps ?? 0}{' '}
                                    Mbps · {t('operations.device')}:{' '}
                                    {host.deviceSpeedLimitMbps ?? 0} Mbps
                                </Text>
                            </Paper>
                        ))}
                        {report.configTooLarge && (
                            <Alert color="yellow">{t('operations.configTooLarge')}</Alert>
                        )}
                        {report.config && includeConfig && (
                            <Code
                                block
                                dir="ltr"
                                style={{ maxHeight: 360, overflow: 'auto', whiteSpace: 'pre' }}
                            >
                                {report.config}
                            </Code>
                        )}
                    </Stack>
                )}
            </Stack>
        </Paper>
    )
}
