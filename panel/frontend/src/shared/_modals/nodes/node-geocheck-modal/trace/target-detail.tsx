import type { IGeocheckTarget } from './trace.types'

import { Badge, Group, Stack, Text } from '@mantine/core'
import { useMemo } from 'react'

import { useUiText } from '@shared/i18n/interface-text'

import { HopSegments } from './hop-segments'
import { TraceLink } from './trace-link'
import { TraceStat } from './trace-stat'
import { isTimedOutHop, resolveVerdictColor } from './trace.types'

const EXCESS_WARN_MS = 20

const formatMs = (value: number): string => (value >= 100 ? value.toFixed(0) : value.toFixed(2))

const formatLoss = (loss: number): string => `${Math.round(loss * 100)}%`

interface IProps {
    target: IGeocheckTarget
}

export const TargetDetail = (props: IProps) => {
    const uiText = useUiText()

    const { target } = props

    const scale = useMemo(() => {
        const responsive = target.hops.filter((hop) => !isTimedOutHop(hop))

        return Math.max(...responsive.map((hop) => hop.avg_ms), target.rtt_ms, 1)
    }, [target])

    const address = target.resolved ?? target.host

    return (
        <Stack gap="sm">
            <Stack gap={6}>
                <Group gap="xs" wrap="nowrap">
                    <Text fw={600} size="sm" truncate>
                        {target.name}
                    </Text>
                    <Badge color={resolveVerdictColor(target.verdict)} size="sm" variant="soft">
                        {target.verdict}
                    </Badge>
                    {target.anycast && (
                        <Badge color="grape" size="sm" variant="soft">
                            {uiText('anycast-11c3776')}
                        </Badge>
                    )}
                    {target.method && (
                        <Badge color="gray" size="sm" variant="default">
                            {target.method}
                        </Badge>
                    )}
                </Group>

                <Text c="dimmed" ff="monospace" size="xs" truncate>
                    <TraceLink kind="ip" value={address}>
                        {address}
                    </TraceLink>
                    {target.dest_asn && (
                        <>
                            {' · '}
                            <TraceLink kind="as" value={target.dest_asn}>
                                AS{target.dest_asn} {target.dest_as_name ?? ''}
                            </TraceLink>
                        </>
                    )}
                </Text>
            </Stack>

            <Group gap="xl" wrap="wrap">
                <TraceStat label="rtt" value={`${formatMs(target.rtt_ms)} ms`} />
                <TraceStat
                    color={target.excess_ms > EXCESS_WARN_MS ? 'orange' : undefined}
                    label={uiText('excess-ddd36ae')}
                    value={`+${formatMs(target.excess_ms)} ms`}
                />
                <TraceStat
                    label={uiText('jitter-16c7dc7')}
                    value={`${formatMs(target.jitter_ms)} ms`}
                />
                <TraceStat
                    color={target.loss > 0 ? 'yellow' : undefined}
                    label={uiText('loss-2ea71c1')}
                    value={formatLoss(target.loss)}
                />
                <TraceStat label={uiText('score-a575b79')} value={String(target.score)} />
                <TraceStat label={uiText('hops-98e0377')} value={String(target.hops.length)} />
            </Group>

            <HopSegments hops={target.hops} scale={scale} />

            {target.notes && target.notes.length > 0 && (
                <Stack gap={4}>
                    {target.notes.map((note) => (
                        <Text c="dimmed" key={note} size="11px">
                            — {note}
                        </Text>
                    ))}
                </Stack>
            )}
        </Stack>
    )
}
