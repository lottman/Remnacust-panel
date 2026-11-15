import '@mantine/core/styles.css'
import '../../../src/assets/fonts/napaleon-fonts.css'
import '../../../src/global.css'
import { DirectionProvider, Paper, Stack, Text, TextInput } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { GetStatusCommand } from '@remnawave/backend-contract'
import { QueryClientProvider } from '@tanstack/react-query'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'
import flagFont from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url'
import { Suspense, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { LocaleDirectionSync } from '../../../src/app/i18n/locale-direction-sync'
import { SidebarLayout } from '../../../src/app/layouts/dashboard/main-layout/layout-variants/sidebar.layout'
import { useMiscStore } from '../../../src/entities/dashboard/misc-store/use-misc-store'
import { instance } from '../../../src/shared/api/axios'
import { queryClient } from '../../../src/shared/api/query-client'
import { PanelAppearanceProvider } from '../../../src/shared/ui/appearance/appearance'
import { HeaderControls } from '../../../src/shared/ui/header-buttons/HeaderControls'
import { LoadingScreen } from '../../../src/shared/ui/loading-screen'

const parameters = new URLSearchParams(location.search)
localStorage.setItem('i18nextLng', parameters.get('lang') ?? 'en')
useMiscStore.getState().actions.setDisclaimerAccepted(true)
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFont)
instance.defaults.adapter = async (config) => {
    if (config.url !== GetStatusCommand.url)
        throw new Error('Unexpected fixture API request: ' + config.url)
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

const requests: Array<{ url: string; language: string; status?: number }> = []
let delay = Number(parameters.get('delay') ?? 0)
let fail = false
const nativeFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
    const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        location.href
    )
    if (url.origin !== location.origin) throw new Error('Non-loopback fixture request blocked')
    const match = /^\/locales\/([^/]+)\/remnawave\.json$/.exec(url.pathname)
    const request = match ? { url: url.href, language: match[1] } : undefined
    if (request) requests.push(request)
    if (request && delay) await new Promise((resolve) => setTimeout(resolve, delay))
    const response =
        request && fail ? new Response('', { status: 404 }) : await nativeFetch(input, init)
    if (request) Object.assign(request, { status: response.status })
    return response
}

const { default: i18n } = await import('../../../src/app/i18n/i18n')
if (!i18n.isInitialized)
    await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()))

const events: Array<{ name: string; language?: string; at: number }> = []
let mounts = 0
let unmounts = 0
let outerFallbacks = 0
let routeFallbacks = 0
const hidden: unknown[] = []
let sampling = false
for (const name of ['languageChanging', 'languageChanged']) {
    i18n.on(name, (language) => events.push({ name, language, at: performance.now() }))
}

function inspect() {
    const sentinel = document.querySelector<HTMLElement>('[data-testid="translated-text"]')
    const invisible =
        !sentinel ||
        !sentinel.textContent ||
        !sentinel.getClientRects().length ||
        [
            ...(function* () {
                for (let item = sentinel; item; item = item.parentElement) yield item
            })()
        ].some((item) => {
            const style = getComputedStyle(item)
            return (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                Number(style.opacity) === 0
            )
        })
    return {
        invisible,
        text: sentinel?.textContent,
        language: i18n.language,
        at: performance.now()
    }
}
const observer = new MutationObserver(() => {
    if (sampling) {
        const result = inspect()
        if (result.invisible) hidden.push(result)
    }
})
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
function sample() {
    if (sampling) {
        const result = inspect()
        if (result.invisible) hidden.push(result)
    }
    requestAnimationFrame(sample)
}
requestAnimationFrame(sample)

function Fallback({ outer = false }: { outer?: boolean }) {
    useLayoutEffect(() => {
        if (outer) outerFallbacks++
        else routeFallbacks++
    }, [outer])
    return outer ? (
        <div data-testid="outer-fallback">Outer suspense fallback</div>
    ) : (
        <LoadingScreen height="60vh" />
    )
}

function Page() {
    const { t } = useTranslation()
    const [draft, setDraft] = useState('Draft retained')
    useLayoutEffect(() => {
        mounts++
        return () => {
            unmounts++
        }
    }, [])
    return (
        <Paper p="md" withBorder data-testid="page">
            <Stack>
                <Text data-testid="translated-text">{t('common.message.loading')}</Text>
                <Text>{t('geofiles.defaults-help')}</Text>
                <TextInput
                    aria-label="Draft"
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                />
            </Stack>
        </Paper>
    )
}

function Shell() {
    const mobile = useMediaQuery('(max-width: 62em)')
    return (
        <SidebarLayout
            mobile={mobile}
            headerControls={
                <HeaderControls
                    telegramLink=""
                    withGithub={false}
                    withTelegram={false}
                    withSupport={false}
                    withLogout={false}
                    withVersion={false}
                    withAppearance={false}
                />
            }
        />
    )
}
const router = createMemoryRouter(
    [
        {
            path: '/dashboard/home',
            element: <Shell />,
            children: [{ index: true, element: <Page /> }]
        }
    ],
    { initialEntries: ['/dashboard/home'] }
)

const fixture = {
    i18n,
    setDelay(value: number) {
        delay = value
    },
    setFailure(value: boolean) {
        fail = value
    },
    start() {
        events.length = 0
        requests.length = 0
        hidden.length = 0
        outerFallbacks = 0
        routeFallbacks = 0
        sampling = true
    },
    stop() {
        sampling = false
        return this.snapshot()
    },
    snapshot() {
        return {
            events: [...events],
            requests: [...requests],
            hidden: [...hidden],
            mounts,
            unmounts,
            outerFallbacks,
            routeFallbacks,
            current: inspect(),
            language: i18n.language,
            direction: document.documentElement.dir,
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth
        }
    }
}
Object.assign(window, { languageFixture: fixture })

createRoot(document.getElementById('root')!).render(
    <I18nextProvider defaultNS="" i18n={i18n}>
        <QueryClientProvider client={queryClient}>
            <Suspense fallback={<Fallback outer />}>
                <DirectionProvider>
                    <PanelAppearanceProvider>
                        <Suspense fallback={<Fallback />}>
                            <LocaleDirectionSync />
                            <RouterProvider router={router} />
                        </Suspense>
                    </PanelAppearanceProvider>
                </DirectionProvider>
            </Suspense>
        </QueryClientProvider>
    </I18nextProvider>
)
