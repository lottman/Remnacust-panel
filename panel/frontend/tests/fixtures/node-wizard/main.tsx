import '@mantine/core/styles.css'
import type { CreateValues, EditorValues, WizardFixture } from './types'
import type { UseFormReturnType } from '@mantine/form'
import type { TNodeIp } from '@remnawave/backend-contract'

import NiceModal from '@ebay/nice-modal-react'
import { Button, DirectionProvider, Group, MantineProvider, Stack, Text } from '@mantine/core'
import { useForm } from '@mantine/form'
import { ModalsProvider } from '@mantine/modals'
import { QueryClientProvider } from '@tanstack/react-query'
import i18next from 'i18next'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'

import en from '../../../public/locales/en/remnawave.json'
import fa from '../../../public/locales/fa/remnawave.json'
import ru from '../../../public/locales/ru/remnawave.json'
import zh from '../../../public/locales/zh/remnawave.json'
import { CreateNodeModal } from '../../../src/shared/_modals/nodes/create-node-modal/create-node.modal'
import { NodesConfigProfilesDrawer } from '../../../src/shared/_modals/nodes/nodes-config-profiles-drawer/nodes-config-profiles.drawer'
import { theme } from '../../../src/shared/constants/theme/theme'
import { NodeControlAddressesEditor } from '../../../src/shared/ui/node-ips/node-control-addresses-editor'
import { inboundUuid, mutation, profileUuid, queryClient } from './api'
import { browserCaseNames, runBrowserCase } from './browser-suite'
import { observedForms } from './form-observer'

const staticRussianPage = ['/compact.html', '/wizard.html'].includes(location.pathname)
const language =
    new URLSearchParams(location.search).get('lang') ?? (staticRussianPage ? 'ru' : 'en')
await i18next.init({
    lng: language,
    fallbackLng: 'en',
    resources: Object.fromEntries(
        Object.entries({ en, ru, fa, zh }).map(([key, value]) => [key, { translation: value }])
    ),
    interpolation: { escapeValue: false }
})
document.documentElement.lang = language
document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr'
NiceModal.register('fixture-create-node', CreateNodeModal)
NiceModal.register('nodes_nodesConfigProfilesDrawer', NodesConfigProfilesDrawer)

const savedAddresses = [
    { address: 'node.example.test', enabled: true },
    { address: '2001:db8::20', enabled: true },
    { address: '192.0.2.30', enabled: false }
]
const ips: TNodeIp[] = [
    { ip: '2001:0db8::20', status: 'INBOUND' },
    { ip: '192.0.2.30', status: 'RESERVE' }
]
function Editor() {
    const form = useForm<EditorValues>({
        name: 'editor',
        mode: 'uncontrolled',
        initialValues: {
            name: 'Editor fixture',
            configProfile: { activeConfigProfileUuid: profileUuid, activeInbounds: [inboundUuid] },
            isTrafficTrackingActive: false,
            address: '192.0.2.99',
            controlAddresses: structuredClone(savedAddresses),
            ips: structuredClone(ips),
            proxyUrl: null
        }
    })
    return (
        <div data-testid="editor">
            <NodeControlAddressesEditor
                form={form}
                savedAddresses={savedAddresses}
                ips={ips}
                rescanAction={
                    <Button type="button" data-testid="synthetic-rescan">
                        Synthetic rescan slot
                    </Button>
                }
            />
        </div>
    )
}
const fixture: WizardFixture = {
    observedForms,
    mutation,
    profileUuid,
    inboundUuid,
    i18n: i18next,
    form: () => observedForms.get('create-node-form') as UseFormReturnType<CreateValues>,
    open: () => NiceModal.show('fixture-create-node'),
    close: () => NiceModal.remove('fixture-create-node'),
    chooseProfile: () =>
        fixture.form().setValues({
            configProfile: {
                activeConfigProfileUuid: profileUuid,
                activeInbounds: [inboundUuid]
            }
        }),
    snapshot: () => ({
        errors: fixture.form()?.errors,
        values: fixture.form()
            ? {
                  ...fixture.form().getValues(),
                  proxyUrl: fixture.form().getValues().proxyUrl
                      ? '[MASKED]'
                      : fixture.form().getValues().proxyUrl
              }
            : null,
        calls: mutation.calls.map((value) => ({
            ...value,
            proxyUrl: value.proxyUrl ? '[MASKED]' : value.proxyUrl
        })),
        pending: mutation.pending,
        successes: mutation.successes,
        errorsReceived: mutation.errors
    }),
    browserCaseNames,
    runCase: runBrowserCase
}
const fixtureWindow = window as unknown as {
    nodeWizardFixture: WizardFixture
    __nodeWizardRoot?: ReturnType<typeof createRoot>
}
fixtureWindow.nodeWizardFixture = fixture
function App() {
    const [editor, setEditor] = useState(
        new URLSearchParams(location.search).has('editor') || location.pathname === '/compact.html'
    )
    return (
        <Stack p="md">
            <Text>Real CreateNodeModal / Mantine form; synthetic API only</Text>
            <Group>
                <Button data-testid="open-wizard" onClick={() => fixture.open()}>
                    Open wizard
                </Button>
                <Button onClick={() => setEditor(!editor)}>Toggle editor fixture</Button>
            </Group>
            {editor && <Editor />}
        </Stack>
    )
}
const root = (fixtureWindow.__nodeWizardRoot ??= createRoot(document.getElementById('root')!))
root.render(
    <DirectionProvider initialDirection={language === 'fa' ? 'rtl' : 'ltr'}>
        <MantineProvider theme={theme} forceColorScheme="dark">
            <ModalsProvider>
                <I18nextProvider i18n={i18next}>
                    <QueryClientProvider client={queryClient}>
                        <NiceModal.Provider>
                            <App />
                        </NiceModal.Provider>
                    </QueryClientProvider>
                </I18nextProvider>
            </ModalsProvider>
        </MantineProvider>
    </DirectionProvider>
)
