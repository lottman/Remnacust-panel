import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import {
    CreateSnippetCommand,
    DeleteSnippetCommand,
    UpdateSnippetCommand,
    SyncSnippetCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

export const useUpdateSnippet = createMutationHook({
    endpoint: UpdateSnippetCommand.TSQ_url,
    bodySchema: UpdateSnippetCommand.RequestBodySchema,
    responseSchema: UpdateSnippetCommand.ResponseSchema,
    requestMethod: UpdateSnippetCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Snippet updated successfully'),
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

export const useDeleteSnippet = createMutationHook({
    endpoint: DeleteSnippetCommand.TSQ_url,
    bodySchema: DeleteSnippetCommand.RequestBodySchema,
    requestMethod: DeleteSnippetCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Snippet deleted successfully'),
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

export const useCreateSnippet = createMutationHook({
    endpoint: CreateSnippetCommand.TSQ_url,
    responseSchema: CreateSnippetCommand.ResponseSchema,
    bodySchema: CreateSnippetCommand.RequestBodySchema,
    requestMethod: CreateSnippetCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Snippet created successfully'),
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

export const useSyncSnippet = createMutationHook({
    endpoint: SyncSnippetCommand.TSQ_url,
    bodySchema: SyncSnippetCommand.RequestBodySchema,
    requestMethod: SyncSnippetCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Snippet synced successfully'),
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
