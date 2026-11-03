import { Button, Stack, Text } from '@mantine/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api/axios'

type MaintenanceLogProps = {
    jobId?: string | null
    pageId?: string
    disabled?: boolean
    completed?: boolean
}

export function MaintenanceLogDownload(props: MaintenanceLogProps) {
    return (
        <MaintenanceLogJob
            key={`${props.jobId}:${props.pageId}:${Boolean(props.completed)}:${Boolean(props.disabled)}`}
            {...props}
        />
    )
}

function MaintenanceLogJob({
    jobId,
    pageId,
    disabled = false,
    completed = false
}: MaintenanceLogProps) {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(Boolean(completed && jobId && !disabled))
    const [failed, setFailed] = useState(false)
    const [ready, setReady] = useState<{ key: string; url: string } | null>(null)
    const controller = useRef<AbortController | null>(null)
    const objectUrl = useRef<string | null>(null)
    const key = `${jobId ?? ''}:${pageId ?? ''}`
    const filename = pageId ? `page-${pageId}-${jobId}.log` : `panel-update-${jobId}.log`
    const fetchLog = useCallback(
        async (signal: AbortSignal) => {
            const response = await instance.get('/api/system/update/log', {
                params: { jobId, ...(pageId ? { pageId } : {}) },
                responseType: 'blob',
                signal,
                timeout: 20000
            })
            if (
                !(response.data instanceof Blob) ||
                !String(response.headers['content-type']).startsWith('text/plain')
            )
                throw new Error('Invalid maintenance log response')
            if (signal.aborted) return null
            if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
            const url = URL.createObjectURL(response.data)
            objectUrl.current = url
            return url
        },
        [jobId, pageId]
    )
    useEffect(() => {
        const request = new AbortController()
        controller.current = request
        if (completed && jobId && !disabled) {
            void fetchLog(request.signal)
                .then((url) => {
                    if (url && !request.signal.aborted) setReady({ key, url })
                })
                .catch(() => {
                    if (!request.signal.aborted) setFailed(true)
                })
                .finally(() => {
                    if (!request.signal.aborted) setLoading(false)
                })
        }
        return () => {
            controller.current?.abort()
            request.abort()
            if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
            objectUrl.current = null
        }
    }, [completed, disabled, jobId, key, fetchLog])
    const download = async () => {
        if (!jobId || loading || disabled) return
        controller.current?.abort()
        const request = new AbortController()
        controller.current = request
        setLoading(true)
        setFailed(false)
        try {
            const url = await fetchLog(request.signal)
            if (!url || request.signal.aborted) return
            if (completed) setReady({ key, url })
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            link.style.display = 'none'
            const target = document.getElementById('remnacust-panel-update-portal') ?? document.body
            target.appendChild(link)
            link.click()
            link.remove()
        } catch {
            if (!request.signal.aborted) setFailed(true)
        } finally {
            if (!request.signal.aborted) setLoading(false)
        }
    }
    return (
        <Stack gap={4}>
            {ready?.key === key && !disabled ? (
                <Button
                    component="a"
                    href={ready.url}
                    download={filename}
                    variant="subtle"
                    size="compact-xs"
                >
                    {t('panelUpdate.downloadJournal')}
                </Button>
            ) : (
                <Button
                    variant="subtle"
                    size="compact-xs"
                    onClick={download}
                    loading={loading}
                    disabled={disabled || !jobId}
                >
                    {t('panelUpdate.downloadJournal')}
                </Button>
            )}
            {failed && (
                <Text size="xs" c="red" role="alert">
                    {t('panelUpdate.logDownloadFailed')}
                </Text>
            )}
        </Stack>
    )
}
