import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useGetAuthStatus } from '@shared/api/hooks/auth/auth.query.hooks'
import { ROUTES } from '@shared/constants'

import { BrandLogo } from '../brand-logo'

export const SidebarLogoShared = () => {
    const { data: authStatus, dataUpdatedAt } = useGetAuthStatus()

    const { t } = useTranslation()

    return (
        <Link
            to={ROUTES.DASHBOARD.HOME}
            aria-label={t('constants.home')}
            style={{ flexShrink: 0, display: 'flex' }}
        >
            <BrandLogo logoUrl={authStatus?.branding.logoUrl} retryKey={dataUpdatedAt} />
        </Link>
    )
}
