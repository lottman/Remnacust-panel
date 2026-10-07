import type { BgStyle, MaskableField } from './recap.constants'

import {
    alpha,
    Button,
    Center,
    ColorPicker,
    Group,
    Loader,
    Stack,
    Switch,
    TextInput
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import dayjs from 'dayjs'
import i18next from 'i18next'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCheck, TbCopy, TbDownload, TbX } from 'react-icons/tb'

import { useGetRecap } from '@shared/api/hooks/system/system.query.hooks'
import { useUiText } from '@shared/i18n/interface-text'
import { usePanelAppearance } from '@shared/ui/appearance/appearance'
import { Logo } from '@shared/ui/logo'
import { prettifyBytesUtil } from '@shared/utils/bytes'
import { copyScreenshotToClipboard, downloadScreenshot } from '@shared/utils/copy-screenshot.util'

import {
    BG_STYLES,
    CARD_SECTIONS,
    DEFAULT_SECTIONS,
    MASKABLE_FIELDS,
    SWATCHES
} from './recap.constants'
import classes from './recap.content.module.css'

export function RecapContent() {
    const uiText = useUiText()

    const { data: recap, isLoading } = useGetRecap()
    const { t } = useTranslation()
    const { accentColor, reducedMotion } = usePanelAppearance()

    const [sections, setSections] = useState<string[]>(DEFAULT_SECTIONS)
    const [customAccent, setAccent] = useState<string | null>(null)
    const accent = customAccent ?? accentColor
    const [copying, setCopying] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [maskedFields, setMaskedFields] = useState<string[]>([])
    const [customNote, setCustomNote] = useState('')
    const [bgStyle, setBgStyle] = useState<BgStyle>('gradient')

    const ref = useRef<HTMLDivElement>(null)

    const copy = async () => {
        setCopying(true)
        try {
            await copyScreenshotToClipboard(
                async () => {
                    await new Promise<void>((resolve) => {
                        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
                    })
                    if (!ref.current) throw new Error('ref')
                    return ref.current
                },
                `remnacust-recap-${dayjs().format('YYYY-MM-DD')}.png`
            )
        } catch (error) {
            notifications.show({
                color: 'red',
                message: `${error instanceof Error ? error.message : 'Unknown error'}`,
                title: i18next.t('common.message.error')
            })
        } finally {
            setCopying(false)
        }
    }

    const download = async () => {
        setDownloading(true)
        try {
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            })

            if (!ref.current) throw new Error('ref')
            await downloadScreenshot(
                ref.current,
                `remnacust-recap-${dayjs().format('YYYY-MM-DD')}.png`
            )
        } catch {
            notifications.show({
                color: 'red',
                message: uiText('could-not-download-recap-659e20e'),
                title: i18next.t('common.message.error')
            })
        } finally {
            setDownloading(false)
        }
    }

    if (isLoading || !recap) {
        return (
            <Center h={600}>
                <Loader color={accentColor} size="sm" />
            </Center>
        )
    }

    const gradientLine = {
        background: `linear-gradient(90deg, transparent, ${alpha(accent, 0.3)}, transparent)`
    }

    const formatInt = (value: number) => {
        return new Intl.NumberFormat(i18next.resolvedLanguage ?? 'en', {
            notation: 'compact'
        }).format(value)
    }

    const getBgOverlay = (): null | React.CSSProperties => {
        switch (bgStyle) {
            case 'dots':
                return {
                    backgroundImage: `radial-gradient(${alpha(accent, 0.12)} 1px, transparent 1px)`,
                    backgroundSize: '16px 16px'
                }
            case 'gradient':
                return {
                    background: `linear-gradient(135deg, transparent 0%, ${alpha(accent, 0.08)} 50%, transparent 100%)`
                }
            case 'grid':
                return {
                    backgroundImage: `linear-gradient(${alpha(accent, 0.06)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(accent, 0.06)} 1px, transparent 1px)`,
                    backgroundSize: '24px 24px'
                }
            default:
                return null
        }
    }

    const bgOverlay = getBgOverlay()

    const MASK = '\u{1F648}'
    const m = (field: MaskableField, value: number | string | undefined) =>
        maskedFields.includes(field) ? MASK : value

    return (
        <div className={classes.editor}>
            <motion.div
                animate={{ opacity: 1, scale: 1 }}
                initial={{ opacity: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
                <Stack className={classes.settings} gap="sm">
                    <div className={classes.controlPanel}>
                        <div className={classes.controlLabel}>{uiText('sections-9bae918')}</div>
                        <Stack gap="xs">
                            {CARD_SECTIONS.map((s) => (
                                <Switch
                                    checked={sections.includes(s.value)}
                                    key={s.value}
                                    label={s.label}
                                    onChange={(e) => {
                                        const { checked } = e.currentTarget
                                        setSections((prev) =>
                                            checked
                                                ? [...prev, s.value]
                                                : prev.filter((v) => v !== s.value)
                                        )
                                    }}
                                    size="sm"
                                />
                            ))}
                        </Stack>
                    </div>

                    <div className={classes.controlPanel}>
                        <div className={classes.controlLabel}>{uiText('mask-fields-f71dfc0')}</div>
                        <Group gap={4}>
                            {MASKABLE_FIELDS.map((f) => {
                                const active = maskedFields.includes(f.value)
                                return (
                                    <Button
                                        color={!active ? accentColor : 'gray'}
                                        key={f.value}
                                        leftSection={
                                            !active ? <TbCheck size={16} /> : <TbX size={16} />
                                        }
                                        onClick={() =>
                                            setMaskedFields((prev) =>
                                                active
                                                    ? prev.filter((v) => v !== f.value)
                                                    : [...prev, f.value]
                                            )
                                        }
                                        radius="md"
                                        size="compact-sm"
                                        variant="soft"
                                    >
                                        {f.label}
                                    </Button>
                                )
                            })}
                        </Group>
                    </div>
                </Stack>
            </motion.div>

            <motion.div
                animate={{ opacity: 1, scale: 1 }}
                initial={{ opacity: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
                <div
                    className={classes.card}
                    ref={ref}
                    style={{ border: `2px solid ${alpha(accent, 0.3)}` }}
                >
                    {dayjs(recap.initDate).isBefore('2025-04-01') && (
                        <div className={classes.ribbon} style={{ background: accent }}>
                            {uiText('early-adopter-c630122')}
                        </div>
                    )}

                    <div
                        className={`${classes.glow} ${classes.glowTop}`}
                        data-recap-animated={
                            (!reducedMotion && !copying && !downloading) || undefined
                        }
                        style={{ background: accent }}
                    />
                    <div
                        className={`${classes.glow} ${classes.glowBottom}`}
                        data-recap-animated={
                            (!reducedMotion && !copying && !downloading) || undefined
                        }
                        style={{ background: accent }}
                    />

                    {bgOverlay && <div className={classes.bgOverlay} style={bgOverlay} />}

                    <div className={classes.brand}>
                        <Logo size={24} style={{ color: accent }} />
                        <span className={classes.brandName}>
                            <span style={{ color: accent }}>REMNA</span>CUST
                        </span>
                    </div>

                    <div className={classes.hero}>
                        <div className={classes.heroValue} style={{ color: accent }}>
                            {m('totalUsers', formatInt(recap.total.users))}
                        </div>
                        <div className={classes.heroLabel}>{uiText('total-users-d643aee')}</div>
                    </div>

                    {sections.includes('stats') && (
                        <div className={classes.statsRow}>
                            <div className={classes.stat}>
                                <div className={classes.statValue}>
                                    {m('nodes', formatInt(recap.total.nodes))}
                                </div>
                                <div className={classes.statLabel}>{uiText('nodes-45978ec')}</div>
                            </div>
                            <div className={classes.stat}>
                                <div className={classes.statValue}>
                                    {m(
                                        'totalTraffic',
                                        prettifyBytesUtil(recap.total.traffic, true)
                                    )}
                                </div>
                                <div className={classes.statLabel}>{uiText('traffic-075f4ab')}</div>
                            </div>
                        </div>
                    )}

                    {sections.includes('month') && (
                        <>
                            <div className={classes.divider} style={gradientLine} />
                            <div className={classes.section}>
                                <div className={classes.sectionTitle}>
                                    {dayjs().format('MMMM YYYY')}
                                </div>
                                <div className={classes.monthGrid}>
                                    <div className={classes.monthItem}>
                                        <div className={classes.monthValue}>
                                            {m('monthUsers', formatInt(recap.thisMonth.users))}
                                        </div>
                                        <div className={classes.monthLabel}>
                                            {uiText('new-users-c5ef14e')}
                                        </div>
                                    </div>
                                    <div className={classes.monthItem}>
                                        <div className={classes.monthValue}>
                                            {m(
                                                'monthTraffic',
                                                prettifyBytesUtil(recap.thisMonth.traffic, true)
                                            )}
                                        </div>
                                        <div className={classes.monthLabel}>
                                            {uiText('traffic-075f4ab')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {sections.includes('infra') && (
                        <>
                            <div className={classes.divider} style={gradientLine} />
                            <div className={classes.section}>
                                <div className={classes.sectionTitle}>
                                    {uiText('infrastructure-ce0cff7')}
                                </div>
                                <div className={classes.infraGrid}>
                                    <div>
                                        <div className={classes.infraValue}>
                                            {m(
                                                'countries',
                                                formatInt(recap.total.distinctCountries)
                                            )}
                                        </div>
                                        <div className={classes.infraLabel}>
                                            {uiText('countries-e45d4cb')}
                                        </div>
                                    </div>
                                    <div>
                                        <div className={classes.infraValue}>
                                            {m('cpuCores', formatInt(recap.total.nodesCpuCores))}
                                        </div>
                                        <div className={classes.infraLabel}>
                                            {uiText('cpu-cores-5dbed0b')}
                                        </div>
                                    </div>
                                    <div>
                                        <div className={classes.infraValue}>
                                            {m(
                                                'ram',
                                                prettifyBytesUtil(recap.total.nodesRam, true)
                                            )}
                                        </div>
                                        <div className={classes.infraLabel}>RAM</div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {sections.length > 0 && (
                        <div className={classes.divider} style={gradientLine} />
                    )}

                    {customNote && (
                        <div className={classes.customNote} style={{ color: accent }}>
                            {customNote}
                        </div>
                    )}

                    <div className={classes.footer}>
                        <span className={classes.since} style={{ color: accent }}>
                            {uiText('since-98af1ed')} {dayjs(recap.initDate).format('MMM D, YYYY')}
                        </span>
                        <span
                            className={classes.version}
                            style={{
                                background: alpha(accent, 0.1),
                                color: alpha(accent, 0.7)
                            }}
                        >
                            v{recap.version}
                        </span>
                    </div>
                </div>
            </motion.div>

            <motion.div
                animate={{ opacity: 1, scale: 1 }}
                initial={{ opacity: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
                <Stack className={classes.settings} gap="sm">
                    <div className={classes.controlPanel}>
                        <div className={classes.controlLabel}>{uiText('background-ea2b8a8')}</div>
                        <Group gap={4}>
                            {BG_STYLES.map((s) => (
                                <Button
                                    color={bgStyle === s.value ? accentColor : 'gray'}
                                    key={s.value}
                                    onClick={() => setBgStyle(s.value)}
                                    radius="md"
                                    size="compact-sm"
                                    variant="soft"
                                >
                                    {s.label}
                                </Button>
                            ))}
                        </Group>
                    </div>

                    <div className={classes.controlPanel}>
                        <div className={classes.controlLabel}>{uiText('custom-note-b11388e')}</div>
                        <TextInput
                            maxLength={40}
                            onChange={(e) => setCustomNote(e.currentTarget.value)}
                            placeholder="Remnacust <3"
                            size="xs"
                            value={customNote}
                        />
                    </div>

                    <div className={classes.controlPanel}>
                        <div className={classes.controlLabel}>{uiText('accent-color-baeefba')}</div>
                        <ColorPicker
                            format="rgb"
                            onChange={setAccent}
                            size="md"
                            swatches={SWATCHES}
                            swatchesPerRow={8}
                            value={accent}
                            withPicker
                        />
                    </div>

                    <Group gap="xs">
                        <Button
                            color={accent}
                            fullWidth
                            leftSection={<TbCopy size={14} />}
                            loading={copying}
                            onClick={copy}
                            radius="md"
                            size="sm"
                            variant="filled"
                        >
                            {t('common.action.copy')}
                        </Button>
                        <Button
                            fullWidth
                            leftSection={<TbDownload size={14} />}
                            loading={downloading}
                            onClick={download}
                            radius="md"
                            size="sm"
                            variant="default"
                        >
                            {t('common.action.download')}
                        </Button>
                    </Group>
                </Stack>
            </motion.div>
        </div>
    )
}
