import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import type { GetConfigProfileByUuidCommand } from '@remnawave/backend-contract'

import { Button, Group, MantineProvider, Stack, Text } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClientProvider } from '@tanstack/react-query'
import i18next from 'i18next'
import * as monaco from 'monaco-editor/editor'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { createMemoryRouter, RouterProvider } from 'react-router'

import en from '../../../public/locales/en/remnawave.json'
import fa from '../../../public/locales/fa/remnawave.json'
import { ConfigEditorWidget } from '../../../src/widgets/dashboard/config-profiles/config-editor/config-editor.widget'
import { fixtureSaves, queryClient } from './support'

await i18next.init({
    lng: 'en',
    resources: { en: { translation: en }, fa: { translation: fa } },
    interpolation: { escapeValue: false }
})
const config = {
    log: { loglevel: 'warning' },
    inbounds: [
        {
            tag: 'XERA-SERVER',
            protocol: 'vless',
            streamSettings: {
                network: 'xera-http',
                xeraHttpSettings: {
                    path: '/fixture',
                    mode: 'stream-auto',
                    extra: { serverMaxSessions: 2048 }
                }
            }
        }
    ],
    outbounds: [
        {
            tag: 'XERA-CLIENT',
            protocol: 'vless',
            streamSettings: {
                network: 'xera-http',
                xeraHttpSettings: { path: '/client', mode: 'stream-up', xPaddingBytes: '100-1000' }
            }
        },
        { tag: 'DIRECT', protocol: 'freedom' }
    ]
}
const configProfile = {
    uuid: '00000000-0000-4000-8000-000000000001',
    name: 'Xera fixture',
    config
} as GetConfigProfileByUuidCommand.Response['response']
const model = () => monaco.editor.getModels().find((item) => item.uri.scheme === 'xray-config')
Object.assign(window, {
    xeraFixture: {
        text: () => model()?.getValue(),
        replace: (text: string) => model()?.setValue(text),
        undo: () => model()?.undo(),
        saves: fixtureSaves,
        initial: JSON.stringify(config, null, 2)
    }
})
function App() {
    return (
        <Stack p="md" style={{ minWidth: 0 }}>
            <Group>
                {['en', 'fa'].map((language) => (
                    <Button
                        key={language}
                        size="compact-sm"
                        onClick={() => {
                            i18next.changeLanguage(language)
                            document.documentElement.lang = language
                            document.documentElement.dir = i18next.dir(language)
                        }}
                    >
                        {language}
                    </Button>
                ))}
                <Text size="sm">
                    Synthetic editor. Save is captured locally; Core WASM is unavailable.
                </Text>
            </Group>
            <ConfigEditorWidget
                configProfile={configProfile}
                isWasmCrashed={false}
                isWasmLoading={false}
                isWasmRestarting={false}
                onRestartWasm={() => {}}
                snippets={{ snippets: [], total: 0 }}
            />
        </Stack>
    )
}
const router = createMemoryRouter([{ path: '/', element: <App /> }])
createRoot(document.getElementById('root')!).render(
    <MantineProvider forceColorScheme="dark" env="test">
        <I18nextProvider i18n={i18next}>
            <QueryClientProvider client={queryClient}>
                <ModalsProvider>
                    <Notifications />
                    <RouterProvider router={router} />
                </ModalsProvider>
            </QueryClientProvider>
        </I18nextProvider>
    </MantineProvider>
)
