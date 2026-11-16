import '@mantine/core/styles.css'
import '../../../src/global.css'
import type { GetHostsCommand, TSubscriptionTemplateType } from '@remnawave/backend-contract'

import { Button, DirectionProvider, Group, Stack, Text } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import i18next from 'i18next'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'

import en from '../../../public/locales/en/remnawave.json'
import fa from '../../../public/locales/fa/remnawave.json'
import ru from '../../../public/locales/ru/remnawave.json'
import zh from '../../../public/locales/zh/remnawave.json'
import { PanelAppearanceProvider } from '../../../src/shared/ui/appearance/appearance'
import { SubscriptionTemplateEditorWidget } from '../../../src/widgets/dashboard/templates/subscription-template-editor/subscription-template-editor.widget'
import { queryClient } from './support'

const language = new URLSearchParams(location.search).get('lang') ?? 'en'
await i18next.init({
    lng: language,
    fallbackLng: 'en',
    resources: Object.fromEntries(
        Object.entries({ en, ru, fa, zh }).map(([key, value]) => [key, { translation: value }])
    ),
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
    <I18nextProvider i18n={i18next}>
        <DirectionProvider initialDirection={language === 'fa' ? 'rtl' : 'ltr'}>
            <PanelAppearanceProvider>
                <ModalsProvider>
                    <QueryClientProvider client={queryClient}>
                        <App />
                    </QueryClientProvider>
                </ModalsProvider>
            </PanelAppearanceProvider>
        </DirectionProvider>
    </I18nextProvider>
)
