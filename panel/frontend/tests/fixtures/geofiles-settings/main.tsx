import '@mantine/core/styles.css'
import { Button, Container, DirectionProvider, Group, Paper, Stack, Text } from '@mantine/core'
import { QueryClientProvider } from '@tanstack/react-query'
import i18next from 'i18next'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import Masonry from 'react-layout-masonry'

import en from '../../../public/locales/en/remnawave.json'
import fa from '../../../public/locales/fa/remnawave.json'
import ru from '../../../public/locales/ru/remnawave.json'
import zh from '../../../public/locales/zh/remnawave.json'
import {
    PanelAppearanceProvider,
    usePanelAppearance
} from '../../../src/shared/ui/appearance/appearance'
import { SubscriptionAdditionalOptionsWidget } from '../../../src/widgets/dashboard/subscription-settings/settings/cards/subscription-additional-options.widget'
import { GeofileInlineSettings } from '../../../src/widgets/dashboard/templates/subscription-template-editor/geofile-inline-settings'
import {
    boundary,
    defaultFiles,
    defaultSources,
    initialSettings,
    queryClient,
    settingsKey,
    type Settings
} from './api'

const params = new URLSearchParams(location.search)
const language = params.get('lang') ?? (location.pathname.endsWith('/ru.html') ? 'ru' : 'en')
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

for (const [parameter, key] of [
    ['master', 'geofilesSystemEnabled'],
    ['compiled', 'geofilesEnabled'],
    ['json', 'serveJsonAtBaseSubscription']
] as const) {
    if (params.has(parameter))
        boundary.configure({ [key]: params.get(parameter) === 'true' }, { publish: false })
}
if (!params.has('cold')) queryClient.setQueryData(settingsKey, boundary.snapshot().settings)
const getDelay = Number(params.get('getDelay') ?? 0)
if (getDelay) boundary.delay('settingsGET', getDelay)
if (params.has('holdGET')) boundary.hold('settingsGET')

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const accordionControl = () => {
    const control = document.querySelector<HTMLButtonElement>(
        '[data-testid="additional-settings"] button[aria-expanded]'
    )
    if (!control) throw new Error('Default geofiles accordion not found')
    return control
}
const accordionSnapshot = () => {
    const control = accordionControl()
    const panel = document.getElementById(control.getAttribute('aria-controls')!)!
    return {
        expanded: control.getAttribute('aria-expanded') === 'true',
        connected: control.isConnected,
        inputs: panel.querySelectorAll('input').length,
        height: panel.getBoundingClientRect().height,
        pending: boundary.snapshot().pending.map((call) => call.operation)
    }
}
async function settleAccordion(expanded: boolean) {
    const deadline = performance.now() + 15_000
    for (;;) {
        const control = accordionControl()
        const panel = document.getElementById(control.getAttribute('aria-controls')!)!
        if (
            control.getAttribute('aria-expanded') === String(expanded) &&
            !boundary.snapshot().pending.some((call) => call.operation === 'filesGET') &&
            !panel
                .getAnimations({ subtree: true })
                .some((animation) => animation.playState === 'running')
        )
            break
        if (performance.now() > deadline) throw new Error('Accordion did not settle')
        await nextFrame()
    }
    await new Promise((resolve) => setTimeout(resolve, 260))
    await nextFrame()
    await nextFrame()
    return accordionSnapshot()
}
let remount = () => {}
let outerSubmits = 0
let appearanceController: ReturnType<typeof usePanelAppearance> | undefined

