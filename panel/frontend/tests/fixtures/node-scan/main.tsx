import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import { Alert, Button, DirectionProvider, MantineProvider, Stack, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { Notifications } from '@mantine/notifications'
import { GetNodeCommand, NodesSchema, UpdateNodeCommand } from '@remnawave/backend-contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import i18next from 'i18next'
import { useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'

import en from '../../../public/locales/en/remnawave.json'
import fa from '../../../public/locales/fa/remnawave.json'
import ru from '../../../public/locales/ru/remnawave.json'
import zh from '../../../public/locales/zh/remnawave.json'
import {
    applyNodeIpScanResult,
    getNodeConnectionValues,
    hasNodeConnectionChanges
} from '../../../src/shared/_modals/nodes/edit-node-modal/node-form-state'
import { instance } from '../../../src/shared/api/axios'
import { useRescanNodeIps } from '../../../src/shared/api/hooks/nodes/nodes.mutation.hooks'
import { theme } from '../../../src/shared/constants/theme/theme'
import { NodeIpsCard } from '../../../src/shared/ui/forms/nodes/base-node-form/node-ips.card'

const params = new URLSearchParams(location.search)
const language = params.get('lang') ?? 'en'
await i18next.init({
    lng: language,
    fallbackLng: 'en',
    resources: Object.fromEntries(
        Object.entries({ en, ru, fa, zh }).map(([key, value]) => [key, { translation: value }])
    ),
    interpolation: { escapeValue: false }
})
const revision = '10000000-0000-4000-8000-000000000002'
const base = {
    uuid: '10000000-0000-4000-8000-000000000001',
    id: 1,
    name: 'Saved fixture node',
    note: 'Saved description',
    address: 'manual.example.test',
    port: 2222,
    proxyUrl: null,
    hasProxy: false,
    controlRevision: revision,
    controlAddresses: [
        { address: 'manual.example.test', enabled: true },
        { address: '192.0.2.20', enabled: false }
    ],
    ips: [{ ip: '192.0.2.20', status: 'INBOUND' }],
    isConnected: true,
    isDisabled: false,
    isConnecting: false,
    lastStatusChange: null,
    lastStatusMessage: null,
    isTrafficTrackingActive: false,
    trafficResetDay: null,
    trafficLimitBytes: null,
    trafficUsedBytes: null,
    notifyPercent: null,
    viewPosition: 0,
    countryCode: 'XX',
    consumptionMultiplier: 1,
    nodeConsumptionMultiplier: 1,
    tags: [],
    integrationUuids: [],
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    configProfile: { activeConfigProfileUuid: null, activeInbounds: [] },
    providerUuid: null,
    provider: null,
    activePluginUuid: null,
    system: null,
    versions: { node: '1.1.38', xray: '26.11.9' },
    xrayUptime: 100,
    usersOnline: 0,
    ipScan: null
}
const refreshed = {
    ...base,
    controlRevision: '10000000-0000-4000-8000-000000000003',
    controlAddresses: [base.controlAddresses[0], { address: '2001:db8::30', enabled: false }],
    ips: [{ ip: '2001:db8::30', status: 'OUTBOUND' }],
    ipScan: { addresses: ['2001:db8::30'], scannedAt: '2026-11-15T12:00:00.000Z' }
}
if (params.get('state') === 'all-off')
    base.controlAddresses.forEach((entry) => {
        entry.enabled = false
    })
if (params.get('state') === 'two-enabled')
    base.controlAddresses.forEach((entry) => {
        entry.enabled = true
    })
let mode = 'success'
let releaseRequest: (() => void) | undefined
const calls: { url?: string; method?: string; data: unknown }[] = []
instance.defaults.adapter = async (config) => {
    calls.push({ url: config.url, method: config.method, data: JSON.parse(config.data) })
    if (mode === 'hold') await new Promise<void>((resolve) => { releaseRequest = resolve })
    await new Promise((resolve) => setTimeout(resolve, 200))
    const codes: Record<string, [number, string]> = {
        unsupported: [409, 'A268'],
        unavailable: [503, 'A267'],
        invalid: [502, 'A269'],
        disabled: [409, 'A270'],
        busy: [429, 'A271'],
        conflict: [409, 'A266']
    }
    const rejection = codes[mode]
    const result =
        mode === 'bad-response'
            ? { ...refreshed, ips: [{ ip: 'invalid fixture IP', status: 'UNKNOWN' }] }
            : mode === 'empty'
              ? {
                    ...refreshed,
                    controlAddresses: [base.controlAddresses[0]],
                    ips: [],
                    ipScan: { ...refreshed.ipScan, addresses: [] }
                }
              : mode === 'all-off'
                ? {
                      ...refreshed,
                      controlAddresses: refreshed.controlAddresses.map((entry) => ({
                          ...entry,
                          enabled: false
                      }))
                  }
                : refreshed
    const response = {
        status: rejection?.[0] ?? 200,
        statusText: 'Synthetic fixture',
        headers: {},
        config,
        data: rejection
            ? { errorCode: rejection[1], message: 'private-fixture-response' }
            : { response: result }
    }
    if (rejection)
        throw new AxiosError(
            'Synthetic fixture rejection',
            'ERR_BAD_RESPONSE',
            config,
            null,
            response
        )
    return response
}
const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
})
const nodeKey = ['scan-fixture-current-node']
let currentForm: ReturnType<typeof useForm<UpdateNodeCommand.RequestBody>>
let currentNode: GetNodeCommand.Response['response']
function App() {
    const [node, setNode] = useState(() => NodesSchema.parse(base))
    const [error, setError] = useState<string>()
    const [conflict, setConflict] = useState(false)
    const pending = useRef(false)
    const form = useForm<UpdateNodeCommand.RequestBody>({
        name: 'scan-form',
        mode: 'uncontrolled',
        initialValues: {
            uuid: node.uuid,
            name: node.name,
            note: node.note ?? '',
            ...getNodeConnectionValues(node),
            ips: node.ips
        }
    })
    useLayoutEffect(() => {
        currentForm = form
        currentNode = node
    })
    const scan = useRescanNodeIps({
        route: { uuid: node.uuid },
        mutationFns: {
            onError: (value) => {
                pending.current = false
                setError(value.message)
            },
            onSuccess: (value) => {
                pending.current = false
                client.setQueryData(nodeKey, value)
                setConflict(!applyNodeIpScanResult(form, value))
                setNode(value)
                setError(undefined)
            }
        }
    })
    const rescan = () => {
        if (pending.current || hasNodeConnectionChanges(form)) return
        pending.current = true
        scan.mutate({ variables: { controlRevision: form.getValues().controlRevision! } })
    }
    return (
        <Stack p="md" maw={650}>
            <TextInput
                label="Description fixture"
                key={form.key('note')}
                {...form.getInputProps('note')}
            />
            <Button
                data-testid="reset-connection"
                onClick={() => {
                    form.setFieldValue('controlAddresses', base.controlAddresses)
                    form.resetDirty({
                        ...form.getInitialValues(),
                        controlAddresses: base.controlAddresses
                    })
                }}
            >
                Reset connection fixture
            </Button>
            {error && (
                <Alert role="alert" color="red">
                    {error}
                </Alert>
            )}
            {conflict && (
                <Alert role="alert" color="yellow">
                    {i18next.t('node-control-addresses.conflict')}
                </Alert>
            )}
            <NodeIpsCard
                cardVariants={{}}
                motionWrapper={'section' as never}
                form={form}
                node={node}
                disabled={scan.isPending || params.has('locked')}
                isRescanningIps={scan.isPending}
                rescanDisabled={conflict}
                onRescanIps={rescan}
            />
        </Stack>
    )
}
const fixture = {
    releaseRequest: () => { releaseRequest?.(); releaseRequest = undefined },
    mode: (value: string) => {
        mode = value
    },
    form: () => currentForm,
    snapshot: () => ({
        calls,
        values: currentForm?.getValues(),
        node: currentNode,
        cached: client.getQueryData(nodeKey)
    }),
    i18n: i18next
}
;(window as unknown as { nodeWizardFixture: typeof fixture }).nodeWizardFixture = fixture
document.documentElement.lang = language
document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr'
createRoot(document.getElementById('root')!).render(
    <DirectionProvider initialDirection={language === 'fa' ? 'rtl' : 'ltr'}>
        <MantineProvider theme={theme} forceColorScheme="dark">
            <I18nextProvider i18n={i18next}>
                <QueryClientProvider client={client}>
                    <Notifications />
                    <App />
                </QueryClientProvider>
            </I18nextProvider>
        </MantineProvider>
    </DirectionProvider>
)
