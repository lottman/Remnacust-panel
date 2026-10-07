import { notifications } from '@mantine/notifications'
import {
    DeleteBackupCommand,
    SendBackupCommand,
    UpdateBackupSettingsCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

const successNotification = (title: string, message: string) => ({
    onSuccess: () => {
        notifications.show({
            title,
            message,
            color: 'teal'
        })
    },
    onError: (error: unknown) => {
        notifications.show({
            title,
            message:
                error instanceof Error ? error.message : i18next.t('common.message.unknown-error'),
            color: 'red'
        })
    }
})

export const useDeleteBackup = createMutationHook({
    endpoint: DeleteBackupCommand.TSQ_url,
    bodySchema: DeleteBackupCommand.RequestBodySchema,
    responseSchema: DeleteBackupCommand.ResponseSchema,
    requestMethod: DeleteBackupCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: successNotification('Backup', 'Backup deleted successfully')
})

export const useSendBackup = createMutationHook({
    endpoint: SendBackupCommand.TSQ_url,
    bodySchema: SendBackupCommand.RequestBodySchema,
    responseSchema: SendBackupCommand.ResponseSchema,
    requestMethod: SendBackupCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onError: () => {
            notifications.show({
                title: 'Telegram',
                message: i18next.t('backups.delivery-failed'),
                color: 'red'
            })
        },
        onSuccess: (data) => {
            const delivered = data.delivered === true
            notifications.show({
                title: 'Telegram',
                message: i18next.t(delivered ? 'backups.delivery-success' : 'backups.delivery-failed'),
                color: delivered ? 'teal' : 'red'
            })
        }
    }
})

export const useUpdateBackupSettings = createMutationHook({
    endpoint: UpdateBackupSettingsCommand.TSQ_url,
    bodySchema: UpdateBackupSettingsCommand.RequestBodySchema,
    responseSchema: UpdateBackupSettingsCommand.ResponseSchema,
    requestMethod: UpdateBackupSettingsCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: successNotification('Settings', 'Backup settings updated successfully')
})
