import {
    Button,
    Drawer,
    Group,
    isLightColor,
    MantineProvider,
    defaultVariantColorsResolver,
    SimpleGrid,
    Stack,
    Switch,
    Text,
    Tooltip,
    UnstyledButton,
    v8CssVariablesResolver,
    type VariantColorsResolver
} from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { MotionConfig } from 'motion/react'
import {
    createContext,
    memo,
    useDeferredValue,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { TbPalette, TbRestore } from 'react-icons/tb'

import { theme as baseTheme } from '@shared/constants'
import { useUiText } from '@shared/i18n/interface-text'
import { HeaderControl } from '@shared/ui/header-buttons/HeaderControl'

import {
    useLauncherEnabled,
    useViewPreferencesStoreActions
} from '@entities/dashboard/view-preferences-store'

import classes from './appearance.module.css'
import { useIconMotion } from './use-icon-motion'

const themes = {
    Light: {
        background: '#f4f5f7',
        surface: '#ffffff',
        accent: '#3b82f6',
        defaultAccent: 'Blue',
        light: true
    },
    Dark: {
        background: '#141418',
        surface: '#1c1c22',
        accent: '#e76f7a',
        defaultAccent: 'Coral',
        light: false
    },
    Purple: {
        background: '#191720',
        surface: '#24212e',
        accent: '#a99ae7',
        defaultAccent: 'Purple',
        light: false
    },
    Green: {
        background: '#131b17',
        surface: '#1d2921',
        accent: '#68c7a0',
        defaultAccent: 'Green',
        light: false
    },
    Midnight: {
        background: '#121923',
        surface: '#1b2633',
        accent: '#76b7de',
        defaultAccent: 'Cyan',
        light: false
    },
    Crimson: {
        background: '#1b1619',
        surface: '#292024',
        accent: '#dd8591',
        defaultAccent: 'Coral',
        light: false
    },
    Cyber: {
        background: '#111c1b',
        surface: '#1a2927',
        accent: '#67c5bb',
        defaultAccent: 'Teal',
        light: false
    },
    Slate: {
        background: '#171d24',
        surface: '#222b34',
        accent: '#80aee0',
        defaultAccent: 'Blue',
        light: false
    }
} as const

const themeLabels = {
    Light: 'design-ui.theme-light',
    Dark: 'design-ui.theme-dark',
    Purple: 'design-ui.theme-purple',
    Green: 'design-ui.theme-green',
    Midnight: 'design-ui.theme-midnight',
    Crimson: 'design-ui.theme-crimson',
    Cyber: 'design-ui.theme-cyber',
    Slate: 'design-ui.theme-slate'
} as const

const colorLabels = {
    Purple: 'design-ui.color-purple',
    Indigo: 'design-ui.color-indigo',
    Blue: 'design-ui.color-blue',
    Cobalt: 'design-ui.color-cobalt',
    Cyan: 'design-ui.color-cyan',
    Teal: 'design-ui.color-teal',
    Green: 'design-ui.color-green',
    Emerald: 'design-ui.color-emerald',
    Lime: 'design-ui.color-lime',
    Amber: 'design-ui.color-amber',
    Orange: 'design-ui.color-orange',
    Rose: 'design-ui.color-rose',
    Pink: 'design-ui.color-pink',
    Crimson: 'design-ui.color-crimson',
    Coral: 'design-ui.color-coral',
    Slate: 'design-ui.color-slate'
} as const

const accents = {
    Purple: '#6c5ce7',
    Indigo: '#6366f1',
    Blue: '#3b82f6',
    Cobalt: '#2563eb',
    Cyan: '#06b6d4',
    Teal: '#14b8a6',
    Green: '#10b981',
    Emerald: '#22c55e',
    Lime: '#84cc16',
    Amber: '#f59e0b',
    Orange: '#f97316',
    Rose: '#f43f5e',
    Pink: '#ec4899',
    Crimson: '#dc2626',
    Coral: '#e76f7a',
    Slate: '#94a3b8'
} as const

const fonts = {
    Montserrat: 'Montserrat, Vazirmatn, Noto Sans SC, sans-serif',
    Manrope: 'Manrope, Vazirmatn, Noto Sans SC, sans-serif',
    Rubik: 'Rubik, Vazirmatn, Noto Sans SC, sans-serif',
    Unbounded: 'Unbounded, Vazirmatn, Noto Sans SC, sans-serif',
    System: 'system-ui, -apple-system, Segoe UI, Vazirmatn, Noto Sans SC, sans-serif'
} as const

type ThemeName = keyof typeof themes
type AccentName = keyof typeof accents
type FontName = keyof typeof fonts
interface Appearance {
    theme: ThemeName
    accent: AccentName
    font: FontName
    compact: boolean
    reduceMotion: boolean
}

const storageKey = 'xera-panel-appearance-v1'
const defaults: Appearance = {
    theme: 'Dark',
    accent: 'Coral',
    font: 'Manrope',
    compact: false,
    reduceMotion: false
}

function storedAppearance(): Appearance {
    try {
        const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<Appearance>
        return {
            theme: value.theme && Object.hasOwn(themes, value.theme) ? value.theme : defaults.theme,
            accent:
                value.accent && Object.hasOwn(accents, value.accent)
                    ? value.accent
                    : defaults.accent,
            font: value.font && Object.hasOwn(fonts, value.font) ? value.font : defaults.font,
            compact: typeof value.compact === 'boolean' ? value.compact : defaults.compact,
            reduceMotion:
                typeof value.reduceMotion === 'boolean' ? value.reduceMotion : defaults.reduceMotion
        }
    } catch {
        return defaults
    }
}

function shade(hex: string, toward: string, weight: number) {
    const a = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    const b = [1, 3, 5].map((i) => Number.parseInt(toward.slice(i, i + 2), 16))
    return `#${a
        .map((value, i) =>
            Math.round(value * (1 - weight) + b[i] * weight)
                .toString(16)
                .padStart(2, '0')
        )
        .join('')}`
}

function accentShades(
    hex: string
): [string, string, string, string, string, string, string, string, string, string] {
    return [0.88, 0.72, 0.55, 0.35, 0.16]
        .map((weight) => shade(hex, '#ffffff', weight))
        .concat([
            hex,
            ...[0.12, 0.25, 0.4, 0.55].map((weight) => shade(hex, '#000000', weight))
        ]) as ReturnType<typeof accentShades>
}

function darkShades(
    background: string,
    surface: string
): [string, string, string, string, string, string, string, string, string, string] {
    return [
        '#f1f1f4',
        '#d9d9e2',
        '#a7a7b4',
        '#83838e',
        shade(surface, '#ffffff', 0.12),
        shade(surface, '#ffffff', 0.08),
        shade(surface, '#ffffff', 0.04),
        surface,
        background,
        shade(background, '#000000', 0.28)
    ]
}

function lightCompatibleDarkShades(
    background: string,
    surface: string
): ReturnType<typeof darkShades> {
    return [
        '#252c36',
        '#3f4752',
        '#596370',
        '#79838e',
        shade(background, '#647081', 0.22),
        shade(background, '#647081', 0.1),
        background,
        surface,
        shade(background, surface, 0.42),
        '#252c36'
    ]
}

const AppearanceContext = createContext<{
    appearance: Appearance
    accentColor: string
    reducedMotion: boolean
    setAppearance: (patch: Partial<Appearance>) => void
    resetAppearance: () => void
} | null>(null)

const PanelMotionContext = createContext(false)

const cssShades = (name: string) =>
    Array.from({ length: 10 }, (_, index) => `var(--panel-${name}-${index})`) as ReturnType<
        typeof accentShades
    >
const brandVariables = cssShades('brand')
const darkVariables = cssShades('dark')
const paletteVariantResolver: VariantColorsResolver = (input) => {
    const resolved = (baseTheme.variantColorResolver ?? defaultVariantColorsResolver)(input)
    const [color, index] = (input.color || input.theme.primaryColor).split('.')
    if (
        color === 'brand' &&
        input.variant === 'filled' &&
        (input.autoContrast ?? input.theme.autoContrast)
    ) {
        return {
            ...resolved,
            color: index ? `var(--panel-brand-contrast-${index})` : 'var(--panel-brand-contrast)'
        }
    }
    return resolved
}

// Palette changes update CSS, not Mantine context for every table cell.
const AppearanceThemeBridge = memo(function AppearanceThemeBridge({
    theme,
    colorScheme,
    children
}: {
    theme: typeof baseTheme
    colorScheme: 'light' | 'dark'
    children: React.ReactNode
}) {
    return (
        <MantineProvider
            theme={theme}
            forceColorScheme={colorScheme}
            cssVariablesResolver={v8CssVariablesResolver}
            deduplicateInlineStyles
        >
            {children}
        </MantineProvider>
    )
})

export function usePanelReducedMotion() {
    return useContext(PanelMotionContext)
}

export function usePanelAppearance() {
    const value = useContext(AppearanceContext)
    if (!value) throw new Error('Panel appearance provider is missing')
    return value
}

export function PanelAppearanceProvider({ children }: { children: React.ReactNode }) {
    const [appearance, update] = useState<Appearance>(storedAppearance)
    const { t } = useTranslation()
    const systemReducedMotion = useReducedMotion(undefined, { getInitialValueInEffect: false })
    const reducedMotion = appearance.reduceMotion || systemReducedMotion
    useIconMotion(reducedMotion)
    const preset = themes[appearance.theme]
    const colorScheme = useDeferredValue(preset.light ? ('light' as const) : ('dark' as const))
    const palette = shade(accents[appearance.accent], preset.surface, preset.light ? 0.08 : 0.18)
    const selectedTheme = useMemo(
        () => ({
            ...baseTheme,
            variantColorResolver: paletteVariantResolver,
            respectReducedMotion: true,
            components: {
                ...baseTheme.components,
                Modal: {
                    ...baseTheme.components?.Modal,
                    defaultProps: {
                        ...baseTheme.components?.Modal?.defaultProps,
                        removeScrollProps: {
                            ...baseTheme.components?.Modal?.defaultProps?.removeScrollProps,
                            noRelative: true
                        },
                        closeButtonProps: { 'aria-label': t('common.action.close') },
                        transitionProps: {
                            transition: 'pop',
                            duration: reducedMotion ? 0 : 220,
                            exitDuration: reducedMotion ? 0 : 140,
                            timingFunction: 'cubic-bezier(0.22, 0.8, 0.24, 1)'
                        }
                    }
                },
                Drawer: {
                    ...baseTheme.components?.Drawer,
                    defaultProps: {
                        ...baseTheme.components?.Drawer?.defaultProps,
                        removeScrollProps: {
                            ...baseTheme.components?.Drawer?.defaultProps?.removeScrollProps,
                            noRelative: true
                        },
                        closeButtonProps: { 'aria-label': t('common.action.close') },
                        transitionProps: {
                            duration: reducedMotion ? 0 : 180,
                            exitDuration: reducedMotion ? 0 : 120,
                            timingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
                        }
                    }
                }
            },
            colors: {
                ...baseTheme.colors,
                brand: brandVariables,
                dark: darkVariables
            },
            primaryColor: 'brand',
            primaryShade: { light: 7 as const, dark: 6 as const },
            fontFamily: `${fonts[appearance.font].replace(/,\s*sans-serif$/, '')}, "Twemoji Country Flags", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`,
            white: '#ffffff',
            black: 'var(--panel-black)',
            scale: appearance.compact ? 0.94 : 1,
            defaultRadius: 'md' as const
        }),
        [appearance.compact, appearance.font, reducedMotion, t]
    )

    useLayoutEffect(() => {
        if (!document.documentElement.classList.contains('panel-themed'))
            document.documentElement.classList.add('panel-themed')
        if (document.documentElement.dataset.panelTheme !== appearance.theme.toLowerCase())
            document.documentElement.dataset.panelTheme = appearance.theme.toLowerCase()
        if (document.documentElement.dataset.panelReducedMotion !== String(reducedMotion))
            document.documentElement.dataset.panelReducedMotion = String(reducedMotion)
        document.documentElement.style.colorScheme = preset.light ? 'light' : 'dark'
        if (
            document.documentElement.dataset.mantineColorScheme !==
            (preset.light ? 'light' : 'dark')
        )
            document.documentElement.dataset.mantineColorScheme = preset.light ? 'light' : 'dark'
        document.documentElement.style.setProperty(
            '--panel-black',
            preset.light ? '#252c36' : '#101114'
        )
        const brand = accentShades(palette)
        const dark = preset.light
            ? lightCompatibleDarkShades(preset.background, preset.surface)
            : darkShades(preset.background, preset.surface)
        brand.forEach((color, index) => {
            document.documentElement.style.setProperty(`--panel-brand-${index}`, color)
            document.documentElement.style.setProperty(
                `--panel-brand-contrast-${index}`,
                isLightColor(color, baseTheme.luminanceThreshold) ? 'var(--panel-black)' : '#ffffff'
            )
        })
        dark.forEach((color, index) =>
            document.documentElement.style.setProperty(`--panel-dark-${index}`, color)
        )
        document.documentElement.style.setProperty(
            '--panel-brand-contrast',
            `var(--panel-brand-contrast-${preset.light ? 7 : 6})`
        )
        document.documentElement.style.setProperty('--panel-surface', preset.surface)
        document.documentElement.style.setProperty('--panel-background', preset.background)
        document.documentElement.style.setProperty('--panel-accent', palette)
        document.documentElement.style.setProperty(
            '--panel-text',
            preset.light ? '#25252c' : '#f1f1f4'
        )
        document.documentElement.style.setProperty(
            '--panel-muted',
            preset.light ? '#5a5a66' : '#a7a7b4'
        )
        document.documentElement.style.setProperty(
            '--panel-elevated',
            shade(preset.surface, preset.light ? '#e6ebf1' : '#ffffff', preset.light ? 0.2 : 0.045)
        )
        document.documentElement.style.setProperty(
            '--panel-subtle',
            shade(preset.surface, preset.background, preset.light ? 0.52 : 0.4)
        )
        document.documentElement.style.setProperty(
            '--panel-border',
            shade(preset.surface, preset.light ? '#657387' : '#ffffff', preset.light ? 0.23 : 0.11)
        )
        document.documentElement.style.setProperty(
            '--panel-accent-text',
            preset.light ? shade(palette, '#000000', 0.47) : shade(palette, '#e7edf4', 0.42)
        )
    }, [appearance.theme, palette, preset, reducedMotion])

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(appearance))
        } catch {}
    }, [appearance])

    const value = useMemo(
        () => ({
            appearance,
            accentColor: palette,
            reducedMotion,
            setAppearance: (patch: Partial<Appearance>) => {
                const apply = () =>
                    update((current) =>
                        Object.entries(patch).every(
                            ([key, next]) => current[key as keyof Appearance] === next
                        )
                            ? current
                            : { ...current, ...patch }
                    )
                apply()
            },
            resetAppearance: () => update(defaults)
        }),
        [appearance, palette, reducedMotion]
    )

    return (
        <AppearanceContext.Provider value={value}>
            <PanelMotionContext.Provider value={reducedMotion}>
                <MotionConfig
                    reducedMotion={reducedMotion ? 'always' : 'never'}
                    skipAnimations={reducedMotion}
                >
                    <AppearanceThemeBridge theme={selectedTheme} colorScheme={colorScheme}>
                        {children}
                    </AppearanceThemeBridge>
                </MotionConfig>
            </PanelMotionContext.Provider>
        </AppearanceContext.Provider>
    )
}

