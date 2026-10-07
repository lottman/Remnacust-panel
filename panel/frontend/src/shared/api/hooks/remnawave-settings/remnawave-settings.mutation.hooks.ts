import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import { UpdateRemnawaveSettingsCommand } from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

export const useUpdateRemnawaveSettings = createMutationHook({
    endpoint: UpdateRemnawaveSettingsCommand.TSQ_url,
    bodySchema: UpdateRemnawaveSettingsCommand.RequestBodySchema,
    responseSchema: UpdateRemnawaveSettingsCommand.ResponseSchema,
    requestMethod: UpdateRemnawaveSettingsCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Remnawave settings updated successfully'),
                color: 'teal'
            })
        }
    }
})
