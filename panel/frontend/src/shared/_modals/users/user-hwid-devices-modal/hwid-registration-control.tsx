import { Alert, Switch } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { instance } from '@shared/api'
import { useUiText } from '@shared/i18n/interface-text'

type Policy = { userId: number; registrationAllowed: boolean }
export function HwidRegistrationControl({ userId }: { userId: number }) {
    const uiText = useUiText()

    const client = useQueryClient()
    const queryKey = ['hwid-registration', userId]
    const url = `/api/hwid/devices/registration/${userId}`
    const { data, isError } = useQuery({
        queryKey,
        queryFn: async ({ signal }) =>
            (await instance.get<{ response: Policy }>(url, { signal })).data.response,
        refetchInterval: 15000
    })
    const mutation = useMutation({
        mutationFn: async (registrationAllowed: boolean) =>
            (await instance.patch<{ response: Policy }>(url, { registrationAllowed })).data
                .response,
        onSuccess: (value) => client.setQueryData(queryKey, value),
        onError: () =>
            notifications.show({
                color: 'red',
                message: uiText('could-not-change-new-device-access-01f1686')
            })
    })
    if (isError)
        return (
            <Alert color="yellow">
                {uiText('device-registration-policy-is-unavailable-130c617')}
            </Alert>
        )
    return (
        <Switch
            checked={data?.registrationAllowed === false}
            disabled={!data || mutation.isPending}
            label={uiText('deny-new-devices-48105ae')}
            description={uiText(
                'existing-devices-continue-working-allowing-registration-keeps--517c1bf'
            )}
            onChange={(event) => mutation.mutate(!event.currentTarget.checked)}
        />
    )
}
