import { notifications } from '@mantine/notifications'
import { AxiosError } from 'axios'
import i18n from 'i18next'
import { ZodError } from 'zod'

import { ApiResponseError } from '../api-response'

const BYPASS_ERROR_STATUSES = [401]

export function errorHandler(error: unknown, operationId: string) {
    if (error instanceof AxiosError) {
        if (error.response) {
            if (BYPASS_ERROR_STATUSES.includes(error.response.status)) {
                return
            }
        }
    }

    const message =
        error instanceof ZodError || error instanceof ApiResponseError
            ? i18n.t('requestErrors.invalidResponse')
            : error instanceof AxiosError
              ? error.response?.status === 403
                  ? i18n.t('requestErrors.forbidden')
                  : error.response?.status
                    ? i18n.t('requestErrors.http-status', { status: error.response.status })
                    : i18n.t('requestErrors.unavailable')
              : i18n.t('requestErrors.unknown')

    notifications.show({
        id: error instanceof ApiResponseError ? 'api-response-unavailable' : operationId,
        title: i18n.t('common.message.error'),
        message,
        color: 'red'
    })
}
