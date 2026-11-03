import { Button, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api/axios'

export function MaintenanceLogDownload({
    jobId,
    pageId,
    disabled = false
}: {
    jobId?: string | null
    pageId?: string
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)
    const [failed, setFailed] = useState(false)
    const download = async () => {
        if (!jobId || loading) return
        setLoading(true)
        setFailed(false)
        try {
            const response = await instance.get('/api/system/update/log', {
                params: { jobId, ...(pageId ? { pageId } : {}) },
                responseType: 'blob',
                timeout: 20000
            })
            if (
                !(response.data instanceof Blob) ||
                !String(response.headers['content-type']).startsWith('text/plain')
            )
                throw new Error('Invalid maintenance log response')
            const url = URL.createObjectURL(response.data)
            const link = document.createElement('a')
            link.href = url
            link.download = pageId ? `page-${pageId}-${jobId}.log` : `panel-update-${jobId}.log`
            link.click()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch {
            setFailed(true)
        } finally {
            setLoading(false)
        }
    }
    return (
        <Stack gap={4}>
            <Button
                variant="subtle"
                size="compact-xs"
                onClick={download}
                loading={loading}
                disabled={disabled || !jobId}
            >
                {t('panelUpdate.downloadJournal')}
            </Button>
            {failed && (
                <Text size="xs" c="red" role="alert">
                    {t('panelUpdate.logDownloadFailed')}
                </Text>
            )}
        </Stack>
    )
}
