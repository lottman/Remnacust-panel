import i18n from 'i18next'

export class ApiResponseError extends Error {
    readonly code = 'INVALID_API_RESPONSE'
    constructor() {
        super(i18n.t('requestErrors.invalidResponse'))
        this.name = 'ApiResponseError'
    }
}

// Never pass an HTML error page or a truncated JSON string to contract validation.
export function parseApiResponse(data: unknown): object {
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
