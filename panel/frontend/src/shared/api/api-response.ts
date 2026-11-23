import i18n from 'i18next'

export class ApiResponseError extends Error {
    constructor(
        readonly code: 'INVALID_API_RESPONSE' | 'INVALID_API_CONTRACT' = 'INVALID_API_RESPONSE',
        options?: ErrorOptions
    ) {
        super(undefined, options)
        this.name = 'ApiResponseError'
        Object.defineProperty(this, 'message', {
            get: () => getApiResponseErrorMessage(code)
        })
    }
}

export function getApiResponseErrorMessage(code: ApiResponseError['code']) {
    const key =
        code === 'INVALID_API_CONTRACT'
            ? 'requestErrors.invalidResponse'
            : 'requestErrors.invalidPayload'
    return `${i18n.t(key)} [${code}]`
}

// Never pass an HTML error page or a truncated JSON string to contract validation.
export function parseApiResponse(data: unknown, status = 200): object | undefined {
    if (status === 202 && (data === '' || data === undefined)) return undefined
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data)
        } catch {
            throw new ApiResponseError()
        }
    }
    if (data === null || typeof data !== 'object') throw new ApiResponseError()
    return data
}
