import '@mantine/core/styles.css'
import '@kastov/mantine-datatable/styles.css'
import '../../../src/global.css'
import {
    Button,
    DirectionProvider,
    Group,
    MantineProvider,
    Paper,
    Stack,
    Text
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { GetNodesCommand, UpdateNodeCommand } from '@remnawave/backend-contract'
import i18next from 'i18next'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'

import en from '../../../public/locales/en/remnawave.json'
import fa from '../../../public/locales/fa/remnawave.json'
import ru from '../../../public/locales/ru/remnawave.json'
import zh from '../../../public/locales/zh/remnawave.json'
import { LocaleDirectionSync } from '../../../src/app/i18n/locale-direction-sync'
import { GeocheckFormWidget } from '../../../src/shared/_modals/nodes/node-geocheck-modal/geocheck-form.widget'
import { ConnectionSetupScreen } from '../../../src/shared/_modals/nodes/node-ssh-terminal/session/connection-setup.screen'
import { theme } from '../../../src/shared/constants/theme/theme'
import { NodeControlAddressesEditor } from '../../../src/shared/ui/node-ips/node-control-addresses-editor'
import { withNodeControlAddressesErrors } from '../../../src/shared/ui/node-ips/validate-node-control-addresses'
import { getNodeSshDefaultAddress } from '../../../src/shared/utils/node-control-addresses'
import { NodesDataTableWidget } from '../../../src/widgets/dashboard/nodes/nodes-datatable/nodes-datatable.widget'

await i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: Object.fromEntries(
        Object.entries({ en, ru, fa, zh }).map(([key, value]) => [key, { translation: value }])
    ),
    interpolation: { escapeValue: false }
})

type Node = GetNodesCommand.Response['response'][number]
const base = {
    countryCode: 'XX',
    port: 2222,
    isDisabled: false,
    isConnecting: false,
    isConnected: true,
    xrayUptime: 300,
    usersOnline: 5,
    trafficUsedBytes: 0,
    tags: [],
    integrationUuids: [],
    consumptionMultiplier: 1,
    nodeConsumptionMultiplier: 1,
    activePluginUuid: null,
    configProfile: {
        activeConfigProfileUuid: 'fixture-profile',
        activeInbounds: [{ uuid: 'fixture-inbound', tag: 'VLESS' }]
    },
    versions: { node: '1.1.36', xray: '26.11.9' },
    system: null,
    provider: null,
    lastStatusMessage: null
}
const nodes = [
    {
        ...base,
        uuid: 'node-direct',
        name: 'Direct IPv4 node',
        viewPosition: 0,
        address: '192.0.2.10',
        controlAddresses: [{ address: '192.0.2.10', enabled: true }],
        hasProxy: false,
        proxyUrl: null,
        ips: []
    },
    {
        ...base,
        uuid: 'node-proxy',
        name: 'Proxy IPv6 node',
        viewPosition: 1,
        address: '2001:db8::10',
        hasProxy: true,
        controlAddresses: [
            { address: '2001:db8::10', enabled: false },
            { address: 'node_service', enabled: true },
            { address: '2001:db8::11', enabled: true }
        ],
        proxyUrl: 'socks5://fixture:synthetic-only@proxy.example.test:1080',
        ips: [{ ip: '2001:db8::11', status: 'MANAGEMENT' }]
    }
] as Node[]

document.documentElement.classList.add('panel-themed')
function App() {
    const [selected, setSelected] = useState<Node[]>([])
    const [edited, setEdited] = useState('')
    const [saved, setSaved] = useState(nodes[1].controlAddresses ?? [])
    const [saveResult, setSaveResult] = useState('Not saved')
    const [managementOff, setManagementOff] = useState(false)
    const [sshTarget, setSshTarget] = useState('none')
    const [geoSource, setGeoSource] = useState('none')
    const manualNode = {
        ...nodes[1],
        controlAddresses: [
            ...(nodes[1].controlAddresses ?? []),
            { address: '2001:db8::42', enabled: false }
        ].map((entry) => ({ ...entry, enabled: managementOff ? false : entry.enabled }))
    }
    const form = useForm<UpdateNodeCommand.RequestBody>({
        mode: 'uncontrolled',
        initialValues: {
            uuid: '10000000-0000-4000-8000-000000000001',
            controlAddresses: saved,
            proxyUrl: nodes[1].proxyUrl
        },
        validate: withNodeControlAddressesErrors(() => ({}))
    })
    useEffect(() => {
        const onEdit = (event: Event) => setEdited((event as CustomEvent<string>).detail)
        window.addEventListener('fixture-edit-node', onEdit)
        return () => window.removeEventListener('fixture-edit-node', onEdit)
    }, [])
    return (
        <Stack p="md" style={{ minWidth: 0 }}>
            <Group>
                {['en', 'ru', 'fa', 'zh'].map((language) => (
                    <Button key={language} onClick={() => void i18next.changeLanguage(language)}>
                        {language}
                    </Button>
                ))}
            </Group>
            <NodesDataTableWidget
                nodes={nodes}
                selectedRecords={selected}
                setSelectedRecords={setSelected}
            />
            <Text role="status">Edited node: {edited || 'none'}</Text>
            <Paper data-testid="address-editor" maw={620}>
                <NodeControlAddressesEditor
                    form={form}
                    key={form.key('controlAddresses')}
                    savedAddresses={saved}
                    hasProxy
                />
            </Paper>
            <Group>
                <Button
                    onClick={() => {
                        if (form.validate().hasErrors) return
                        const addresses = form.getValues().controlAddresses ?? []
                        setSaved(structuredClone(addresses))
                        form.setFieldValue('controlAddresses', addresses)
                        form.resetDirty()
                        setSaveResult(JSON.stringify(addresses))
                    }}
                >
                    Save address fixture
                </Button>
                <Text data-testid="address-save-result" role="status">
                    {saveResult}
                </Text>
            </Group>
            <Button onClick={() => setManagementOff(!managementOff)}>
                Toggle all panel addresses
            </Button>
            <Paper data-testid="ssh-setup" maw={700}>
                <ConnectionSetupScreen
                    initial={{
                        host: getNodeSshDefaultAddress(manualNode),
                        username: 'root',
                        port: 22
                    }}
                    node={manualNode}
                    nodeKey={
                        {
                            publicKey: 'synthetic-public-key',
                            algo: 'Ed25519',
                            imported: false
                        } as never
                    }
                    onConnect={(target) => setSshTarget(target.host)}
                    onOpenKeyImport={() => {}}
                    onRegenerateKey={async () => {}}
                />
            </Paper>
            <Text role="status">SSH target: {sshTarget}</Text>
            <Paper data-testid="geocheck" maw={620} p="md">
                <GeocheckFormWidget
                    node={manualNode}
                    onCancel={() => {}}
                    onStart={(value) => setGeoSource(JSON.stringify(value))}
                />
            </Paper>
            <Text role="status">Geo source: {geoSource}</Text>
        </Stack>
    )
}

createRoot(document.getElementById('root')!).render(
    <I18nextProvider i18n={i18next}>
        <DirectionProvider>
            <MantineProvider theme={theme} defaultColorScheme="dark">
                <LocaleDirectionSync />
                <App />
            </MantineProvider>
        </DirectionProvider>
    </I18nextProvider>
)
