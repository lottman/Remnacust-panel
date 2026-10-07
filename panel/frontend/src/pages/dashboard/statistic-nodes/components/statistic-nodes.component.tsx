import { Select, SimpleGrid, Stack } from '@mantine/core'
import { DatePickerInput, DatesRangeValue } from '@mantine/dates'
import { NodesStatisticBarchartWidget } from '@widgets/dashboard/nodes-statistic/statistic-barchart'
import { NodesStatisticSparklineCardWidget } from '@widgets/dashboard/nodes-statistic/statistic-sparkline-card'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HiChartPie } from 'react-icons/hi'
import { TbCalendar, TbRefresh, TbServer2 } from 'react-icons/tb'

import { useGetStatsNodesUsage } from '@shared/api/hooks'
import { translateUiText as uiText } from '@shared/i18n/interface-text'
import { Page, PageHeaderShared } from '@shared/ui'
import { CountryFlag } from '@shared/ui/get-country-flag'
import { TopLeaderboardCardShared } from '@shared/ui/leaderboard-item-card'
import { RefreshActionIcon } from '@shared/ui/refresh-control'
import { getDefaultDateRange } from '@shared/utils/time-utils'

const TOP_NODES_LIMIT_OPTIONS = [
    {
        value: '5',
        get label() {
            return uiText('top-5-d9c3778')
        }
    },
    {
        value: '10',
        get label() {
            return uiText('top-10-18b38ae')
        }
    },
    {
        value: '20',
        get label() {
            return uiText('top-20-f80bebb')
        }
    },
    {
        value: '30',
        get label() {
            return uiText('top-30-c192e33')
        }
    },
    {
        value: '40',
        get label() {
            return uiText('top-40-17bbae2')
        }
    },
    {
        value: '50',
        get label() {
            return uiText('top-50-50ea9e3')
        }
    },
    {
        value: '60',
        get label() {
            return uiText('top-60-bba98b8')
        }
    },
    {
        value: '70',
        get label() {
            return uiText('top-70-23e7e5d')
        }
    },
    {
        value: '80',
        get label() {
            return uiText('top-80-170d26f')
        }
    },
    {
        value: '90',
        get label() {
            return uiText('top-90-c5c5619')
        }
    },
    {
        value: '100',
        get label() {
            return uiText('top-100-4e67739')
        }
    }
]

const DEFAULT_TOP_NODES_LIMIT = 20

