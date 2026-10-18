import { notifications } from '@mantine/notifications'
import { isAxiosError } from 'axios'
import i18n from 'i18next'
import { ZodError } from 'zod'

import { isExpectedPanelUpdateError } from '@shared/utils/panel-maintenance'

import { ApiResponseError } from '../api-response'
import { getRequestErrorMessage, RequestError } from '../helpers/handler-request-error'

const BYPASS_ERROR_STATUSES = [401]

export function errorHandler(error: unknown, operationId: string) {
    if (isExpectedPanelUpdateError(error)) return
    const status = isAxiosError(error)
        ? error.response?.status
        : error instanceof RequestError
          ? error.status
          : undefined
    if (status && BYPASS_ERROR_STATUSES.includes(status)) {
        return
    }

    const message =
        error instanceof ZodError || error instanceof ApiResponseError
            ? i18n.t('requestErrors.invalidResponse')
            : isAxiosError(error)
              ? getRequestErrorMessage(error)
              : error instanceof RequestError
                ? error.message
                : i18n.t('requestErrors.unknown')

    notifications.show({
        id: error instanceof ApiResponseError ? 'api-response-unavailable' : operationId,
        title: i18n.t('common.message.error'),
        message,
        color: 'red'
    })
}
