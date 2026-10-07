import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import { UpdateSubscriptionSettingsCommand } from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

export const useUpdateSubscriptionSettings = createMutationHook({
    endpoint: UpdateSubscriptionSettingsCommand.TSQ_url,
    bodySchema: UpdateSubscriptionSettingsCommand.RequestBodySchema,
    responseSchema: UpdateSubscriptionSettingsCommand.ResponseSchema,
    requestMethod: UpdateSubscriptionSettingsCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Subscription settings updated successfully'),
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
