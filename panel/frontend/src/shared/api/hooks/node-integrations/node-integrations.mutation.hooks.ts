import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import {
    CreateNodeIntegrationCommand,
    DeleteNodeIntegrationCommand,
    UpdateNodeIntegrationCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

export const useCreateNodeIntegration = createMutationHook({
    endpoint: CreateNodeIntegrationCommand.TSQ_url,
    bodySchema: CreateNodeIntegrationCommand.RequestBodySchema,
    responseSchema: CreateNodeIntegrationCommand.ResponseSchema,
    requestMethod: CreateNodeIntegrationCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Node integration created successfully'),
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

export const useUpdateNodeIntegration = createMutationHook({
    endpoint: UpdateNodeIntegrationCommand.TSQ_url,
    bodySchema: UpdateNodeIntegrationCommand.RequestBodySchema,
    responseSchema: UpdateNodeIntegrationCommand.ResponseSchema,
    requestMethod: UpdateNodeIntegrationCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Node integration updated successfully'),
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

export const useDeleteNodeIntegration = createMutationHook({
    endpoint: DeleteNodeIntegrationCommand.TSQ_url,
    routeParamsSchema: DeleteNodeIntegrationCommand.RequestParamSchema,
    requestMethod: DeleteNodeIntegrationCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Node integration deleted successfully'),
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
