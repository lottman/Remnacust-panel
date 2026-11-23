import { Alert, Button, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import { getSafeRequestErrorMessage } from '@shared/api/helpers/handler-request-error'

type PageQuery = {
    data: unknown
    error?: unknown
    isError: boolean
    isFetching: boolean
    refetch: () => Promise<unknown>
}

export function hasPageQueryError(queries: readonly PageQuery[]) {
    return queries.some((query) => query.isError && query.data === undefined)
}

export function PageQueryError({ queries }: { queries: readonly PageQuery[] }) {
    const { t } = useTranslation()
    const failedQueries = queries.filter((query) => query.isError && query.data === undefined)
    const messages = new Set(failedQueries.map((query) => getSafeRequestErrorMessage(query.error)))

    return (
        <Stack gap="sm" role="alert">
            {[...messages].map((message) => (
                <Alert key={message} color="red">
                    {message}
                </Alert>
            ))}
            <Button
                loading={failedQueries.some((query) => query.isFetching)}
                onClick={() => void Promise.all(failedQueries.map((query) => query.refetch()))}
                w="fit-content"
            >
                {t('common.action.try-again')}
            </Button>
        </Stack>
    )
}
