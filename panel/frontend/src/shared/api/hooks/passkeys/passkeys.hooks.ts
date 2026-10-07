import i18next from 'i18next'
import { translateMutationMessage } from '@shared/utils/translate-mutation-message'
import { notifications } from '@mantine/notifications'
import {
    DeletePasskeyCommand,
    UpdatePasskeyCommand,
    VerifyPasskeyRegistrationCommand
} from '@remnawave/backend-contract'

import { createMutationHook } from '../../tsq-helpers'

export const usePasskeyRegistrationVerify = createMutationHook({
    endpoint: VerifyPasskeyRegistrationCommand.TSQ_url,
    bodySchema: VerifyPasskeyRegistrationCommand.RequestBodySchema,
    responseSchema: VerifyPasskeyRegistrationCommand.ResponseSchema,
    requestMethod: VerifyPasskeyRegistrationCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Passkey verification successful'),
                color: 'teal'
            })
        }
    }
})

export const useDeletePasskey = createMutationHook({
    endpoint: DeletePasskeyCommand.TSQ_url,
    bodySchema: DeletePasskeyCommand.RequestBodySchema,
    requestMethod: DeletePasskeyCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Passkey deleted successfully'),
                color: 'teal'
            })
        }
    }
})

export const useUpdatePasskey = createMutationHook({
    endpoint: UpdatePasskeyCommand.TSQ_url,
    bodySchema: UpdatePasskeyCommand.RequestBodySchema,
    responseSchema: UpdatePasskeyCommand.ResponseSchema,
    requestMethod: UpdatePasskeyCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: translateMutationMessage('Passkey updated successfully'),
                color: 'teal'
            })
        }
    }
})
