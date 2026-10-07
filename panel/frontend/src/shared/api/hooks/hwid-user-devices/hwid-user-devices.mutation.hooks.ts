import { notifications } from '@mantine/notifications'
import {
    BlockUserHwidDeviceCommand,
    DeleteAllUserHwidDevicesCommand,
    DeleteUserHwidDeviceCommand,
    UnblockUserHwidDeviceCommand
} from '@remnawave/backend-contract'
import i18next from 'i18next'

import { createMutationHook } from '../../tsq-helpers'

export const useDeleteUserHwidDevice = createMutationHook({
    endpoint: DeleteUserHwidDeviceCommand.TSQ_url,
    bodySchema: DeleteUserHwidDeviceCommand.RequestBodySchema,
    responseSchema: DeleteUserHwidDeviceCommand.ResponseSchema,
    requestMethod: DeleteUserHwidDeviceCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: i18next.t('hwid-notifications.device-deleted'),
                color: 'teal'
            })
        },
        onError: () => {
            notifications.show({
                title: i18next.t('hwid-notifications.delete-device'),
                message: i18next.t('hwid-notifications.delete-failed-check-state'),
                color: 'red'
            })
        }
    }
})

export const useDeleteAllUserHwidDevices = createMutationHook({
    endpoint: DeleteAllUserHwidDevicesCommand.TSQ_url,
    bodySchema: DeleteAllUserHwidDevicesCommand.RequestBodySchema,
    responseSchema: DeleteAllUserHwidDevicesCommand.ResponseSchema,
    requestMethod: DeleteAllUserHwidDevicesCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: () => {
            notifications.show({
                title: i18next.t('common.message.success'),
                message: i18next.t('hwid-notifications.unblocked-devices-deleted'),
                color: 'teal'
            })
        },
        onError: () => {
            notifications.show({
                title: i18next.t('hwid-notifications.delete-all-devices'),
                message: i18next.t('hwid-notifications.delete-failed-check-state'),
                color: 'red'
            })
        }
    }
})

const blockNotifications = (blocked: boolean) => ({
    onSuccess: () => {
        notifications.show({
            title: i18next.t('common.message.success'),
            message: blocked
                ? i18next.t('hwid-notifications.subscription-blocked')
                : i18next.t('hwid-notifications.device-unblocked'),
            color: 'teal'
        })
    },
    onError: (error: unknown) => {
        const message = error instanceof Error ? error.message : ''
        const localizedEnforcementError = message.includes(
            'HWID traffic blocking requires personal device credentials'
        )
        notifications.show({
            title: blocked
                ? i18next.t('hwid-notifications.block-device')
                : i18next.t('hwid-notifications.unblock-device'),
            message: localizedEnforcementError
                ? i18next.t('hwid-notifications.enforcement-unavailable')
                : error instanceof Error
                  ? error.message
                  : i18next.t('common.message.unknown-error'),
            color: 'red'
        })
    }
})

export const useBlockUserHwidDevice = createMutationHook({
    endpoint: BlockUserHwidDeviceCommand.TSQ_url,
    bodySchema: BlockUserHwidDeviceCommand.RequestBodySchema,
    responseSchema: BlockUserHwidDeviceCommand.ResponseSchema,
    requestMethod: BlockUserHwidDeviceCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: blockNotifications(true)
})

export const useUnblockUserHwidDevice = createMutationHook({
    endpoint: UnblockUserHwidDeviceCommand.TSQ_url,
    bodySchema: UnblockUserHwidDeviceCommand.RequestBodySchema,
    responseSchema: UnblockUserHwidDeviceCommand.ResponseSchema,
    requestMethod: UnblockUserHwidDeviceCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: blockNotifications(false)
})
