import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import {
    AddUsersToInternalSquadCommand,
    CreateInternalSquadCommand,
    DeleteInternalSquadCommand,
    DeleteUsersFromInternalSquadCommand,
    ReorderInternalSquadCommand,
    SetInternalSquadTagsCommand,
    UpdateInternalSquadCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

export const useUpdateInternalSquad = createMutationHook({
    endpoint: UpdateInternalSquadCommand.TSQ_url,
    bodySchema: UpdateInternalSquadCommand.RequestBodySchema,
    responseSchema: UpdateInternalSquadCommand.ResponseSchema,
    requestMethod: UpdateInternalSquadCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Internal Squad updated successfully'),
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

export const useDeleteInternalSquad = createMutationHook({
    endpoint: DeleteInternalSquadCommand.TSQ_url,
    routeParamsSchema: DeleteInternalSquadCommand.RequestParamSchema,
    requestMethod: DeleteInternalSquadCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Internal Squad deleted successfully'),
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

export const useCreateInternalSquad = createMutationHook({
    endpoint: CreateInternalSquadCommand.TSQ_url,
    responseSchema: CreateInternalSquadCommand.ResponseSchema,
    bodySchema: CreateInternalSquadCommand.RequestBodySchema,
    requestMethod: CreateInternalSquadCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Internal Squad created successfully'),
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

export const useAddUsersToInternalSquad = createMutationHook({
    endpoint: AddUsersToInternalSquadCommand.TSQ_url,
    routeParamsSchema: AddUsersToInternalSquadCommand.RequestParamSchema,
    requestMethod: AddUsersToInternalSquadCommand.endpointDetails.REQUEST_METHOD,
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

export const useDeleteUsersFromInternalSquad = createMutationHook({
    endpoint: DeleteUsersFromInternalSquadCommand.TSQ_url,
    routeParamsSchema: DeleteUsersFromInternalSquadCommand.RequestParamSchema,
    requestMethod: DeleteUsersFromInternalSquadCommand.endpointDetails.REQUEST_METHOD,
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

export const useReorderInternalSquads = createMutationHook({
    endpoint: ReorderInternalSquadCommand.TSQ_url,
    bodySchema: ReorderInternalSquadCommand.RequestBodySchema,
    responseSchema: ReorderInternalSquadCommand.ResponseSchema,
    requestMethod: ReorderInternalSquadCommand.endpointDetails.REQUEST_METHOD,
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

export const useSetInternalSquadsTags = createMutationHook({
    endpoint: SetInternalSquadTagsCommand.TSQ_url,
    bodySchema: SetInternalSquadTagsCommand.RequestBodySchema,
    responseSchema: SetInternalSquadTagsCommand.ResponseSchema,
    requestMethod: SetInternalSquadTagsCommand.endpointDetails.REQUEST_METHOD,
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
