import { UpdateSubscriptionSettingsCommand } from '@remnawave/backend-contract'

import { queryClient } from '@shared/api'
import { QueryKeys, useUpdateSubscriptionSettings } from '@shared/api/hooks'
import { CustomRemarksEditor } from '@shared/ui/forms/custom-remarks/custom-remarks-editor'

interface IProps {
    subscriptionSettings: UpdateSubscriptionSettingsCommand.Response['response']
}

export const SubscriptionUserRemarksCardWidget = ({ subscriptionSettings }: IProps) => {
    const update = useUpdateSubscriptionSettings()
    return (
        <CustomRemarksEditor
            key={subscriptionSettings.uuid}
            value={subscriptionSettings.customRemarks}
            showRemarks={subscriptionSettings.isShowCustomRemarks}
            isPending={update.isPending}
            onSave={async (customRemarks) => {
                if (!customRemarks) throw new Error('Missing subscription remarks')
                const data = await update.mutateAsync({
                    variables: { uuid: subscriptionSettings.uuid, customRemarks }
                })
                queryClient.setQueryData(
                    QueryKeys.subscriptionSettings.getSubscriptionSettings.queryKey,
                    data
                )
                void queryClient.invalidateQueries({
                    queryKey: QueryKeys.subscriptionSettings.getSubscriptionSettings.queryKey
                })
                return data.customRemarks
            }}
        />
    )
}
