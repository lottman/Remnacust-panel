import {
    REMNAWAVE_CLIENT_TYPE_BROWSER,
    REMNAWAVE_CLIENT_TYPE_HEADER
} from '@remnawave/backend-contract'
import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import consola from 'consola/browser'

import { logoutEvents } from '../emitters/emit-logout'
import { parseApiResponse } from './api-response'

let authorizationToken = ''

let BASE_DOMAIN = __DOMAIN_BACKEND__
const isDev = __NODE_ENV__ === 'development'
const isDomainOverride = __DOMAIN_OVERRIDE__ === '1'

if (isDev) {
    BASE_DOMAIN = __DOMAIN_BACKEND__
} else {
    BASE_DOMAIN = window.location.origin
}

if (isDomainOverride) {
    BASE_DOMAIN = __DOMAIN_BACKEND__
}

export const getBackendDomain = () => BASE_DOMAIN

export const instance = axios.create({
    baseURL: BASE_DOMAIN,
    headers: {
        'Content-type': 'application/json',
        Accept: 'application/json',
        [REMNAWAVE_CLIENT_TYPE_HEADER]: REMNAWAVE_CLIENT_TYPE_BROWSER
    }
})

instance.interceptors.request.use((config) => {
    config.headers.set('Authorization', `Bearer ${authorizationToken}`)
    if (config.method === 'get' && !config.timeout) config.timeout = 20_000
    return config
})

type RetryConfig = InternalAxiosRequestConfig & { xeraReadRetries?: number }
async function retryRead(error: unknown, config?: RetryConfig): Promise<AxiosResponse> {
    const attempt = config?.xeraReadRetries ?? 0
    if (config?.method === 'get' && attempt < 2 && !config.signal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
        return instance.request({ ...config, xeraReadRetries: attempt + 1 } as RetryConfig)
    }
    throw error
}

export const setAuthorizationToken = (token: string) => {
    authorizationToken = token
}

export const hasAuthorizationToken = () => authorizationToken !== ''
export const getAuthorizationToken = () => authorizationToken

instance.interceptors.response.use(
    async (response) => {
        if (
            response.status !== 204 &&
            (!response.config.responseType || response.config.responseType === 'json')
        ) {
            try {
                response.data = parseApiResponse(response.data)
            } catch (error) {
                return retryRead(error, response.config)
            }
        }
        return response
    },
    async (error) => {
        if (error.response?.data?.errorCode === 'PANEL_UPDATING') {
            window.dispatchEvent(new Event('remnacust-panel-updating'))
            return Promise.reject(error)
        }
        if (
            axios.isAxiosError(error) &&
            ([502, 503, 504].includes(error.response?.status ?? 0) ||
                ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? ''))
        )
            return retryRead(error, error.config)
        if (error.response) {
            const responseStatus = error.response.status
            const requestAuthorization =
                error.config?.headers?.get?.('Authorization') ??
                error.config?.headers?.Authorization
            // A late response from an old session must not log out a newer login.
            if (
                responseStatus === 401 &&
                authorizationToken &&
                requestAuthorization === `Bearer ${authorizationToken}`
            ) {
                try {
                    logoutEvents.emit()
                } catch (error) {
                    consola.log('error', error)
                }

                // notifications.show({
                //     title: 'Unauthorized',
                //     message: 'You are not authorized to access this resource.'
                // })
            }
        }
        return Promise.reject(error)
    }
)