export function AppearanceControl() {
    const uiText = useUiText()
    const { t } = useTranslation()

    const launcherEnabled = useLauncherEnabled()
    const { setLauncherEnabled } = useViewPreferencesStoreActions()
    const { appearance, setAppearance, resetAppearance } = usePanelAppearance()
    const [opened, setOpened] = useState(false)
    const label = uiText('theme-settings-697b009')

    return (
        <>
            <Tooltip label={label}>
                <HeaderControl aria-label={label} onClick={() => setOpened(true)}>
                    <TbPalette size={22} />
                </HeaderControl>
            </Tooltip>
            <Drawer
                opened={opened}
                onClose={() => setOpened(false)}
                position="right"
                size="min(420px, 100vw)"
                closeButtonProps={{ 'aria-label': t('common.action.close') }}
                title={label}
            >
                <Stack gap="lg" pb="lg">
                    <section>
                        <Text fw={700} mb="xs" size="sm">
                            {uiText('appearance-3907fa7')}
                        </Text>
                        <SimpleGrid cols={2} spacing="sm">
                            {(Object.keys(themes) as ThemeName[]).map((name) => (
                                <UnstyledButton
                                    aria-label={t(themeLabels[name])}
                                    aria-pressed={appearance.theme === name}
                                    className={classes.themeTile}
                                    key={name}
                                    onClick={() =>
                                        setAppearance({
                                            theme: name,
                                            accent: themes[name].defaultAccent
                                        })
                                    }
                                    style={
                                        {
                                            '--tile-background': themes[name].background,
                                            '--tile-surface': themes[name].surface,
                                            '--tile-accent': themes[name].accent,
                                            '--tile-text': themes[name].light
                                                ? '#253342'
                                                : '#e7eaf0'
                                        } as React.CSSProperties
                                    }
                                >
                                    <span className={classes.themePreview}>
                                        <span />
                                        <span />
                                        <span />
                                    </span>
                                    <span className={classes.themeLabel}>
                                        {t(themeLabels[name])}
                                    </span>
                                </UnstyledButton>
                            ))}
                        </SimpleGrid>
                    </section>
                    <section>
                        <Text fw={700} mb="xs" size="sm">
                            {uiText('accent-a5c6fb1')}
                        </Text>
                        <div className={classes.accents}>
                            {(Object.keys(accents) as AccentName[]).map((name) => (
                                <UnstyledButton
                                    aria-label={t(colorLabels[name])}
                                    aria-pressed={appearance.accent === name}
                                    className={classes.accentTile}
                                    key={name}
                                    onClick={() => setAppearance({ accent: name })}
                                    title={t(colorLabels[name])}
                                >
                                    <span style={{ backgroundColor: accents[name] }} />
                                    {t(colorLabels[name])}
                                </UnstyledButton>
                            ))}
                        </div>
                    </section>
                    <section>
                        <Text fw={700} mb="xs" size="sm">
                            {uiText('font-64d0b3a')}
                        </Text>
                        <SimpleGrid cols={2} spacing="xs">
                            {(Object.keys(fonts) as FontName[]).map((name) => (
                                <Button
                                    aria-pressed={appearance.font === name}
                                    color={appearance.font === name ? 'brand' : 'gray'}
                                    key={name}
                                    onClick={() => setAppearance({ font: name })}
                                    variant={appearance.font === name ? 'light' : 'default'}
                                >
                                    {name === 'System' ? t('design-ui.font-system') : name}
                                </Button>
                            ))}
                        </SimpleGrid>
                    </section>
                    <Stack gap="sm">
                        <Switch
                            checked={appearance.compact}
                            label={uiText('compact-interface-b1b6a87')}
                            onChange={(event) =>
                                setAppearance({ compact: event.currentTarget.checked })
                            }
                        />
                        <Switch
                            checked={appearance.reduceMotion}
                            label={uiText('reduce-motion-297ef4c')}
                            onChange={(event) =>
                                setAppearance({ reduceMotion: event.currentTarget.checked })
                            }
                        />
                        <Switch
                            checked={launcherEnabled}
                            label={uiText('launcher-22614ac')}
                            onChange={(event) => setLauncherEnabled(event.currentTarget.checked)}
                        />
                    </Stack>
                    <Group justify="flex-end">
                        <Button
                            leftSection={<TbRestore size={16} />}
                            onClick={resetAppearance}
                            variant="subtle"
                        >
                            {uiText('reset-daee760')}
                        </Button>
                    </Group>
                </Stack>
            </Drawer>
        </>
    )
}
