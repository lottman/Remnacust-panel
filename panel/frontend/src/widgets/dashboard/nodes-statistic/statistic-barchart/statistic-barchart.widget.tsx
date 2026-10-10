import type { Options } from 'highcharts'

import { Chart } from '@highcharts/react'
/* eslint-disable @stylistic/indent */
import {
    alpha,
    Box,
    Card,
    Center,
    Group,
    ScrollArea,
    Skeleton,
    Stack,
    Table,
    Text
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { GetStatsNodesUsageCommand } from '@remnawave/backend-contract'
import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PiEmpty } from 'react-icons/pi'
import { TbChartBar } from 'react-icons/tb'

import { usePanelReducedMotion } from '@shared/ui/appearance/appearance'
import { CountryFlag } from '@shared/ui/get-country-flag'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { prettifyBytesUtil } from '@shared/utils/bytes'
import { formatTimeUtil } from '@shared/utils/time-utils'

import { createNodesTooltipFormatter } from './statistic-tooltip'
import classes from './statistic-barchart.module.css'

interface IProps {
    categories: string[] | undefined
    isLoading: boolean
    series: GetStatsNodesUsageCommand.Response['response']['series'] | undefined
}

const EMPTY_CATEGORIES: string[] = []
const EMPTY_SERIES: NonNullable<IProps['series']> = []

