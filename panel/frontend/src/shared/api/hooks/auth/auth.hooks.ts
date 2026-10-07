import { notifications } from '@mantine/notifications'
import {
    LoginCommand,
    OAuth2AuthorizeCommand,
    OAuth2CallbackCommand,
    RegisterCommand,
    VerifyPasskeyAuthenticationCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'
import { ZodError } from 'zod'

import { translateMutationMessage } from '@shared/utils/translate-mutation-message'

import { setToken } from '@entities/auth/session-store'

import { createMutationHook } from '../../tsq-helpers'

export const AUTH_QUERY_KEY = 'auth'

export const useLogin = createMutationHook({
    endpoint: LoginCommand.TSQ_url,
    bodySchema: LoginCommand.RequestBodySchema,
    responseSchema: LoginCommand.ResponseSchema,
    requestMethod: LoginCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: (data) => {
            setToken({ token: data.accessToken })
        },
        onError: (error) => {
            notifications.show({
                title: i18next.t('common.message.error'),
                message: error.message,
                color: 'red'
            })
        }
    }
})

export const useRegister = createMutationHook({
    endpoint: RegisterCommand.TSQ_url,
    bodySchema: RegisterCommand.RequestBodySchema,
    responseSchema: RegisterCommand.ResponseSchema,
    requestMethod: RegisterCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: (data) => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('User registered successfully'),
                color: 'teal'
            })
            setToken({ token: data.accessToken })
        },
        onError: (error) => {
            notifications.show({
                title: i18next.t('common.message.error'),
                message:
                    error instanceof ZodError
                        ? error.issues.every((issue) =>
                              ['username', 'password'].includes(String(issue.path[0]))
                          )
                            ? i18next.t('register-form.feature.check-fields')
                            : i18next.t('requestErrors.invalidResponse')
                        : error.message,
                color: 'red'
            })
        }
    }
})

export const useOauth2Callback = createMutationHook({
    endpoint: OAuth2CallbackCommand.TSQ_url,
    bodySchema: OAuth2CallbackCommand.RequestBodySchema,
    responseSchema: OAuth2CallbackCommand.ResponseSchema,
    requestMethod: OAuth2CallbackCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: (data) => {
            setToken({ token: data.accessToken })
        }
    }
})

export const useOAuth2Authorize = createMutationHook({
    endpoint: OAuth2AuthorizeCommand.TSQ_url,
    bodySchema: OAuth2AuthorizeCommand.RequestBodySchema,
    responseSchema: OAuth2AuthorizeCommand.ResponseSchema,
    requestMethod: OAuth2AuthorizeCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onError: (error) => {
            notifications.show({
                title: i18next.t('common.message.error'),
                message: error.message,
                color: 'red'
            })
        }
    }
})

export const usePasskeyAuthenticationVerify = createMutationHook({
    endpoint: VerifyPasskeyAuthenticationCommand.TSQ_url,
    bodySchema: VerifyPasskeyAuthenticationCommand.RequestBodySchema,
    responseSchema: VerifyPasskeyAuthenticationCommand.ResponseSchema,
    requestMethod: VerifyPasskeyAuthenticationCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: (data) => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Passkey authenticated successfully'),
                color: 'teal'
            })

            setToken({ token: data.accessToken })
        }
    }
})
