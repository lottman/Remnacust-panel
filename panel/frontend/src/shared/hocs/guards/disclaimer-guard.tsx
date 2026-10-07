import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { ROUTES } from '@shared/constants/routes'

import { useDisclaimerAccepted } from '@entities/dashboard/misc-store'

export function DisclaimerGuard({ children }: { children: ReactNode }) {
    const disclaimerAccepted = useDisclaimerAccepted()
    const { pathname } = useLocation()
    const isHome = pathname.replace(/\/+$/, '') === ROUTES.DASHBOARD.HOME

    if (!disclaimerAccepted && !isHome) {
        return <Navigate replace to={ROUTES.DASHBOARD.HOME} />
    }

    return children
}