export const StatisticNodesPage = () => {
    const { t, i18n } = useTranslation()
    const defaultRange = getDefaultDateRange()

    const [rawRange, setRawRange] = useState<[null | string, null | string]>([
        defaultRange.start,
        defaultRange.end
    ])

    const [topNodesLimit, setTopNodesLimit] = useState<number>(DEFAULT_TOP_NODES_LIMIT)
    const [queryRange, setQueryRange] = useState<{ end: string; start: string }>(defaultRange)

    const {
        data: nodesStats,
        isLoading,
        refetch,
        isRefetching
    } = useGetStatsNodesUsage({
        query: {
            start: queryRange.start,
            end: queryRange.end,
            topNodesLimit
        },
        rQueryParams: {
            enabled: Boolean(queryRange.start && queryRange.end)
        }
    })

    const handleDateRangeChange = (value: DatesRangeValue<string>) => {
        if (value[0] === null && value[1] === null) {
            setRawRange([defaultRange.start, defaultRange.end])
            setQueryRange(defaultRange)
            return
        }

        setRawRange(value)
        if (!value[0] || !value[1]) return

        const startDate = value[0]
        const endDate = value[1]

        if (!dayjs(startDate).isValid() || !dayjs(endDate).isValid()) return

        const startISO = dayjs(startDate).format('YYYY-MM-DD')
        const endISO = dayjs(endDate).format('YYYY-MM-DD')

        setQueryRange({ start: startISO, end: endISO })
    }

    return (
        <Page title={t('constants.nodes-statistics')}>
            <PageHeaderShared
                actions={
                    <>
                        <Select
                            allowDeselect={false}
                            data={TOP_NODES_LIMIT_OPTIONS}
                            leftSection={<TbServer2 size="20px" />}
                            onChange={(value) => setTopNodesLimit(Number(value))}
                            size="md"
                            value={String(topNodesLimit)}
                            w={150}
                        />
                        <DatePickerInput
                            allowSingleDateInRange
                            dropdownType="modal"
                            headerControlsOrder={['previous', 'next', 'level']}
                            leftSection={<TbCalendar size="24px" />}
                            locale={i18n.language}
                            maxDate={new Date()}
                            onChange={handleDateRangeChange}
                            presets={[
                                {
                                    label: t('statistic-nodes.component.current-month'),
                                    value: [
                                        dayjs().startOf('month').format('YYYY-MM-DD'),
                                        dayjs().format('YYYY-MM-DD')
                                    ]
                                },
                                {
                                    label: t('statistic-nodes.component.3-days'),
                                    value: [
                                        dayjs().subtract(2, 'day').format('YYYY-MM-DD'),
                                        dayjs().format('YYYY-MM-DD')
                                    ]
                                },
                                {
                                    label: t('statistic-nodes.component.7-days'),
                                    value: [
                                        dayjs().subtract(6, 'day').format('YYYY-MM-DD'),
                                        dayjs().format('YYYY-MM-DD')
                                    ]
                                },
                                {
                                    label: t('statistic-nodes.component.14-days'),
                                    value: [
                                        dayjs().subtract(13, 'day').format('YYYY-MM-DD'),
                                        dayjs().format('YYYY-MM-DD')
                                    ]
                                },
                                {
                                    label: t('statistic-nodes.component.30-days'),
                                    value: [
                                        dayjs().subtract(29, 'day').format('YYYY-MM-DD'),
                                        dayjs().format('YYYY-MM-DD')
                                    ]
                                },
                                {
                                    label: t('statistic-nodes.component.60-days'),
                                    value: [
                                        dayjs().subtract(59, 'day').format('YYYY-MM-DD'),
                                        dayjs().format('YYYY-MM-DD')
                                    ]
                                },
                                {
                                    label: t('statistic-nodes.component.90-days'),
                                    value: [
                                        dayjs().subtract(89, 'day').format('YYYY-MM-DD'),
                                        dayjs().format('YYYY-MM-DD')
                                    ]
                                },
                                {
                                    label: t('statistic-nodes.component.180-days'),
                                    value: [
                                        dayjs().subtract(179, 'day').format('YYYY-MM-DD'),
                                        dayjs().format('YYYY-MM-DD')
                                    ]
                                }
                            ]}
                            size="md"
                            styles={{
                                calendarHeaderLevel: {
                                    justifyContent: 'flex-end'
                                },
                                presetsList: {
                                    justifyContent: 'center'
                                }
                            }}
                            type="range"
                            value={rawRange}
                            valueFormat="DD MMM, YYYY"
                        />

                        <RefreshActionIcon
                            loading={isRefetching}
                            onClick={() => refetch()}
                            size="input-md"
                            variant="soft"
                        >
                            <TbRefresh size="24px" />
                        </RefreshActionIcon>
                    </>
                }
                icon={<HiChartPie size={24} />}
                title={t('constants.nodes-statistics')}
                wrapActions
            />

            <Stack gap="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <NodesStatisticSparklineCardWidget
                        isLoading={isLoading}
                        sparklineData={nodesStats?.sparklineData}
                    />

                    <TopLeaderboardCardShared
                        emptyText={t('common.message.no-data-available')}
                        isLoading={isLoading}
                        items={nodesStats?.topNodes?.map((node) => ({
                            color: node.color,
                            countryCode: node.countryCode,
                            name: node.name,
                            total: node.total
                        }))}
                        maxHeight={230}
                        renderCountryFlag={(item) => <CountryFlag countryCode={item.countryCode} />}
                    />
                </SimpleGrid>

                <NodesStatisticBarchartWidget
                    categories={nodesStats?.categories}
                    isLoading={isLoading}
                    series={nodesStats?.series}
                />
            </Stack>
        </Page>
    )
}
