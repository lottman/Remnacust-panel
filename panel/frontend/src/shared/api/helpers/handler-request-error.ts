import { ERRORS } from '@remnawave/backend-contract'
import { AxiosError, isAxiosError } from 'axios'
import { consola } from 'consola/browser'
import i18n from 'i18next'
import { ZodError } from 'zod'

const errorCatalog = new Map<string, { message: string; httpCode: number }>(
    Object.values(ERRORS).map((entry) => [entry.code, entry])
)

/** Only public contract messages enter the UI; arbitrary server bodies can contain secrets. */
export function getRequestErrorMessage(error: AxiosError): string {
    const errorData = error.response?.data
    const status = error.response?.status
    const data =
        errorData !== null && typeof errorData === 'object'
            ? (errorData as Record<string, unknown>)
            : undefined
    const code =
        typeof data?.errorCode === 'string' && /^[A-Z][A-Z0-9_-]{0,31}$/.test(data.errorCode)
            ? data.errorCode
            : undefined
    const entry = code ? errorCatalog.get(code) : undefined
    const templateNameConflict = (status === 400 || status === 409) && code === 'A176'
    const configValidation = status === 422 && code === 'A061' && typeof data?.message === 'string'
    const protocolMissing = configValidation
        ? (data.message as string).match(/^Inbound "(.+)": field "protocol" is required\.$/)
        : null
    const message = templateNameConflict
        ? i18n.t('requestErrors.templateNameExists')
        : configValidation
          ? protocolMissing
              ? i18n.t('requestErrors.protocolRequired', { tag: protocolMissing[1] })
              : i18n.t('requestErrors.configValidation', {
                    reason: (data.message as string).slice(0, 1500)
                })
          : status === 401
            ? i18n.t('requestErrors.unauthorized')
            : status === 403
              ? i18n.t('requestErrors.forbidden')
              : entry && entry.httpCode === status
                ? i18n.t(`requestErrors.codes.${code}`, { defaultValue: entry.message })
                : status === 503
                  ? i18n.t('requestErrors.unavailable')
                  : status === 404
                    ? i18n.t('requestErrors.notFound')
                    : status === 409
                      ? i18n.t('requestErrors.conflict')
                      : status === 400 || status === 422
                        ? i18n.t('requestErrors.invalidRequest')
                        : status === 429
                          ? i18n.t('requestErrors.rateLimited')
                          : status && status >= 500
                            ? i18n.t('requestErrors.serverError')
                            : status
                              ? i18n.t('requestErrors.http-status', { status })
                              : i18n.t('requestErrors.unavailable')
    return `${message}${code ? ` [${code}]` : ''}`
}

export class RequestError extends Error {
    readonly code: string | undefined
    readonly status: number | undefined
    readonly errorCode: string | undefined

    constructor(error: AxiosError) {
        super(getRequestErrorMessage(error), { cause: error.response?.data })
        this.name = 'RequestError'
        this.code = error.code
        this.status = error.response?.status
        const data: unknown = error.response?.data
        this.errorCode =
            data !== null &&
            typeof data === 'object' &&
            'errorCode' in data &&
            typeof data.errorCode === 'string'
                ? data.errorCode
                : undefined
    }
}

/** Handle request errors */
export function handleRequestError(error: unknown): never {
    if (isAxiosError(error)) {
        throw new RequestError(error)
    }

    if (error instanceof ZodError) {
        throw new Error(i18n.t('requestErrors.invalidResponse'), { cause: error })
    }

    consola.log(error)

    throw error
}
