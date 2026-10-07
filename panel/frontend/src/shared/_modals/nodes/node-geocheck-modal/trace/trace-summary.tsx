import type { IGeocheckConnectivity } from './trace.types'

import { Badge, Box, Group } from '@mantine/core'
import { TbRoute } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'

import { TraceStat } from './trace-stat'
import classes from './Trace.module.css'
import { resolveVerdictColor } from './trace.types'

const formatMs = (value: number): string => (value >= 100 ? value.toFixed(0) : value.toFixed(2))

interface IProps {
    connectivity: IGeocheckConnectivity
}

export const TraceSummary = (props: IProps) => {
    const uiText = useUiText()

    const { connectivity } = props

    return (
        <Box className={classes.summary}>
            <Group gap="xs" wrap="nowrap">
                <TbRoute color="var(--mantine-color-cyan-4)" size={18} />
                <TraceStat
                    label={uiText('score-a575b79')}
                    value={String(connectivity.score ?? '—')}
                />
            </Group>

            {connectivity.latency_floor_ms !== undefined && (
                <TraceStat
                    label={uiText('floor-a3e1f49')}
                    value={`${formatMs(connectivity.latency_floor_ms)} ms`}
                />
            )}

            <Group gap={6} wrap="wrap">
                {Object.entries(connectivity.breakdown ?? {})
                    .filter(([, count]) => count > 0)
                    .map(([verdict, count]) => (
                        <Badge
                            color={resolveVerdictColor(verdict)}
                            key={verdict}
                            size="sm"
                            variant="soft"
                        >
                            {verdict} {count}
                        </Badge>
                    ))}
            </Group>

            {connectivity.icmp_available === false && (
                <Badge color="red" size="sm" variant="soft">
                    {uiText('no-icmp-4fd6266')}
                </Badge>
            )}
        </Box>
    )
}
