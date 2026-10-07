import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import {
    AddUsersToExternalSquadCommand,
    CreateExternalSquadCommand,
    DeleteExternalSquadCommand,
    DeleteUsersFromExternalSquadCommand,
    ReorderExternalSquadCommand,
    SetExternalSquadTagsCommand,
    UpdateExternalSquadCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

export const useUpdateExternalSquad = createMutationHook({
    endpoint: UpdateExternalSquadCommand.TSQ_url,
    bodySchema: UpdateExternalSquadCommand.RequestBodySchema,
    responseSchema: UpdateExternalSquadCommand.ResponseSchema,
    requestMethod: UpdateExternalSquadCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('External Squad updated successfully'),
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

export const useDeleteExternalSquad = createMutationHook({
    endpoint: DeleteExternalSquadCommand.TSQ_url,
    routeParamsSchema: DeleteExternalSquadCommand.RequestParamSchema,
    requestMethod: DeleteExternalSquadCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('External Squad deleted successfully'),
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

export const useCreateExternalSquad = createMutationHook({
    endpoint: CreateExternalSquadCommand.TSQ_url,
    responseSchema: CreateExternalSquadCommand.ResponseSchema,
    bodySchema: CreateExternalSquadCommand.RequestBodySchema,
    requestMethod: CreateExternalSquadCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('External Squad created successfully'),
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

export const useAddUsersToExternalSquad = createMutationHook({
    endpoint: AddUsersToExternalSquadCommand.TSQ_url,
    routeParamsSchema: AddUsersToExternalSquadCommand.RequestParamSchema,
    requestMethod: AddUsersToExternalSquadCommand.endpointDetails.REQUEST_METHOD,
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

export const useDeleteUsersFromExternalSquad = createMutationHook({
    endpoint: DeleteUsersFromExternalSquadCommand.TSQ_url,
    routeParamsSchema: DeleteUsersFromExternalSquadCommand.RequestParamSchema,
    requestMethod: DeleteUsersFromExternalSquadCommand.endpointDetails.REQUEST_METHOD,
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

export const useReorderExternalSquads = createMutationHook({
    endpoint: ReorderExternalSquadCommand.TSQ_url,
    bodySchema: ReorderExternalSquadCommand.RequestBodySchema,
    responseSchema: ReorderExternalSquadCommand.ResponseSchema,
    requestMethod: ReorderExternalSquadCommand.endpointDetails.REQUEST_METHOD,
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

export const useSetExternalSquadsTags = createMutationHook({
    endpoint: SetExternalSquadTagsCommand.TSQ_url,
    bodySchema: SetExternalSquadTagsCommand.RequestBodySchema,
    responseSchema: SetExternalSquadTagsCommand.ResponseSchema,
    requestMethod: SetExternalSquadTagsCommand.endpointDetails.REQUEST_METHOD,
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
