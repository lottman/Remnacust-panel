import type { QuotaSynchronization } from './limits.api'

import { Alert, Progress, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'

export function QuotaSynchronizationStatus({ progress }: { progress: QuotaSynchronization }) {
    const { t } = useTranslation()
    const pending = progress.totalNodes - progress.appliedNodes
    const more = pending - progress.pendingNodes.length
    const color = pending === 0 ? 'teal' : 'blue'
    return (
        <Alert
            color={color}
            title={t('quotaSync.title')}
            role="region"
            aria-label={t('quotaSync.title')}
        >
            <Stack gap="xs">
                <Text size="sm" aria-live="polite" aria-atomic="true">
                    {t('quotaSync.progress', {
                        applied: progress.appliedNodes,
                        total: progress.totalNodes
                    })}
                </Text>
                <Progress
                    color={color}
                    value={
                        progress.totalNodes > 0
                            ? Math.round((progress.appliedNodes / progress.totalNodes) * 100)
                            : 0
                    }
                    aria-label={t('quotaSync.progress', {
                        applied: progress.appliedNodes,
                        total: progress.totalNodes
                    })}
                />
                {progress.pendingNodes.length > 0 && (
                    <details>
                        <Text component="summary" size="sm" style={{ cursor: 'pointer' }}>
                            {t('quotaSync.waiting')} {pending}
                        </Text>
                        <div
                            tabIndex={0}
                            role="region"
                            aria-label={t('quotaSync.waiting')}
                            style={{ maxHeight: 180, overflowY: 'auto', overflowWrap: 'anywhere' }}
                        >
                            <ul style={{ marginBlock: 8, paddingInlineStart: 20 }}>
                                {progress.pendingNodes.map((node) => (
                                    <li key={node.uuid}>
                                        <Text size="sm">{node.name}</Text>
                                    </li>
                                ))}
                            </ul>
                            {more > 0 && (
                                <Text size="sm">{t('quotaSync.more', { count: more })}</Text>
                            )}
                        </div>
                    </details>
                )}
                {progress.unavailableNodes > 0 && <Text size="sm">{t('quotaSync.offline')}</Text>}
            </Stack>
        </Alert>
    )
}
