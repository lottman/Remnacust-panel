import { notifications } from '@mantine/notifications'
import i18next from 'i18next'
import { TbCheck as IconCheck } from 'react-icons/tb'

export const baseNotificationsMutations = (id: string, refetch: () => void) => {
    return {
        onMutate: () => {
            notifications.show({
                id,
                loading: true,
                title: i18next.t('common.message.processing'),
                message: i18next.t('mutation-messages.operation-processing'),
                autoClose: false,
                withCloseButton: false
            })

            return undefined
        },
        onSettled(error: unknown) {
            if (error) {
                notifications.update({
                    id,
                    color: 'red',
                    title: i18next.t('common.message.error'),
                    message:
                        error instanceof Error
                            ? error.message
                            : i18next.t('common.message.unknown-error'),
                    loading: false,
                    autoClose: 5000
                })
            }
        },
        onSuccess: () => {
            notifications.update({
                icon: <IconCheck size={18} />,
                id,
                color: 'teal',
                title: i18next.t('common.message.success'),
                message: i18next.t('mutation-messages.task-processing'),
                loading: false,
                autoClose: 3000
            })

            refetch()
        }
    }
}
