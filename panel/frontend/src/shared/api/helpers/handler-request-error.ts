import { ERRORS } from '@remnawave/backend-contract'
import { AxiosError, isAxiosError } from 'axios'
import { consola } from 'consola/browser'
import i18n from 'i18next'
import { ZodError } from 'zod'

const errorCatalog = new Map(
    Object.values(ERRORS).map((entry) => [`${entry.code}:${entry.httpCode}`, entry.code])
)
const featureErrors = {
    SUBSCRIPTION_DOMAIN_ENV_UNAVAILABLE: {
        status: 503,
        key: 'subscription-domains.environment-save-failed'
    },
    SUBSCRIPTION_DOMAIN_ENV_CHANGED: {
        status: 409,
        key: 'subscription-domains.environment-save-failed'
    },
    SUBSCRIPTION_DOMAIN_CDN_LIMIT: { status: 409, key: 'subscription-domains.cdn-limit' },
    SUBSCRIPTION_DOMAIN_LAST_PRIMARY: { status: 409, key: 'subscription-domains.last-primary' },
    SUBSCRIPTION_DOMAIN_NOT_FOUND: { status: 404, key: 'requestErrors.codes.A903' },
    SUBSCRIPTION_DOMAIN_EXISTS: { status: 409, key: 'requestErrors.features.domainExists' },
    SUBSCRIPTION_DOMAIN_DEFAULT_REQUIRED: {
        status: 409,
        key: 'requestErrors.features.domainDefault'
    },
    SUBSCRIPTION_DOMAIN_IN_USE: { status: 409, key: 'requestErrors.features.domainInUse' },
    SUBSCRIPTION_DOMAIN_LIMIT: { status: 400, key: 'requestErrors.features.domainLimit' },
    SUBSCRIPTION_DOMAIN_PARENT: { status: 400, key: 'requestErrors.features.domainParent' },
    SUBSCRIPTION_DOMAIN_ACCESS_INVALID: { status: 400, key: 'requestErrors.features.domainAccess' },
    SUBSCRIPTION_DOMAIN_KIND_MISMATCH: { status: 400, key: 'requestErrors.features.domainKind' },
    CUSTOM_XRAY_REQUIRED: { status: 409, key: 'requestErrors.features.customCore' },
    XRAY_SETTINGS_CHANGED: { status: 409, key: 'requestErrors.features.coreChanged' },
    DEFAULT_XRAY_BLOCKED: { status: 409, key: 'requestErrors.features.coreBlocked' }
} as const

