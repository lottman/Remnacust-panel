import { alpha } from '@mantine/core'
import {
    forwardRef,
    KeyboardEvent,
    memo,
    PointerEvent,
    useCallback,
    useEffect,
    useId,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from 'react'
import { useTranslation } from 'react-i18next'

import { usePanelReducedMotion } from '@shared/ui/appearance/appearance'
import { CountryFlag } from '@shared/ui/get-country-flag'
import { prettifyBytesUtil } from '@shared/utils/bytes'
import { formatTimeUtil } from '@shared/utils/time-utils'

import {
    createUsageRows,
    findUsageSegment,
    usageValue,
    UsageRow,
    UsageSeries
} from './nodes-usage-layout'
import classes from './statistic-barchart.module.css'

const ROW_HEIGHT = 48
const LABEL_WIDTH = 66
const EDGE = 12
type Selection = { day: number; node: number; source: UsageRow[] }
type Props = { categories: string[]; series: UsageSeries[]; onDayClick: (day: number) => void }
type Dates = { short: string; full: string }[]
type TooltipHandle = { show: (selection: Selection | null) => void }

// Pointer movement only updates this small subtree, never the rows or legend.
const UsageTooltip = memo(
    forwardRef<
        TooltipHandle,
        {
            id: string
            rows: UsageRow[]
            series: UsageSeries[]
            dates: Dates
        }
    >(({ id, rows, series, dates }, ref) => {
        const { t } = useTranslation()
        const [active, setActive] = useState<Selection | null>(null)
        useImperativeHandle(ref, () => ({ show: setActive }), [])
        const selection = active?.source === rows ? active : null
        if (!selection) return null
        const node = series[selection.node]
        const nearby = []
        for (
            let day = Math.min(dates.length - 1, selection.day + 5);
            day >= Math.max(0, selection.day - 5);
            day--
        ) {
            const value = usageValue(node.data[day])
            if (value > 0) nearby.push({ day, value })
        }
        const nearbyMax = Math.max(1, ...nearby.map((entry) => entry.value))
        return (
            <div className={classes.tooltip} id={id} role="tooltip">
                <div className={classes.nodeName}>
                    <CountryFlag countryCode={node.countryCode} /> {node.name}
                </div>
                <div className={classes.tooltipMuted}>{dates[selection.day].full}</div>
                <div className={classes.tooltipValue}>
                    {prettifyBytesUtil(usageValue(node.data[selection.day]))}
                </div>
                <div className={classes.nearby}>
                    {nearby.map((entry) => (
                        <div key={entry.day} className={classes.nearbyRow}>
                            <span>{dates[entry.day].short}</span>
                            <span className={classes.miniTrack}>
                                <span
                                    style={{
                                        width: `${(entry.value / nearbyMax) * 100}%`,
                                        background: node.color
                                    }}
                                />
                            </span>
                            <span>{prettifyBytesUtil(entry.value, true)}</span>
                        </div>
                    ))}
                </div>
                <div className={classes.tooltipMuted}>
                    {t('statistic-nodes.component.total-traffic-placeholder', {
                        totalTraffic: prettifyBytesUtil(
                            series.reduce(
                                (sum, entry) => sum + usageValue(entry.data[selection.day]),
                                0
                            )
                        )
                    })}
                </div>
                <div className={classes.tooltipMuted}>{t('common.message.click-to-see-all')}</div>
            </div>
        )
    })
)

export const NodesUsageChart = memo(({ categories, series, onDayClick }: Props) => {
    const { t, i18n } = useTranslation()
    const reducedMotion = usePanelReducedMotion()
    const tooltipId = useId()
    const [hiddenNames, setHiddenNames] = useState<Set<string>>(() => new Set())
    const hidden = useMemo(
        () =>
            new Set(
                series.flatMap((node, index) =>
                    hiddenNames.has(node.uuid ?? node.name) ? [index] : []
                )
            ),
        [series, hiddenNames]
    )
    const selected = useRef<Selection | null>(null)
    const tooltipContent = useRef<TooltipHandle>(null)
    const [width, setWidth] = useState(0)
    const [paletteRevision, setPaletteRevision] = useState(0)
    const viewport = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const marker = useRef<HTMLDivElement>(null)
    const tooltip = useRef<HTMLDivElement>(null)
    const frame = useRef<number | null>(null)
    const height = Math.min(528, Math.max(144, categories.length * ROW_HEIGHT))
    const plotWidth = Math.max(1, width - LABEL_WIDTH - EDGE)
    const { rows, max } = useMemo(
        () => createUsageRows(categories.length, series, hidden),
        [categories.length, series, hidden]
    )
    const dates = useMemo(
        () =>
            categories.map((time) => ({
                short: formatTimeUtil({ time, template: 'SHORT_DATE', language: i18n.language }),
                full: formatTimeUtil({ time, template: 'FULL_DATE', language: i18n.language })
            })),
        [categories, i18n.language]
    )

    const hide = useCallback(() => {
        selected.current = null
        tooltipContent.current?.show(null)
        if (marker.current) marker.current.hidden = true
    }, [])

    useLayoutEffect(() => {
        const element = viewport.current
        if (!element) return
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
        observer.observe(element)
        const theme = new MutationObserver(() => setPaletteRevision((value) => value + 1))
        theme.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style', 'data-mantine-color-scheme', 'data-panel-theme']
        })
        return () => {
            observer.disconnect()
            theme.disconnect()
        }
    }, [])

    const draw = useCallback(() => {
        const element = canvas.current
        const container = viewport.current
        if (!element || !container || width === 0) return
        if (selected.current?.source !== rows && marker.current) marker.current.hidden = true
        const context = element.getContext('2d')
        if (!context) return
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        if (
            element.width !== Math.round(width * ratio) ||
            element.height !== Math.round(height * ratio)
        ) {
            element.width = Math.round(width * ratio)
            element.height = Math.round(height * ratio)
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        context.clearRect(0, 0, width, height)
        const style = getComputedStyle(container)
        const textColor = style.getPropertyValue('--panel-muted').trim() || style.color
        const borderColor = style.getPropertyValue('--panel-border').trim() || textColor
        const start = Math.floor(container.scrollTop / ROW_HEIGHT)
        const end = Math.min(rows.length, start + Math.ceil(height / ROW_HEIGHT) + 1)
        context.font = `12px ${style.fontFamily}`
        context.textAlign = 'right'
        context.textBaseline = 'middle'
        for (let index = start; index < end; index++) {
            const row = rows[index]
            const y = index * ROW_HEIGHT - container.scrollTop
            context.strokeStyle = borderColor
            context.setLineDash([4, 4])
            context.beginPath()
            context.moveTo(LABEL_WIDTH, Math.round(y) + 0.5)
            context.lineTo(width - EDGE, Math.round(y) + 0.5)
            context.stroke()
            context.setLineDash([])
            context.fillStyle = textColor
            context.fillText(
                dates[row.day].short,
                LABEL_WIDTH - 10,
                y + ROW_HEIGHT / 2,
                LABEL_WIDTH - 12
            )
            for (const segment of row.segments) {
                const x = LABEL_WIDTH + (segment.start / max) * plotWidth
                const length = ((segment.end - segment.start) / max) * plotWidth
                const node = series[segment.node]
                context.fillStyle = alpha(node.color, 0.5)
                context.fillRect(x, y + 10, length, ROW_HEIGHT - 20)
                context.strokeStyle = node.color
                context.lineWidth = 0.5
                context.strokeRect(x, y + 10, length, ROW_HEIGHT - 20)
            }
        }
    }, [width, height, rows, dates, max, plotWidth, series, paletteRevision])

    useLayoutEffect(() => {
        draw()
    }, [draw])
    useEffect(
        () => () => {
            if (frame.current !== null) cancelAnimationFrame(frame.current)
        },
        []
    )
    const handleScroll = () => {
        hide()
        if (frame.current !== null) return
        frame.current = requestAnimationFrame(() => {
            frame.current = null
            draw()
        })
    }

    const show = (day: number, node: number, y: number) => {
        const rowIndex = categories.length - 1 - day
        const segment = rows[rowIndex]?.segments.find((entry) => entry.node === node)
        const highlight = marker.current
        if (!segment || !highlight) return hide()
        highlight.hidden = false
        highlight.style.left = `${LABEL_WIDTH + (segment.start / max) * plotWidth}px`
        highlight.style.top = `${rowIndex * ROW_HEIGHT - (viewport.current?.scrollTop ?? 0) + 10}px`
        highlight.style.width = `${Math.max(1, ((segment.end - segment.start) / max) * plotWidth)}px`
        highlight.style.backgroundColor = alpha(series[node].color, 0.2)
        if (tooltip.current) {
            tooltip.current.style.top = `${Math.max(8, Math.min(height - 260, y - 110))}px`
        }
        if (
            selected.current?.source === rows &&
            selected.current.day === day &&
            selected.current.node === node
        )
            return
        selected.current = { day, node, source: rows }
        tooltipContent.current?.show(selected.current)
    }

    const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'touch') return
        const element = viewport.current
        if (!element) return
        const rect = element.getBoundingClientRect()
        const y = event.clientY - rect.top
        const row = rows[Math.floor((y + element.scrollTop) / ROW_HEIGHT)]
        const value = ((event.clientX - rect.left - LABEL_WIDTH) / plotWidth) * max
        const segment = findUsageSegment(row, value)
        if (
            !segment ||
            (y + element.scrollTop) % ROW_HEIGHT < 10 ||
            (y + element.scrollTop) % ROW_HEIGHT > ROW_HEIGHT - 10
        )
            return hide()
        show(row.day, segment.node, y)
    }

    const handleKeys = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (event.key === 'Escape') {
            hide()
            return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const next = Math.max(
                0,
                Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))
            )
            viewport.current
                ?.querySelector<HTMLButtonElement>(`[data-usage-row="${next}"]`)
                ?.focus()
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            const entries = rows[index].segments
            const active = entries.findIndex((entry) => entry.node === selected.current?.node)
            const next = Math.max(
                0,
                Math.min(entries.length - 1, active + (event.key === 'ArrowRight' ? 1 : -1))
            )
            if (entries[next])
                show(
                    rows[index].day,
                    entries[next].node,
                    index * ROW_HEIGHT - (viewport.current?.scrollTop ?? 0)
                )
        }
    }

    return (
        <div
            data-icon-motion="off"
            data-reduced-motion={reducedMotion || undefined}
            className={classes.chart}
        >
            <div className={classes.plotShell}>
                <div
                    className={classes.viewport}
                    ref={viewport}
                    style={{ height }}
                    onScroll={handleScroll}
                    onPointerMove={handlePointer}
                    onPointerLeave={hide}
                >
                    <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
                        <canvas
                            aria-hidden="true"
                            className={classes.canvas}
                            ref={canvas}
                            style={{ width: '100%', height }}
                        />
                        {rows.map((row, index) => (
                            <button
                                key={categories[row.day]}
                                className={classes.dayButton}
                                data-usage-row={index}
                                style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                                aria-label={`${dates[row.day].full}: ${prettifyBytesUtil(row.total)}. ${t('common.message.click-to-see-all')}`}
                                aria-describedby={tooltipId}
                                onFocus={() => {
                                    if (row.segments[0])
                                        show(
                                            row.day,
                                            row.segments[0].node,
                                            index * ROW_HEIGHT - (viewport.current?.scrollTop ?? 0)
                                        )
                                }}
                                onBlur={hide}
                                onKeyDown={(event) => handleKeys(event, index)}
                                onClick={() => onDayClick(row.day)}
                            />
                        ))}
                    </div>
                </div>
                <div className={classes.markerViewport}>
                    <div className={classes.marker} hidden ref={marker} />
                </div>
                <div className={classes.tooltipPosition} ref={tooltip}>
                    <UsageTooltip
                        ref={tooltipContent}
                        id={tooltipId}
                        rows={rows}
                        series={series}
                        dates={dates}
                    />
                </div>
            </div>
            <div
                className={classes.axis}
                style={{ marginInlineStart: LABEL_WIDTH }}
                aria-hidden="true"
            >
                {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                    <span key={fraction}>{prettifyBytesUtil(fraction * max, true)}</span>
                ))}
            </div>
            <div className={classes.legend}>
                {series.map((entry, index) => (
                    <button
                        type="button"
                        key={`${entry.name}-${index}`}
                        className={classes.legendButton}
                        aria-pressed={!hidden.has(index)}
                        onClick={() =>
                            setHiddenNames((previous) => {
                                const next = new Set(previous)
                                const name = entry.uuid ?? entry.name
                                if (next.has(name)) next.delete(name)
                                else next.add(name)
                                return next
                            })
                        }
                    >
                        <span className={classes.legendDot} style={{ background: entry.color }} />
                        <span>{entry.name}</span>
                    </button>
                ))}
            </div>
        </div>
    )
})
