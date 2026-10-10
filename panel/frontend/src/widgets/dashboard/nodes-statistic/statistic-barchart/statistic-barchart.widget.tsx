/* eslint-disable @stylistic/indent */
import { Box, Card, Center, Group, ScrollArea, Skeleton, Stack, Table, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { GetStatsNodesUsageCommand } from '@remnawave/backend-contract'
import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { PiEmpty } from 'react-icons/pi'
import { TbChartBar } from 'react-icons/tb'

import { CountryFlag } from '@shared/ui/get-country-flag'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { prettifyBytesUtil } from '@shared/utils/bytes'
import { formatTimeUtil } from '@shared/utils/time-utils'

import { NodesUsageChart } from './nodes-usage-chart'
import { usageValue } from './nodes-usage-layout'

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

    const handleBarClick = useCallback(
        (category: string, pointIndex: number) => {
            if (!category) return

            const allDayData = series
                .map((s, index) => ({
                    key: index,
                    color: s.color,
                    name: s.name,
                    value: usageValue(s.data[pointIndex]),
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
                                        <Table.Tr key={entry.key}>
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

    if (isLoading) {
        return <Skeleton height={500} />
    }

    if (categories.length === 0 || series.length === 0) {
        return (
            <Card p="xs" withBorder>
                <Center h={240}>
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
        <Card p="xs" withBorder>
            <NodesUsageChart
                categories={categories}
                series={series}
                onDayClick={(day) => handleBarClick(categories[day], day)}
            />
        </Card>
    )
})