export const NodesStatisticBarchartWidget = memo((props: IProps) => {
    const { categories = EMPTY_CATEGORIES, series = EMPTY_SERIES, isLoading } = props

    const { t, i18n } = useTranslation()
    const reducedMotion = usePanelReducedMotion()

    const handleBarClick = useCallback(
        (category: string, pointIndex: number) => {
            if (!category) return

            const allDayData = series
                .map((s) => ({
                    color: s.color,
                    name: s.name,
                    value: s.data[pointIndex] || 0,
                    countryCode: s.countryCode
                }))
                .filter((item) => item.value > 0)
                .sort((a, b) => b.value - a.value)

            const totalDayTraffic = allDayData.reduce((sum, item) => sum + item.value, 0)

            if (allDayData.length === 0) return

            modals.open({
                centered: true,
                size: '600px',
                title: (
                    <BaseOverlayHeader
                        iconColor="teal"
                        IconComponent={TbChartBar}
                        iconVariant="soft"
                        subtitle={t('statistic-nodes.component.total-traffic-placeholder', {
                            totalTraffic: prettifyBytesUtil(totalDayTraffic)
                        })}
                        title={formatTimeUtil({
                            time: category,
                            template: 'FULL_DATE',
                            language: i18n.language
                        })}
                    />
                ),
                children: (
                    <Stack>
                        <ScrollArea h={400} offsetScrollbars type="always">
                            <Table highlightOnHover striped withTableBorder>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>{t('statistic-nodes.component.node')}</Table.Th>
                                        <Table.Th style={{ textAlign: 'right' }}>
                                            {t('statistic-nodes.component.traffic')}
                                        </Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {allDayData.map((entry) => (
                                        <Table.Tr key={entry.name}>
                                            <Table.Td>
                                                <Group gap={8}>
                                                    <Box
                                                        h={12}
                                                        style={{
                                                            background: entry.color,
                                                            borderRadius: '50%',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                        }}
                                                        w={12}
                                                    />
                                                    <Group gap={6}>
                                                        <CountryFlag
                                                            countryCode={entry.countryCode}
                                                        />
                                                        <Text>{entry.name}</Text>
                                                    </Group>
                                                </Group>
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Text fw={500}>
                                                    {prettifyBytesUtil(entry.value)}
                                                </Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>
                    </Stack>
                )
            })
        },
        [series, t, i18n.language]
    )

    const tooltipFormatter = useMemo(
        () =>
            createNodesTooltipFormatter(
                categories,
                series,
                i18n.language,
                t('common.message.click-to-see-all')
            ),
        [categories, series, t, i18n.language]
    )

    const options = useMemo<Options>(
        () => ({
            chart: {
                type: 'bar',
                animation: reducedMotion ? false : { duration: 250 },
                height: '60%',
                backgroundColor: 'transparent',
                style: { fontFamily: 'inherit' }
            },
            accessibility: { enabled: false },
            plotOptions: {
                bar: {
                    stacking: 'normal',
                    borderRadius: 0,
                    cursor: 'pointer'
                },
                series: {
                    animation: reducedMotion ? false : { duration: 600 },
                    states: {
                        normal: { animation: false },
                        hover: { enabled: true, brightness: 0.1, animation: false },
                        inactive: { enabled: false, animation: false }
                    },
                    stickyTracking: false
                }
            },
            legend: {
                enabled: true,
                layout: 'horizontal',
                align: 'center',
                verticalAlign: 'bottom',
                backgroundColor: 'var(--mantine-color-body)',
                borderWidth: 2,
                padding: 20,
                borderRadius: 14,
                borderColor: 'var(--mantine-color-gray-7)',
                itemMarginTop: 4,
                itemMarginBottom: 4,
                itemStyle: {
                    color: 'var(--mantine-color-text)',
                    fontSize: '14px',
                    fontWeight: '400'
                },
                itemHoverStyle: {
                    color: 'var(--mantine-color-text)',
                    fontWeight: '600',
                    textDecoration: 'underline'
                },
                itemHiddenStyle: {
                    color: 'var(--mantine-color-dimmed)'
                },
                symbolRadius: 2,
                symbolHeight: 10,
                symbolWidth: 10,
                navigation: {
                    enabled: true,
                    activeColor: 'var(--mantine-color-primary-filled)',
                    inactiveColor: 'var(--mantine-color-dimmed)',
                    style: {
                        fontWeight: '500',
                        color: 'var(--mantine-color-text)',
                        fontSize: '12px'
                    }
                }
            },
            credits: { enabled: false },
            exporting: { enabled: false },
            responsive: {
                rules: [
                    {
                        condition: { maxWidth: 600 },
                        chartOptions: {
                            chart: {
                                height: Math.max(460, Math.min(720, categories.length * 24 + 220))
                            },
                            legend: { maxHeight: 140, padding: 12, itemStyle: { fontSize: '12px' } }
                        }
                    }
                ]
            },
            xAxis: {
                reversed: false,
                reversedStacks: true,
                categories,
                crosshair: true,
                labels: {
                    style: { color: 'var(--mantine-color-text)' },
                    formatter: ({ value }) =>
                        formatTimeUtil({
                            time: value,
                            template: 'SHORT_DATE',
                            language: i18n.language
                        })
                },
                gridLineColor: 'var(--mantine-color-gray-light-hover)',
                gridLineWidth: 1,
                gridLineDashStyle: 'LongDash'
            },
            yAxis: {
                title: undefined,
                reversedStacks: false,
                labels: {
                    autoRotation: [-45, 45],
                    style: { color: 'var(--mantine-color-text)' },
                    formatter: ({ value }) => prettifyBytesUtil(value, true)
                },
                gridLineColor: undefined
            },
            tooltip: {
                animation: reducedMotion ? false : { duration: 150 },
                shared: false,
                backgroundColor: 'var(--mantine-color-body)',
                borderColor: 'var(--mantine-color-gray-4)',
                style: { color: 'var(--mantine-color-text)' },
                useHTML: true,
                formatter: tooltipFormatter
            },
            series: series.map((s) => {
                return {
                    type: 'bar',
                    name: s.name,
                    data: s.data,
                    color: alpha(s.color, 0.5),
                    borderWidth: 1,
                    borderColor: s.color,
                    point: {
                        events: {
                            click: (event) => {
                                handleBarClick(event.point.category as string, event.point.index)
                            }
                        }
                    }
                }
            })
        }),
        [categories, series, handleBarClick, tooltipFormatter, i18n.language, reducedMotion]
    )

    if (isLoading) {
        return <Skeleton height={500} />
    }

    if (categories.length === 0 || series.length === 0) {
        return (
            <Card mih={600} p="xs" withBorder>
                <Center h={600}>
                    <Stack align="center" gap={8}>
                        <PiEmpty size="2rem" />
                        <Text c="dimmed">
                            {t('common.message.no-data-available-for-the-selected-period')}
                        </Text>
                    </Stack>
                </Center>
            </Card>
        )
    }

    return (
        <Card className={reducedMotion ? undefined : classes.chart} p="xs" withBorder>
            <Chart title="" options={options} />
        </Card>
    )
})
