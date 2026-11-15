import '@mantine/core/styles.css'
import '@kastov/mantine-datatable/styles.css'
import '../../../src/assets/fonts/napaleon-fonts.css'
import '../../../src/global.css'
import { DragDropProvider } from '@dnd-kit/react'
import { DirectionProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'

import en from '../../../public/locales/en/remnawave.json'
import fa from '../../../public/locales/fa/remnawave.json'
import { IsMobileProvider } from '../../../src/shared/hocs/is-mobile-provider'
import { PanelAppearanceProvider } from '../../../src/shared/ui/appearance/appearance'
import { HostCardWidget } from '../../../src/widgets/dashboard/hosts/host-card/host-card.widget'
import { HostsDataTableWidget } from '../../../src/widgets/dashboard/hosts/hosts-datatable/hosts-datatable.widget'
import { cases, hosts, modalCalls, nodes, openedUrls, profiles } from './support'

const params = new URLSearchParams(location.search)
const language = params.get('lang') === 'fa' ? 'fa' : 'en'
document.documentElement.lang = language
document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr'
await i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'remnawave',
    resources: { en: { remnawave: en }, fa: { remnawave: fa } },
    interpolation: { escapeValue: false }
})
const nativeFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
    const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        location.href
    )
    if (url.origin !== location.origin || (init?.method && init.method !== 'GET'))
        throw new Error('Only local readonly fixture requests are allowed')
    return nativeFetch(input, init)
}
window.open = (url) => {
    openedUrls.push(String(url))
    return null
}

function Fixture() {
    const [selected, setSelected] = useState<string[]>([])
    return (
        <main
            data-host-binding-fixture
            style={{
                padding: 16,
                maxWidth: 1280,
                width: '100%',
                boxSizing: 'border-box',
                margin: 'auto',
                minWidth: 0,
                ...(params.get('columns') === '2'
                    ? {
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                          gap: '0 16px'
                      }
                    : {})
            }}
        >
            {params.get('surface') === 'table' ? (
                <HostsDataTableWidget
                    configProfiles={profiles}
                    hosts={hosts}
                    hostTags={[]}
                    state={hosts}
                    selectedHosts={selected}
                    setSelectedHosts={setSelected}
                />
            ) : (
                <DragDropProvider>
                    {cases.map((item, index) => (
                        <section data-host-case={item.id} key={item.uuid}>
                            <HostCardWidget
                                item={hosts[index]}
                                index={index}
                                configProfiles={profiles}
                                nodesByUuid={new Map(nodes.map((node) => [node.uuid, node]))}
                                disableReordering
                                isSelected={selected.includes(item.uuid)}
                                onSelect={(id) =>
                                    setSelected((current) =>
                                        current.includes(id)
                                            ? current.filter((value) => value !== id)
                                            : [...current, id]
                                    )
                                }
                            />
                        </section>
                    ))}
                </DragDropProvider>
            )}
        </main>
    )
}
Object.assign(window, { hostBindingFixture: { cases, profiles, modalCalls, openedUrls } })
createRoot(document.getElementById('root')!).render(
    <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
                <DirectionProvider initialDirection={language === 'fa' ? 'rtl' : 'ltr'}>
                    <PanelAppearanceProvider>
                        <ModalsProvider>
                            <IsMobileProvider>
                                <Fixture />
                            </IsMobileProvider>
                        </ModalsProvider>
                    </PanelAppearanceProvider>
                </DirectionProvider>
            </MemoryRouter>
        </QueryClientProvider>
    </I18nextProvider>
)