function configValidationMessage(message: unknown): string {
    if (typeof message !== 'string' || message.length > 2000)
        return i18n.t('requestErrors.codes.A061')
    if (message === 'GEOFILES_REQUIRE_BASE_JSON') return i18n.t('geofiles.requires-json')
    if (message === 'GEOFILES_SYSTEM_DISABLED') return i18n.t('geofiles.system-disabled')
    if (message === 'GEOFILES_PER_TEMPLATE')
        return i18n.t('requestErrors.features.geofilesPerTemplate')
    const exact = {
        'Invalid configuration format.': 'format',
        'Invalid JSON input.': 'json',
        "Config doesn't have inbounds.": 'inbounds',
        "Config doesn't have outbounds.": 'outbounds',
        'Each inbound must be an object.': 'inboundObject',
        'All inbounds must have a unique tag.': 'tagRequired',
        "Character ',' is not allowed in inbound tag.": 'tagComma',
        'The masque transport requires the masque protocol.': 'masqueProtocol',
        'MASQUE requires network masque and TLS security.': 'masqueTls',
        'Shadowsocks settings are required.': 'ssSettings'
    } as const
    if (Object.hasOwn(exact, message))
        return i18n.t(`requestErrors.validation.${exact[message as keyof typeof exact]}`)
    const protocol = /^Inbound "([^"\r\n]{1,160})": field "protocol" is required\.$/.exec(message)
    if (protocol) return i18n.t('requestErrors.protocolRequired', { tag: protocol[1] })
    const duplicate =
        /^Duplicate inbound tag "([^"\r\n]{1,160})" found\. All inbound tags must be unique\.$/.exec(
            message
        )
    if (duplicate) return i18n.t('requestErrors.validation.duplicateTag', { tag: duplicate[1] })
    const field =
        /^Inbound "([^"\r\n]{1,160})": (streamSettings must be an object|network must be a string)\.$/.exec(
            message
        )
    if (field)
        return i18n.t(
            `requestErrors.validation.${field[2].startsWith('network') ? 'networkString' : 'streamObject'}`,
            { tag: field[1] }
        )
    if (
        /^Invalid protocol in inbound "[^"\r\n]{1,160}"\. Allowed values are: [a-z0-9, -]+\.$/.test(
            message
        )
    )
        return i18n.t('requestErrors.validation.protocol')
    if (
        /^Invalid network type "[^"\r\n]{1,80}" in inbound "[^"\r\n]{1,160}"\. Allowed values are: [a-z0-9, -]+\.$/.test(
            message
        )
    )
        return i18n.t('requestErrors.validation.network')
    if (
        /^Unsupported Shadowsocks method "[^"\r\n]{1,80}"\. Allowed methods are: [a-z0-9, -]+\.$/.test(
            message
        )
    )
        return i18n.t('requestErrors.validation.ssMethod')
    if (message.startsWith('Shadowsocks password is required for 2022-blake3-* methods.'))
        return i18n.t('requestErrors.validation.ssPassword')
    if (
        /^Shadowsocks password for "[^"\r\n]{1,80}" must be a base64 string that decodes to exactly (16|32) bytes\./.test(
            message
        )
    )
        return i18n.t('requestErrors.validation.ssKey')
    if (/^Protocol [a-z0-9-]{1,40} is not supported\.$/.test(message))
        return i18n.t('requestErrors.validation.protocol')
    return i18n.t('requestErrors.codes.A061')
}

/** Only public contract messages enter the UI; arbitrary server bodies can contain secrets. */
export function getRequestErrorMessage(error: AxiosError): string {
    const errorData = error.response?.data
    const status = error.response?.status
    const data =
        errorData !== null && typeof errorData === 'object'
            ? (errorData as Record<string, unknown>)
            : undefined
    const candidate = data?.errorCode ?? data?.code ?? data?.message
    const featureCode =
        typeof candidate === 'string' && Object.hasOwn(featureErrors, candidate)
            ? (candidate as keyof typeof featureErrors)
            : undefined
    const feature = featureCode ? featureErrors[featureCode] : undefined
    const code =
        typeof data?.errorCode === 'string' && /^[A-Z][A-Z0-9_-]{0,31}$/.test(data.errorCode)
            ? data.errorCode
            : featureCode
    const entry = code ? errorCatalog.get(`${code}:${status}`) : undefined
    const templateNameConflict = (status === 400 || status === 409) && code === 'A176'
    const configValidation = status === 422 && code === 'A061'
    const statusKey =
        code === 'A089' && status === 400
            ? 'requestErrors.statusCodes.A089_400'
            : code === 'A219' && status === 404
              ? 'requestErrors.statusCodes.A219_404'
              : undefined
    const networkMessage =
        error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
            ? i18n.t('requestErrors.timeout')
            : error.code === 'ERR_CANCELED'
              ? i18n.t('requestErrors.canceled')
              : i18n.t('requestErrors.unavailable')
    const message =
        feature && feature.status === status
            ? i18n.t(feature.key)
            : templateNameConflict
              ? i18n.t('requestErrors.templateNameExists')
              : configValidation
                ? configValidationMessage(data?.message)
                : status === 401
                  ? i18n.t('requestErrors.unauthorized')
                  : status === 403
                    ? i18n.t('requestErrors.forbidden')
                    : entry
                      ? i18n.t(statusKey ?? `requestErrors.codes.${entry}`)
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
                                    : networkMessage
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

    if (error instanceof RequestError) throw error

    if (
        error instanceof ZodError ||
        (error instanceof Error && error.name === 'ApiResponseError')
    ) {
        throw new Error(i18n.t('requestErrors.invalidResponse'), { cause: error })
    }

    consola.log(error)

    throw new Error(i18n.t('requestErrors.unknown'), { cause: error })
}
