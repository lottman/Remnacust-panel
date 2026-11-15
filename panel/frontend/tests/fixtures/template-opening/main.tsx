import '@mantine/core/styles.css'
import type { GetHostsCommand, TSubscriptionTemplateType } from '@remnawave/backend-contract'

import { Button, Group, MantineProvider, Stack, Text } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import i18next from 'i18next'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'

import en from '../../../public/locales/en/remnawave.json'
import { SubscriptionTemplateEditorWidget } from '../../../src/widgets/dashboard/templates/subscription-template-editor/subscription-template-editor.widget'
import { queryClient } from './support'

await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false }
})
type Hosts = GetHostsCommand.Response['response']
let completeHosts: (hosts: Hosts) => void
const type = (new URLSearchParams(location.search).get('type') ??
    'XRAY_JSON') as TSubscriptionTemplateType
const yaml = ['MIHOMO', 'CLASH', 'STASH'].includes(type)
const template = {
    uuid: '00000000-0000-4000-8000-000000000001',
    name: 'Opening fixture',
    templateType: type,
    viewPosition: 0,
    tags: [],
    geofilesEnabled: true,
    draftContent: null,
    templateJson:
        type === 'SINGBOX'
            ? { outbounds: [{ type: 'direct', tag: 'DIRECT' }] }
            : { outbounds: [{ protocol: 'freedom', tag: 'DIRECT' }] },
    encodedTemplateYaml: yaml ? btoa('proxies: []\nproxy-groups: []\nrules: []\n') : null
}
function App() {
    const hostsQuery = useQuery<Hosts>({
        queryKey: ['opening-fixture-hosts'],
        queryFn: () =>
            new Promise((resolve) => {
                completeHosts = resolve
            }),
        retry: false
    })
    return (
        <Stack p="md">
            <Group>
                <Button onClick={() => completeHosts([])}>Release hosts</Button>
                <Text data-testid="hosts-state">{hostsQuery.status}</Text>
            </Group>
            <SubscriptionTemplateEditorWidget
                key={type}
                editorType={yaml ? 'yaml' : 'json'}
                hostsQuery={hostsQuery}
                template={template}
            />
            <output id="fixture-saved" />
        </Stack>
    )
}
createRoot(document.getElementById('root')!).render(
    <MantineProvider forceColorScheme="dark">
        <ModalsProvider>
            <I18nextProvider i18n={i18next}>
                <QueryClientProvider client={queryClient}>
                    <App />
                </QueryClientProvider>
            </I18nextProvider>
        </ModalsProvider>
    </MantineProvider>
)
