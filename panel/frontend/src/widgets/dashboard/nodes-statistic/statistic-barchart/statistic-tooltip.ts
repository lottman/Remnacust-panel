import type { Point } from 'highcharts'

import { alpha } from '@mantine/core'
import { GetStatsNodesUsageCommand } from '@remnawave/backend-contract'

import { prettifyBytesUtil } from '@shared/utils/bytes'
import { formatTimeUtil } from '@shared/utils/time-utils'

const escapeHtml = (value: string) =>
    value.replace(
        /[&<>"']/g,
        (character) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]!
    )

export const createNodesTooltipFormatter = (
    categories: string[],
    series: GetStatsNodesUsageCommand.Response['response']['series'],
    language: string,
    clickHint: string
) => {
    const dates = categories.map((time) => ({
        short: escapeHtml(formatTimeUtil({ time, template: 'SHORT_DATE', language })),
        full: escapeHtml(formatTimeUtil({ time, template: 'FULL_DATE', language }))
    }))
    const totals = categories.map((_, index) =>
        series.reduce((sum, entry) => sum + (entry.data[index] || 0), 0)
    )
    const labels = series.map((entry) => escapeHtml(entry.name))
    const colors = series.map((entry) => ({
        active: alpha(entry.color, 0.8),
        muted: alpha(entry.color, 0.4)
    }))
    const hint = escapeHtml(clickHint)
    let lastSeries = -1
    let lastPoint = -1
    let lastHtml = ''

    return function (this: Point) {
        const nodeIndex = this.series.index
        const pointIndex = this.index
        const node = series[nodeIndex]
        const date = dates[pointIndex]
        if (!node || !date) return false
        if (lastSeries === nodeIndex && lastPoint === pointIndex) return lastHtml

        const nearbyDays = []
        let maxValue = 1
        for (let offset = 5; offset >= -5; offset--) {
            const index = pointIndex + offset
            const value = node.data[index] || 0
            if (!dates[index] || value === 0) continue
            maxValue = Math.max(maxValue, value)
            nearbyDays.push({ date: dates[index].short, value, isCurrent: offset === 0 })
        }
        const color = colors[nodeIndex]
        const mutedText = alpha('var(--mantine-color-text)', 0.5)
        const rows = nearbyDays
            .map((day) => {
                const weight = day.isCurrent ? 600 : 400
                return `<div style="display:flex;align-items:center;gap:6px;color:${day.isCurrent ? 'var(--mantine-color-text)' : mutedText}">
                <span style="width:42px;font-size:0.7rem;text-align:right;font-weight:${weight}">${day.date}</span>
                <div style="flex:1;height:6px;background:var(--mantine-color-body);border-radius:3px;overflow:hidden"><div style="width:${Math.max((day.value / maxValue) * 100, 2)}%;height:100%;background:${day.isCurrent ? color.active : color.muted};border-radius:3px"></div></div>
                <span style="width:50px;font-size:0.7rem;font-weight:${weight}">${prettifyBytesUtil(day.value, true)}</span>
            </div>`
            })
            .join('')
        lastHtml = `<div style="font-size:0.875rem;padding:4px;min-width:220px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><span style="font-weight:600">${date.full}</span><span style="font-size:0.85rem;color:var(--mantine-color-dimmed);display:flex;align-items:center;gap:4px">Σ ${prettifyBytesUtil(totals[pointIndex], true)}</span></div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="width:10px;height:10px;background:${color.active};border-radius:50%;flex-shrink:0"></div><span style="flex:1">${labels[nodeIndex]}</span><span style="font-weight:600">${prettifyBytesUtil(node.data[pointIndex] || 0, true)}</span></div>
            <div style="display:flex;flex-direction:column;gap:3px;padding-top:8px;border-top:1px solid var(--mantine-color-gray-4)">${rows}</div>
            <div style="color:var(--mantine-color-dimmed);font-size:0.7rem;text-align:center;margin-top:10px">${hint}</div>
        </div>`
        lastSeries = nodeIndex
        lastPoint = pointIndex
        return lastHtml
    }
}
