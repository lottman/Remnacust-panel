import { Alert, Button, Stack } from '@mantine/core'
import { consola } from 'consola/browser'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useMatch, useParams } from 'react-router'

import { useGetConfigProfile, useGetSnippets } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { useUiText } from '@shared/i18n/interface-text'
import { LoadingScreen } from '@shared/ui'
import { lazyWithRecovery as lazy } from '@shared/utils/lazy-with-recovery'
import { initializeXrayWasm } from '@shared/utils/xray-wasm'

const loadEditor = () => import('../components/config-profile-by-uuid.page.component')
const ConfigProfileByUuidPageComponent = lazy(() =>
    loadEditor().then((module) => ({ default: module.ConfigProfileByUuidPageComponent }))
)
const ProfileCanvasPage = lazy(() =>
    import('../components/profile-canvas.page').then((module) => ({
        default: module.ProfileCanvasPage
    }))
)

export function ConfigProfileByUuidPageConnector() {
    const uiText = useUiText()

    const { uuid } = useParams()
    const isCanvas = Boolean(useMatch(ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILE_CANVAS))
    const [isWasmLoading, setIsWasmLoading] = useState(typeof window.XrayParseConfig !== 'function')
    const [isWasmCrashed, setIsWasmCrashed] = useState(false)
    const [isWasmRestarting, setIsWasmRestarting] = useState(false)
    const wasmAttempt = useRef(0)

    const profileQuery = useGetConfigProfile({
        route: { uuid: uuid! },
        rQueryParams: { enabled: !!uuid, refetchOnWindowFocus: false }
    })
    const snippetsQuery = useGetSnippets({})
    const { data: configProfile, isLoading: isConfigProfileLoading } = profileQuery
    const { data: snippets, isLoading: isSnippetsLoading } = snippetsQuery

    const startWasm = useCallback(async (restart = false) => {
        const attempt = ++wasmAttempt.current
        setIsWasmRestarting(restart)
        setIsWasmLoading(!restart)
        setIsWasmCrashed(false)
        try {
            await initializeXrayWasm()
        } catch (error: unknown) {
            consola.error('WASM initialization error:', error)
            if (attempt === wasmAttempt.current) setIsWasmCrashed(true)
        } finally {
            if (attempt === wasmAttempt.current) {
                setIsWasmLoading(false)
                setIsWasmRestarting(false)
            }
        }
    }, [])

    useEffect(() => {
        if (isCanvas || !uuid) return
        void loadEditor().catch(() => undefined)
        const timer = window.setTimeout(() => void startWasm(), 0)
        return () => {
            window.clearTimeout(timer)
            ++wasmAttempt.current
        }
    }, [isCanvas, startWasm, uuid])

    if (!uuid) return <Navigate to={ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILES} />
    if ((!configProfile && profileQuery.isError) || (!snippets && snippetsQuery.isError))
        return (
            <Stack gap="sm">
                <Alert color="red">
                    {uiText('could-not-load-the-profile-or-snippets-d5bd769')}
                </Alert>
                <Button
                    w="fit-content"
                    loading={profileQuery.isFetching || snippetsQuery.isFetching}
                    onClick={() =>
                        void Promise.all([profileQuery.refetch(), snippetsQuery.refetch()])
                    }
                >
                    {uiText('retry-942087c')}
                </Button>
            </Stack>
        )
    if (isConfigProfileLoading || !configProfile || isSnippetsLoading || !snippets)
        return <LoadingScreen />
    if (isCanvas)
        return (
            <Suspense fallback={<LoadingScreen />}>
                <ProfileCanvasPage profile={configProfile} snippets={snippets.snippets} />
            </Suspense>
        )

    return (
        <Suspense fallback={<LoadingScreen />}>
            <ConfigProfileByUuidPageComponent
                configProfile={configProfile}
                isWasmCrashed={isWasmCrashed}
                isWasmLoading={isWasmLoading}
                isWasmRestarting={isWasmRestarting}
                onRestartWasm={() => void startWasm(true)}
                snippets={snippets}
            />
        </Suspense>
    )
}
