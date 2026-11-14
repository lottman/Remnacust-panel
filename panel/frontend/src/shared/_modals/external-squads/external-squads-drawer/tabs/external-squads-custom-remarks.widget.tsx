import { GetExternalSquadByUuidCommand } from '@remnawave/backend-contract'

import { queryClient } from '@shared/api'
import { QueryKeys, useGetSubscriptionSettings, useUpdateExternalSquad } from '@shared/api/hooks'
import { CustomRemarksEditor } from '@shared/ui/forms/custom-remarks/custom-remarks-editor'
import { LoadingScreen } from '@shared/ui/loading-screen'
import { PageQueryError } from '@shared/ui/page-query-error'

interface IProps {
    externalSquad: GetExternalSquadByUuidCommand.Response['response']
}

export const ExternalSquadsCustomRemarksTabWidget = ({ externalSquad }: IProps) => {
    const settings = useGetSubscriptionSettings()
    const update = useUpdateExternalSquad()
    if (!externalSquad.customRemarks && !settings.data) {
        if (settings.isError) return <PageQueryError queries={[settings]} />
        return <LoadingScreen />
    }
    return (
        <CustomRemarksEditor
            key={externalSquad.uuid}
            external
            value={externalSquad.customRemarks}
            inherited={settings.data?.customRemarks}
            showRemarks={
                externalSquad.subscriptionSettings?.isShowCustomRemarks ??
                settings.data?.isShowCustomRemarks
            }
            isPending={update.isPending}
            onSave={async (customRemarks) => {
                const data = await update.mutateAsync({
                    variables: { uuid: externalSquad.uuid, customRemarks }
                })
                queryClient.setQueryData(
                    QueryKeys.externalSquads.getExternalSquad({ uuid: data.uuid }).queryKey,
                    data
                )
                return data.customRemarks
            }}
        />
    )
}
