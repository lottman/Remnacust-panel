import { Alert, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { TbRefresh } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { LoaderModalShared } from '@shared/ui/loader-modal'
import { RefreshButton } from '@shared/ui/refresh-control'

export function HostFormLoading({
    queries
}: {
    queries: readonly {
        isError: boolean
        error: unknown
        refetch: () => Promise<unknown>
    }[]
}) {
    const uiText = useUiText()

    const { t } = useTranslation()
    const failed = queries.filter((query) => query.isError)
    if (!failed.length) return <LoaderModalShared mih="78vh" />
    return (
        <Stack>
            <Alert color="red">{uiText('could-not-load-the-form-data-please-retry-7278c1c')}</Alert>
            <RefreshButton
                leftSection={<TbRefresh size={16} />}
                onClick={() => Promise.allSettled(failed.map((query) => query.refetch()))}
            >
                {t('common.action.refresh')}
            </RefreshButton>
        </Stack>
    )
}
