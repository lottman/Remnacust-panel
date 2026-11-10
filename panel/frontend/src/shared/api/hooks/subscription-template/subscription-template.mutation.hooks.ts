import { notifications } from '@mantine/notifications'
import {
    CreateSubscriptionTemplateCommand,
    DeleteSubscriptionTemplateCommand,
    ReorderSubscriptionTemplateCommand,
    SetSubscriptionTemplateTagsCommand,
    UpdateSubscriptionTemplateCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { translateMutationMessage } from '@shared/utils/translate-mutation-message'

import { createMutationHook } from '../../tsq-helpers'
import { cacheCreatedTemplate } from './subscription-template-cache'
import { subscriptionTemplateQueryKeys } from './subscription-template.query.hooks'

export const useUpdateSubscriptionTemplate = createMutationHook({
    endpoint: UpdateSubscriptionTemplateCommand.TSQ_url,
    bodySchema: UpdateSubscriptionTemplateCommand.RequestBodySchema,
    responseSchema: UpdateSubscriptionTemplateCommand.ResponseSchema,
    requestMethod: UpdateSubscriptionTemplateCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: (data, variables) => {
            const policyChange =
                typeof variables.variables?.geofilesEnabled === 'boolean' &&
                variables.variables.templateJson === undefined &&
                variables.variables.encodedTemplateYaml === undefined &&
                variables.variables.draftContent === undefined
            if (policyChange) {
                notifications.show({
                    title: i18next.t('common.message.success'),
                    message: i18next.t(
                        data.geofilesEnabled
                            ? 'geofiles.template-enabled-message'
                            : 'geofiles.template-disabled-message',
                        { name: data.name }
                    ),
                    color: 'teal'
                })
                return
            }
            const draft = data.draftContent !== undefined && data.draftContent !== null
            const warnings = !!data.validationWarnings?.length
            notifications.show({
                title: i18next.t(
                    draft
                        ? 'template-draft.saved-title'
                        : warnings
                          ? 'template-draft.applied-warning-title'
                          : 'common.message.success'
                ),
                message: draft
                    ? i18next.t('template-draft.saved-help')
                    : warnings
                      ? i18next.t('template-draft.applied-warning-help')
                      : translateMutationMessage('Subscription template updated successfully'),
                color: draft || warnings ? 'yellow' : 'teal'
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

export const useCreateSubscriptionTemplate = createMutationHook({
    endpoint: CreateSubscriptionTemplateCommand.TSQ_url,
    bodySchema: CreateSubscriptionTemplateCommand.RequestBodySchema,
    responseSchema: CreateSubscriptionTemplateCommand.ResponseSchema,
    requestMethod: CreateSubscriptionTemplateCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: async (data, _variables, _context, client) => {
            await cacheCreatedTemplate(
                client,
                subscriptionTemplateQueryKeys.getSubscriptionTemplates.queryKey,
                data
            )
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Subscription template created successfully'),
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

export const useDeleteSubscriptionTemplate = createMutationHook({
    endpoint: DeleteSubscriptionTemplateCommand.TSQ_url,
    routeParamsSchema: DeleteSubscriptionTemplateCommand.RequestParamSchema,
    requestMethod: DeleteSubscriptionTemplateCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Subscription template deleted successfully'),
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

export const useReorderSubscriptionTemplates = createMutationHook({
    endpoint: ReorderSubscriptionTemplateCommand.TSQ_url,
    bodySchema: ReorderSubscriptionTemplateCommand.RequestBodySchema,
    responseSchema: ReorderSubscriptionTemplateCommand.ResponseSchema,
    requestMethod: ReorderSubscriptionTemplateCommand.endpointDetails.REQUEST_METHOD,
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

export const useSetSubscriptionTemplatesTags = createMutationHook({
    endpoint: SetSubscriptionTemplateTagsCommand.TSQ_url,
    bodySchema: SetSubscriptionTemplateTagsCommand.RequestBodySchema,
    responseSchema: SetSubscriptionTemplateTagsCommand.ResponseSchema,
    requestMethod: SetSubscriptionTemplateTagsCommand.endpointDetails.REQUEST_METHOD,
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
