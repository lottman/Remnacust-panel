import { Loader, rem } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { PiSignOut } from 'react-icons/pi'

import { useLogout } from '@shared/hooks/use-logout'

import { HeaderControl } from './HeaderControl'
import classes from './LogoutControl.module.css'

export function LogoutControl() {
    const { logout, pending } = useLogout()
    const { t } = useTranslation()

    return (
        <HeaderControl
            aria-label={t('design-ui.logout')}
            title={t('design-ui.logout')}
            className={classes.logout}
            disabled={pending}
            onClick={logout}
        >
            {pending ? (
                <Loader size={22} />
            ) : (
                <PiSignOut style={{ width: rem(22), height: rem(22) }} />
            )}
        </HeaderControl>
    )
}
