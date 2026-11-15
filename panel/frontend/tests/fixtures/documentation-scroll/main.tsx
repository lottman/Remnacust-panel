import '@mantine/core/styles.css'
import '../../../src/assets/fonts/napaleon-fonts.css'
import '../../../src/global.css'
import { DirectionProvider, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { GetStatusCommand } from '@remnawave/backend-contract'
import { QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { createMemoryRouter, RouterProvider } from 'react-router'

import en from '../../../public/locales/en/remnawave.json'
import fa from '../../../public/locales/fa/remnawave.json'
import ru from '../../../public/locales/ru/remnawave.json'
import zh from '../../../public/locales/zh/remnawave.json'
import { LocaleDirectionSync } from '../../../src/app/i18n/locale-direction-sync'
import { SidebarLayout } from '../../../src/app/layouts/dashboard/main-layout/layout-variants/sidebar.layout'
import { useMiscStore } from '../../../src/entities/dashboard/misc-store/use-misc-store'
import { DocumentationPage } from '../../../src/pages/dashboard/documentation/documentation.page'
import { instance } from '../../../src/shared/api/axios'
import { queryClient } from '../../../src/shared/api/query-client'
import { ROUTES } from '../../../src/shared/constants/routes'
import { PanelAppearanceProvider } from '../../../src/shared/ui/appearance/appearance'

const params = new URLSearchParams(location.search)
const language = params.get('lang') ?? 'en'
await i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'remnawave',
    resources: Object.fromEntries(
        Object.entries({ en, ru, fa, zh }).map(([key, value]) => [key, { remnawave: value }])
    ),
    interpolation: { escapeValue: false }
})
useMiscStore.getState().actions.setDisclaimerAccepted(true)
instance.defaults.adapter = async (config) => {
    if (config.url !== GetStatusCommand.url || config.method !== 'get') {
        throw new Error('Unexpected documentation fixture API request')
    }
    return {
        data: GetStatusCommand.ResponseSchema.parse({
            response: {
                isLoginAllowed: true,
                isRegisterAllowed: false,
                authentication: null,
                branding: { title: null, logoUrl: null }
            }
        }),
        status: 200,
        statusText: 'OK',
        headers: {},
        config
    }
}
const nativeFetch = window.fetch.bind(window)
window.fetch = (input, init) => {
    const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        location.href
    )
    if (url.origin !== location.origin || (init?.method && init.method !== 'GET')) {
        throw new Error('Only local readonly documentation fixture requests are allowed')
    }
    return nativeFetch(input, init)
}

function Shell() {
    const mobile = useMediaQuery('(max-width: 64rem)', false, {
        getInitialValueInEffect: false
    })
    return (
        <SidebarLayout
            mobile={mobile}
            headerControls={<Text size="xs">Docs scroll fixture</Text>}
        />
    )
}

const routes = ROUTES.DASHBOARD.DOCUMENTATION
const initial = params.get('mode') === 'api' ? routes.API : routes.GUIDE
const router = createMemoryRouter(
    [
        {
            element: <Shell />,
            children: [
                { path: routes.GUIDE, element: <DocumentationPage /> },
                { path: routes.API, element: <DocumentationPage mode="api" /> },
                { path: routes.VERSIONS, element: <DocumentationPage mode="versions" /> }
            ]
        }
    ],
    { initialEntries: [initial + '?language=' + language + '&article=nodes'] }
)
const index = () => document.querySelector<HTMLElement>('[data-documentation-mode] > nav')
const events: Array<{ type: string; trusted: boolean; body: number; index: number }> = []
for (const type of ['wheel', 'scroll', 'keydown', 'touchmove']) {
    document.addEventListener(
        type,
        (event) => {
            events.push({
                type,
                trusted: event.isTrusted,
                body: scrollY,
                index: index()?.scrollTop ?? 0
            })
        },
        { capture: true, passive: true }
    )
}
Object.assign(window, {
    documentationFixture: {
        i18n,
        router,
        events,
        clearEvents() {
            events.length = 0
        },
        snapshot() {
            const navigation = index()
            const bounds = navigation?.getBoundingClientRect()
            return {
                body: scrollY,
                index: navigation?.scrollTop,
                indexMax: navigation ? navigation.scrollHeight - navigation.clientHeight : 0,
                indexBounds: bounds?.toJSON(),
                overscroll: navigation ? getComputedStyle(navigation).overscrollBehaviorY : '',
                bodyMax: document.documentElement.scrollHeight - innerHeight,
                width: innerWidth,
                scrollWidth: document.documentElement.scrollWidth,
                location: router.state.location,
                events: [...events]
            }
        }
    }
})

createRoot(document.getElementById('root')!).render(
    <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
            <DirectionProvider>
                <PanelAppearanceProvider>
                    <Suspense fallback={<div>Documentation fixture loading</div>}>
                        <LocaleDirectionSync />
                        <RouterProvider router={router} />
                    </Suspense>
                </PanelAppearanceProvider>
            </DirectionProvider>
        </QueryClientProvider>
    </I18nextProvider>
)
