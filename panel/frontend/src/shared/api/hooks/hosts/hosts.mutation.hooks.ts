import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import {
    BulkDeleteHostsCommand,
    BulkDisableHostsCommand,
    BulkEnableHostsCommand,
    CloneHostCommand,
    CreateHostCommand,
    DeleteHostCommand,
    ReorderHostsCommand,
    UpdateHostCommand,
    UpdateManyHostsCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

export const useCreateHost = createMutationHook({
    endpoint: CreateHostCommand.TSQ_url,
    bodySchema: CreateHostCommand.RequestBodySchema,
    responseSchema: CreateHostCommand.ResponseSchema,
    requestMethod: CreateHostCommand.endpointDetails.REQUEST_METHOD,
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

export const useCloneHost = createMutationHook({
    endpoint: CloneHostCommand.TSQ_url,
    bodySchema: CloneHostCommand.RequestBodySchema,
    responseSchema: CloneHostCommand.ResponseSchema,
    requestMethod: CloneHostCommand.endpointDetails.REQUEST_METHOD,
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

export const useUpdateHost = createMutationHook({
    endpoint: UpdateHostCommand.TSQ_url,
    bodySchema: UpdateHostCommand.RequestBodySchema,
    responseSchema: UpdateHostCommand.ResponseSchema,
    requestMethod: UpdateHostCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Host updated successfully'),
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

export const useDeleteHost = createMutationHook({
    endpoint: DeleteHostCommand.TSQ_url,
    routeParamsSchema: DeleteHostCommand.RequestParamSchema,
    requestMethod: DeleteHostCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Host deleted successfully'),
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

export const useReorderHosts = createMutationHook({
    endpoint: ReorderHostsCommand.TSQ_url,
    bodySchema: ReorderHostsCommand.RequestBodySchema,
    responseSchema: ReorderHostsCommand.ResponseSchema,
    requestMethod: ReorderHostsCommand.endpointDetails.REQUEST_METHOD,
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

export const useBulkDeleteHosts = createMutationHook({
    endpoint: BulkDeleteHostsCommand.TSQ_url,
    bodySchema: BulkDeleteHostsCommand.RequestBodySchema,
    requestMethod: BulkDeleteHostsCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Hosts deleted successfully'),
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

export const useBulkEnableHosts = createMutationHook({
    endpoint: BulkEnableHostsCommand.TSQ_url,
    bodySchema: BulkEnableHostsCommand.RequestBodySchema,
    requestMethod: BulkEnableHostsCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Hosts enabled successfully'),
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

export const useBulkDisableHosts = createMutationHook({
    endpoint: BulkDisableHostsCommand.TSQ_url,
    bodySchema: BulkDisableHostsCommand.RequestBodySchema,
    requestMethod: BulkDisableHostsCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Hosts disabled successfully'),
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

export const useUpdateManyHosts = createMutationHook({
    endpoint: UpdateManyHostsCommand.TSQ_url,
    bodySchema: UpdateManyHostsCommand.RequestBodySchema,
    requestMethod: UpdateManyHostsCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Hosts updated successfully'),
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
