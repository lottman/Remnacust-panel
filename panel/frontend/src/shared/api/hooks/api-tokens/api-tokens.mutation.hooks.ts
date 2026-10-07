import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import {
    CreateApiTokenCommand,
    DeleteApiTokenCommand,
    UpdateApiTokenCommand,
    GetOttCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '@shared/api/tsq-helpers/create-mutation-hook'

export const useCreateApiToken = createMutationHook({
    endpoint: CreateApiTokenCommand.TSQ_url,
    bodySchema: CreateApiTokenCommand.RequestBodySchema,
    responseSchema: CreateApiTokenCommand.ResponseSchema,
    requestMethod: CreateApiTokenCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Api token created successfully'),
                color: 'teal'
            })
        },
        onError: (error) => {
            notifications.show({
                title: i18next.t('common.message.error'),
                message:
                    error instanceof Error
                        ? error.message
                        : i18next.t('common.message.unknown-error'),
                color: 'red'
            })
        }
    }
})

export const useDeleteApiToken = createMutationHook({
    endpoint: DeleteApiTokenCommand.TSQ_url,
    routeParamsSchema: DeleteApiTokenCommand.RequestParamSchema,
    requestMethod: DeleteApiTokenCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Api token deleted successfully'),
                color: 'teal'
            })
        },
        onError: (error) => {
            notifications.show({
                title: i18next.t('common.message.error'),
                message:
                    error instanceof Error
                        ? error.message
                        : i18next.t('common.message.unknown-error'),
                color: 'red'
            })
        }
    }
})

export const useIssueOtt = createMutationHook({
    endpoint: GetOttCommand.TSQ_url,
    responseSchema: GetOttCommand.ResponseSchema,
    requestMethod: GetOttCommand.endpointDetails.REQUEST_METHOD
})

export const useUpdateApiToken = createMutationHook({
    endpoint: UpdateApiTokenCommand.TSQ_url,
    routeParamsSchema: UpdateApiTokenCommand.RequestParamSchema,
    bodySchema: UpdateApiTokenCommand.RequestBodySchema,
    responseSchema: UpdateApiTokenCommand.ResponseSchema,
    requestMethod: UpdateApiTokenCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => notifications.show({
            title: i18next.t('common.message.success'),
            message: i18next.t('api-token-editor.saved'),
            color: 'teal'
        }),
        onError: (error) => notifications.show({
            title: i18next.t('common.message.error'),
            message: error instanceof Error ? error.message : i18next.t('common.message.unknown-error'),
            color: 'red'
        })
    }
})
