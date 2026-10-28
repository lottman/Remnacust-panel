import { Alert, Badge, Button, Group, Progress, ScrollArea, Stack, Text } from '@mantine/core'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PanelUpdateStatus } from '@entities/dashboard/panel-update/panel-update'

export function formatUpdateDuration(seconds: number) {
    const value = Math.max(0, Math.floor(seconds))
    return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60]
        .map((part) => String(part).padStart(2, '0'))
        .join(':')
}

export function PanelUpdateProgress({
    status,
    failed,
    reachable,
    receivedAt
}: {
    status?: PanelUpdateStatus
    failed: boolean
    reachable: boolean
    receivedAt: number
}) {
    const { t, i18n } = useTranslation()
    const [now, setNow] = useState(receivedAt)
    useEffect(() => {
        if (failed) return
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [failed])
    const progress = status?.progress
    const journalRef = useRef<HTMLDivElement>(null)
    const followJournal = useRef(true)
    const journalJob = useRef(status?.jobId)
    const eventsKey = JSON.stringify(progress?.events ?? [])
    useLayoutEffect(() => {
        if (journalJob.current !== status?.jobId) {
            journalJob.current = status?.jobId
            followJournal.current = true
        }
        const viewport = journalRef.current
        if (viewport && followJournal.current) viewport.scrollTop = viewport.scrollHeight
    }, [eventsKey, status?.jobId])
    const extra = !failed && status?.active ? Math.max(0, (now - receivedAt) / 1000) : 0
    const estimated = progress?.estimatedRemainingSeconds
    const remaining = estimated == null ? null : Math.max(0, estimated - extra)
    const download = () => {
        const file = new Blob(
            [
                JSON.stringify(
                    {
                        jobId: status?.jobId,
                        targetVersion: status?.targetVersion,
                        phase: status?.phase,
                        error: status?.error,
                        progress
                    },
                    null,
                    2
                )
            ],
            { type: 'application/json' }
        )
        const url = URL.createObjectURL(file)
        const link = document.createElement('a')
        link.href = url
        link.download = `panel-update-${status?.jobId ?? 'pending'}.json`
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    return (
        <Stack gap="md">
            <Text size="sm" role="status" aria-live="polite">
                {failed
                    ? t(
                          status?.error === 'RELEASE_NOT_READY'
                              ? 'panelUpdate.releaseNotReady'
                              : 'panelUpdate.failureHint'
                      )
                    : progress
                      ? t(`panelUpdate.stages.${progress.stage}`)
                      : t('panelUpdate.checking')}
            </Text>
            {!reachable && !failed && <Alert color="blue">{t('panelUpdate.reconnecting')}</Alert>}
            {progress ? (
                <>
                    <Group justify="space-between">
                        <Text size="sm">
                            {t('panelUpdate.stageCount', {
                                current: progress.stageIndex,
                                total: progress.stageCount
                            })}
                        </Text>
                        <Badge color={failed ? 'red' : 'teal'} variant="light">
                            {progress.percent}%
                        </Badge>
                    </Group>
                    <Progress
                        value={progress.percent}
                        color={failed ? 'red' : 'teal'}
                        aria-label={t('panelUpdate.running')}
                    />
                    <Group justify="space-between" gap="xs">
                        <Text size="xs" c="dimmed">
                            {t('panelUpdate.elapsed', {
                                time: formatUpdateDuration(progress.elapsedSeconds + extra)
                            })}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {!failed && reachable && remaining !== null && remaining > 0
                                ? t('panelUpdate.estimated', {
                                      time: formatUpdateDuration(remaining)
                                  })
                                : t('panelUpdate.remainingStages', {
                                      count: Math.max(0, progress.stageCount - progress.stageIndex)
                                  })}
                        </Text>
                    </Group>
                    {!failed && estimated === null && (
                        <Text size="xs" c="dimmed">
                            {t('panelUpdate.estimateHint')}
                        </Text>
                    )}
                    <Group justify="space-between" align="center">
                        <Text fw={600} size="sm">
                            {t('panelUpdate.journal')}
                        </Text>
                        <Button variant="subtle" size="compact-xs" onClick={download}>
                            {t('panelUpdate.downloadJournal')}
                        </Button>
                    </Group>
                    <ScrollArea.Autosize
                        mah={220}
                        type="auto"
                        offsetScrollbars
                        viewportRef={journalRef}
                        onScrollPositionChange={({ y }) => {
                            const viewport = journalRef.current
                            if (viewport)
                                followJournal.current =
                                    viewport.scrollHeight - viewport.clientHeight - y < 32
                        }}
                    >
                        <Stack gap="xs">
                            {progress.events.map((event, index) => (
                                <Group
                                    key={`${event.at}-${index}`}
                                    wrap="nowrap"
                                    gap="xs"
                                    align="flex-start"
                                >
                                    <Text
                                        component="time"
                                        dateTime={new Date(event.at * 1000).toISOString()}
                                        c="dimmed"
                                        size="xs"
                                        style={{ flexShrink: 0 }}
                                    >
                                        {new Date(event.at * 1000).toLocaleTimeString(
                                            i18n.language
                                        )}
                                    </Text>
                                    <Text
                                        size="xs"
                                        c={event.event === 'failed' ? 'red' : undefined}
                                        style={{ overflowWrap: 'anywhere' }}
                                    >
                                        {event.label} — {t(`panelUpdate.events.${event.event}`)}
                                    </Text>
                                </Group>
                            ))}
                        </Stack>
                    </ScrollArea.Autosize>
                    <Text size="xs" c="dimmed">
                        {t('panelUpdate.journalHint')}
                    </Text>
                </>
            ) : (
                <Text size="sm" c="dimmed">
                    {t('panelUpdate.wait')}
                </Text>
            )}
        </Stack>
    )
}
