import { isAxiosError } from 'axios'
import { consola } from 'consola/browser'
import i18n from 'i18next'
import { ZodError } from 'zod'

/** Handle request errors */
export function handleRequestError(error: unknown): never {
    if (isAxiosError(error)) {
        const errorData = error.response?.data
        const status = error.response?.status
        const templateNameConflict =
            (status === 400 || status === 409) && errorData?.errorCode === 'A176'
        const configValidation = status === 422 && errorData?.errorCode === 'A061' && typeof errorData.message === 'string'
        const protocolMissing = configValidation
            ? errorData.message.match(/^Inbound "(.+)": field "protocol" is required\.$/)
            : null
        const message = templateNameConflict
            ? i18n.t('requestErrors.templateNameExists')
            : configValidation
              ? protocolMissing
                  ? i18n.t('requestErrors.protocolRequired', { tag: protocolMissing[1] })
                  : i18n.t('requestErrors.configValidation', { reason: errorData.message.slice(0, 1500) })
              : status === 401
              ? i18n.t('requestErrors.unauthorized')
              : status === 403
                ? i18n.t('requestErrors.forbidden')
                : status === 503
                  ? i18n.t('requestErrors.unavailable')
                  : status
                    ? i18n.t('requestErrors.http-status', { status })
                    : i18n.t('requestErrors.unavailable')
        const errorCode =
            typeof errorData?.errorCode === 'string' &&
            /^[A-Z][A-Z0-9_-]{0,31}$/.test(errorData.errorCode)
                ? ` [${errorData.errorCode}]`
                : ''
        const enhancedError = new Error(`${message}${errorCode}`)
        enhancedError.cause = errorData
        throw enhancedError
    }

    if (error instanceof ZodError) {
        consola.error(error.format())
    }

    consola.log(error)

    throw error
}
