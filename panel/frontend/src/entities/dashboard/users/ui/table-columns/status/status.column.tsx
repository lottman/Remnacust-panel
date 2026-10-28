import { Stack, Text } from '@mantine/core'
import { UserStatusBadge } from '@widgets/dashboard/users/user-status-badge'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { getUserExpirationState } from '@shared/ui/forms/users/forms-components/user-expiration'
import { getExpirationTextUtil } from '@shared/utils/time-utils'

import { IProps } from './interface'

export function StatusColumnEntity(props: IProps) {
    const { t, i18n } = useTranslation()

    const { user, need } = props

    const expirationText =
        user.status === 'FROZEN' && user.frozenRemainingMs != null
            ? t('frozen-user.remaining', {
                  duration: dayjs(Date.now() + user.frozenRemainingMs)
                      .locale(i18n.language)
                      .fromNow(true)
              })
            : getExpirationTextUtil(user.expireAt, t, i18n)

    const state = getUserExpirationState(user.expireAt)
    const color =
        user.status === 'FROZEN'
            ? 'blue'
            : state === 'expired'
              ? 'red'
              : state === 'soon'
                ? 'yellow'
                : 'dimmed'

    if (need === 'badge') {
        return <UserStatusBadge miw="13ch" status={user.status} />
    }

    if (need === 'date') {
        return (
            <Text c={color} size="xs">
                {expirationText}
            </Text>
        )
    }

    return (
        <Stack gap="xs">
            <UserStatusBadge status={user.status} />
            <Text c={color} size="xs">
                {expirationText}
            </Text>
        </Stack>
    )
}
