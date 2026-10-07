import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import {
    CreateConfigProfileCommand,
    DeleteConfigProfileCommand,
    ReorderConfigProfileCommand,
    SetConfigProfileTagsCommand,
    UpdateConfigProfileCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

export const useUpdateConfigProfile = createMutationHook({
    endpoint: UpdateConfigProfileCommand.TSQ_url,
    bodySchema: UpdateConfigProfileCommand.RequestBodySchema,
    responseSchema: UpdateConfigProfileCommand.ResponseSchema,
    requestMethod: UpdateConfigProfileCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Config updated successfully'),
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

export const useDeleteConfigProfile = createMutationHook({
    endpoint: DeleteConfigProfileCommand.TSQ_url,
    routeParamsSchema: DeleteConfigProfileCommand.RequestParamSchema,
    requestMethod: DeleteConfigProfileCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Config deleted successfully'),
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

export const useCreateConfigProfile = createMutationHook({
    endpoint: CreateConfigProfileCommand.TSQ_url,
    responseSchema: CreateConfigProfileCommand.ResponseSchema,
    bodySchema: CreateConfigProfileCommand.RequestBodySchema,
    requestMethod: CreateConfigProfileCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Config created successfully'),
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

export const useReorderConfigProfiles = createMutationHook({
    endpoint: ReorderConfigProfileCommand.TSQ_url,
    bodySchema: ReorderConfigProfileCommand.RequestBodySchema,
    responseSchema: ReorderConfigProfileCommand.ResponseSchema,
    requestMethod: ReorderConfigProfileCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
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

export const useSetConfigProfilesTags = createMutationHook({
    endpoint: SetConfigProfileTagsCommand.TSQ_url,
    bodySchema: SetConfigProfileTagsCommand.RequestBodySchema,
    responseSchema: SetConfigProfileTagsCommand.ResponseSchema,
    requestMethod: SetConfigProfileTagsCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
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
