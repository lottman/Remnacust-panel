import { notifications } from '@mantine/notifications'
import { isAxiosError } from 'axios'
import i18n from 'i18next'

import { isExpectedPanelUpdateError } from '@shared/utils/panel-maintenance'

import { ApiResponseError } from '../api-response'
import { getSafeRequestErrorMessage, RequestError } from '../helpers/handler-request-error'

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

    notifications.show({
        id:
            error instanceof ApiResponseError && error.code === 'INVALID_API_RESPONSE'
                ? 'api-response-unavailable'
                : operationId,
        title: i18n.t('common.message.error'),
        message: getSafeRequestErrorMessage(error),
        color: 'red'
    })
}
