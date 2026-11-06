import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useGetRemnawaveMetadata } from '@shared/api/hooks/system/system.query.hooks'
import { flushEditorRecoveries } from '@shared/utils/editor-recovery-flush'
import { createPanelBuildLifecycle } from '@shared/utils/panel-build-lifecycle'

import { useAuth } from './use-auth'

export function PanelBuildLifecycle() {
    const { isAuthenticated, isInitialized } = useAuth()
    const enabled = isAuthenticated && isInitialized
    const client = useQueryClient()
    const query = useGetRemnawaveMetadata({ rQueryParams: { enabled } })
    const [accept] = useState(() =>
        createPanelBuildLifecycle({
            client,
            localStorage: () => window.localStorage,
            sessionStorage: () => window.sessionStorage,
            location: window.location,
            beforeReload: flushEditorRecoveries
        })
    )
    useEffect(() => {
        if (enabled && query.isSuccess && !query.isFetching && query.data)
            void accept(query.data).catch(() => {})
    }, [enabled, query.isSuccess, query.isFetching, query.data, query.dataUpdatedAt, accept])
    useEffect(() => {
        if (!enabled) return
        const refresh = () => {
            void query.refetch()
        }
        window.addEventListener('focus', refresh)
        return () => window.removeEventListener('focus', refresh)
    }, [enabled, query.refetch])
    return null
}