const fixture = {
    ...boundary,
    queryClient,
    settingsKey,
    defaultSources,
    defaultFiles,
    initialSettings,
    i18n: i18next,
    setAppearance(patch: Parameters<ReturnType<typeof usePanelAppearance>['setAppearance']>[0]) {
        if (!appearanceController) throw new Error('Appearance provider is not ready')
        appearanceController.setAppearance(patch)
    },
    appearanceSnapshot() {
        if (!appearanceController) throw new Error('Appearance provider is not ready')
        return {
            appearance: structuredClone(appearanceController.appearance),
            reducedMotion: appearanceController.reducedMotion
        }
    },
    async reset(values: Partial<Settings> = {}, options: { seed?: boolean } = {}) {
        await boundary.reset(values, options)
        outerSubmits = 0
        remount()
        await nextFrame()
        await nextFrame()
    },
    snapshot: () => ({ ...boundary.snapshot(), outerSubmits }),
    accordionSnapshot,
    async cycleAccordion(count = 5) {
        if (!Number.isSafeInteger(count) || count < 1 || count > 100)
            throw new Error('Invalid cycle count')
        const samples = []
        const callsBefore = boundary.snapshot().calls.length
        const start = performance.now()
        performance.mark('geofiles-accordion-start')
        for (let index = 0; index < count; index++) {
            if (accordionControl().getAttribute('aria-expanded') === 'true') {
                accordionControl().click()
                await settleAccordion(false)
            }
            accordionControl().click()
            const opened = await settleAccordion(true)
            accordionControl().click()
            const closed = await settleAccordion(false)
            samples.push({ opened, closed })
        }
        performance.mark('geofiles-accordion-end')
        performance.measure(
            'geofiles-accordion-cycle',
            'geofiles-accordion-start',
            'geofiles-accordion-end'
        )
        return {
            count,
            elapsed: performance.now() - start,
            samples,
            requests: boundary.snapshot().calls.slice(callsBefore)
        }
    }
}
const fixtureWindow = window as unknown as { geofilesSettingsFixture: typeof fixture }
fixtureWindow.geofilesSettingsFixture = fixture

function App() {
    const [revision, setRevision] = useState(0)
    const appearance = usePanelAppearance()
    useEffect(() => {
        appearanceController = appearance
        return () => {
            appearanceController = undefined
        }
    }, [appearance])
    useEffect(() => {
        remount = () => setRevision((value) => value + 1)
        return () => {
            remount = () => {}
        }
    }, [])
    return (
        <Container fluid py="md" style={{ maxWidth: 1800 }}>
            <Stack gap="lg">
                <Text size="sm">
                    Real settings widgets / Mantine / React Query; synthetic API boundary
                </Text>
                <Group data-testid="fixture-controls">
                    <Button type="button" size="xs" onClick={() => void fixture.reset()}>
                        Screenshot baseline
                    </Button>
                    <Button type="button" size="xs" onClick={() => void fixture.cycleAccordion()}>
                        Cycle accordion
                    </Button>
                </Group>
                <Stack key={revision}>
                    <div data-testid="masonry-host">
                        <Masonry columns={{ 300: 1, 1400: 2, 2000: 3, 3000: 4 }} gap={16}>
                            <div
                                data-testid="additional-settings"
                                onSubmitCapture={() => {
                                    outerSubmits++
                                }}
                            >
                                <SubscriptionAdditionalOptionsWidget
                                    subscriptionSettings={
                                        boundary.snapshot().settings as Parameters<
                                            typeof SubscriptionAdditionalOptionsWidget
                                        >[0]['subscriptionSettings']
                                    }
                                />
                            </div>
                            <Paper withBorder p="md" data-testid="companion-card">
                                <Stack gap="sm">
                                    <Text fw={600}>Companion settings card</Text>
                                    <Text size="sm" c="dimmed">
                                        Static content for the real subscription settings Masonry
                                        layout.
                                    </Text>
                                </Stack>
                            </Paper>
                        </Masonry>
                    </div>
                    <Paper withBorder p="md" data-testid="inline-settings">
                        <GeofileInlineSettings />
                    </Paper>
                </Stack>
            </Stack>
        </Container>
    )
}

createRoot(document.getElementById('root')!).render(
    <DirectionProvider initialDirection={language === 'fa' ? 'rtl' : 'ltr'}>
        <I18nextProvider i18n={i18next}>
            <QueryClientProvider client={queryClient}>
                <PanelAppearanceProvider>
                    <App />
                </PanelAppearanceProvider>
            </QueryClientProvider>
        </I18nextProvider>
    </DirectionProvider>
)
