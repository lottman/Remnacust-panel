import { Image } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useGetAuthStatus } from '@shared/api/hooks/auth/auth.query.hooks'
import { ROUTES } from '@shared/constants'

import { Logo } from '../logo'
import classes from './sidebar.module.css'

export const SidebarLogoShared = () => {
    const { data: authStatus } = useGetAuthStatus()
    const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null)

    const { t } = useTranslation()

    const logoUrl = authStatus?.branding.logoUrl
    if (logoUrl && failedLogoUrl !== logoUrl) {
        return (
            <Link
                to={ROUTES.DASHBOARD.HOME}
                aria-label={t('constants.home')}
                style={{ flexShrink: 0, display: 'flex' }}
            >
                <Image
                    alt=""
                    className={classes.fadeIn}
                    fit="contain"
                    onError={() => setFailedLogoUrl(logoUrl)}
                    src={logoUrl}
                    style={{
                        maxWidth: '30px',
                        maxHeight: '30px',
                        width: '30px',
                        height: '30px',
                        cursor: 'pointer'
                    }}
                />
            </Link>
        )
    }

    return (
        <Link
            to={ROUTES.DASHBOARD.HOME}
            aria-label={t('constants.home')}
            style={{ flexShrink: 0, display: 'flex' }}
        >
            <Logo
                c="brand.5"
                className={classes.fadeIn}
                style={{ cursor: 'pointer' }}
                w="1.75rem"
            />
        </Link>
    )
}
