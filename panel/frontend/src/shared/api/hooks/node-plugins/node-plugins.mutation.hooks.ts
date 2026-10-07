import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import {
    CloneNodePluginCommand,
    CreateNodePluginCommand,
    CreateSharedListCommand,
    DeleteNodePluginCommand,
    DeleteSharedListCommand,
    PluginExecutorCommand,
    ReorderNodePluginCommand,
    SetNodePluginTagsCommand,
    SyncNodePluginCommand,
    SyncSharedListCommand,
    TruncateTorrentBlockerReportsCommand,
    UpdateNodePluginCommand,
    UpdateSharedListCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

export const useUpdateNodePlugin = createMutationHook({
    endpoint: UpdateNodePluginCommand.TSQ_url,
    bodySchema: UpdateNodePluginCommand.RequestBodySchema,
    responseSchema: UpdateNodePluginCommand.ResponseSchema,
    requestMethod: UpdateNodePluginCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Node plugin updated successfully'),
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

export const useCreateNodePlugin = createMutationHook({
    endpoint: CreateNodePluginCommand.TSQ_url,
    bodySchema: CreateNodePluginCommand.RequestBodySchema,
    responseSchema: CreateNodePluginCommand.ResponseSchema,
    requestMethod: CreateNodePluginCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Node plugin created successfully'),
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

export const useDeleteNodePlugin = createMutationHook({
    endpoint: DeleteNodePluginCommand.TSQ_url,
    routeParamsSchema: DeleteNodePluginCommand.RequestParamSchema,
    requestMethod: DeleteNodePluginCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Node plugin deleted successfully'),
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

export const useReorderNodePlugins = createMutationHook({
    endpoint: ReorderNodePluginCommand.TSQ_url,
    bodySchema: ReorderNodePluginCommand.RequestBodySchema,
    responseSchema: ReorderNodePluginCommand.ResponseSchema,
    requestMethod: ReorderNodePluginCommand.endpointDetails.REQUEST_METHOD,
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

export const useCloneNodePlugin = createMutationHook({
    endpoint: CloneNodePluginCommand.TSQ_url,
    bodySchema: CloneNodePluginCommand.RequestBodySchema,
    responseSchema: CloneNodePluginCommand.ResponseSchema,
    requestMethod: CloneNodePluginCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Node plugin cloned successfully'),
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

export const useNodePluginExecutor = createMutationHook({
    endpoint: PluginExecutorCommand.TSQ_url,
    bodySchema: PluginExecutorCommand.RequestBodySchema,
    requestMethod: PluginExecutorCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Request sent'),
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

export const useTruncateTorrentBlockerReports = createMutationHook({
    endpoint: TruncateTorrentBlockerReportsCommand.TSQ_url,
    requestMethod: TruncateTorrentBlockerReportsCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Reports truncated successfully'),
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

export const useSyncNodePlugin = createMutationHook({
    endpoint: SyncNodePluginCommand.TSQ_url,
    bodySchema: SyncNodePluginCommand.RequestBodySchema,
    requestMethod: SyncNodePluginCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Sync queued for nodes with this plugin'),
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

export const useCreateSharedList = createMutationHook({
    endpoint: CreateSharedListCommand.TSQ_url,
    bodySchema: CreateSharedListCommand.RequestBodySchema,
    responseSchema: CreateSharedListCommand.ResponseSchema,
    requestMethod: CreateSharedListCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Shared list created successfully'),
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

export const useUpdateSharedList = createMutationHook({
    endpoint: UpdateSharedListCommand.TSQ_url,
    bodySchema: UpdateSharedListCommand.RequestBodySchema,
    responseSchema: UpdateSharedListCommand.ResponseSchema,
    requestMethod: UpdateSharedListCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Shared list updated successfully'),
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

export const useDeleteSharedList = createMutationHook({
    endpoint: DeleteSharedListCommand.TSQ_url,
    bodySchema: DeleteSharedListCommand.RequestBodySchema,
    requestMethod: DeleteSharedListCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Shared list deleted successfully'),
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

export const useSyncSharedList = createMutationHook({
    endpoint: SyncSharedListCommand.TSQ_url,
    bodySchema: SyncSharedListCommand.RequestBodySchema,
    requestMethod: SyncSharedListCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Sync queued for nodes using this list'),
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

export const useSetNodePluginsTags = createMutationHook({
    endpoint: SetNodePluginTagsCommand.TSQ_url,
    bodySchema: SetNodePluginTagsCommand.RequestBodySchema,
    responseSchema: SetNodePluginTagsCommand.ResponseSchema,
    requestMethod: SetNodePluginTagsCommand.endpointDetails.REQUEST_METHOD,
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
