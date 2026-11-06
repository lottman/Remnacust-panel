import type { GetMetadataCommand } from '@remnawave/backend-contract'
import type { QueryClient } from '@tanstack/react-query'

export type PanelBuildMetadata = GetMetadataCommand.Response['response']

export const PANEL_BUILD_SESSION_KEY = 'remnacust:panel-build:v1'
export const PANEL_BUILD_URL_PARAM = '_remnacust_build'

export const PANEL_UI_CACHE_KEYS = [
    'remnacustUpdatesStore',
    'viewPreferencesStore',
    'xera-panel-appearance-v1',
    'x-rmnw-users-table',
    'x-rmnw-srh-inspector-table',
    'x-rmnw-hwid-inspector-table',
    'x-rmnw-tb-reports-table'
] as const

export function panelBuildFingerprint(metadata: PanelBuildMetadata): string | null {
    const parts = [
        metadata?.version,
        metadata?.git?.backend?.commitSha,
        metadata?.git?.frontend?.commitSha,
        metadata?.build?.time,
        metadata?.build?.number
    ]
    if (parts.some((part) => typeof part !== 'string' || part.length > 256)) return null
    if (!parts[0]?.trim()) return null
    return JSON.stringify(parts)
}

interface PanelBuildEnvironment {
    localStorage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
    sessionStorage: () => Pick<Storage, 'getItem' | 'setItem'>
    location: Pick<Location, 'href' | 'replace'>
    client: Pick<QueryClient, 'clear' | 'isMutating'>
    beforeReload?: () => Promise<void>
}

export function createPanelBuildLifecycle(environment: PanelBuildEnvironment) {
    let handled: string | null = null
    return async (metadata: PanelBuildMetadata): Promise<boolean> => {
        const fingerprint = panelBuildFingerprint(metadata)
        if (!fingerprint || handled === fingerprint) return false
        let current: URL
        try {
            current = new URL(environment.location.href)
        } catch {
            return false
        }
        let saved: string | null = null
        try {
            saved = environment.sessionStorage().getItem(PANEL_BUILD_SESSION_KEY)
        } catch {}
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint))
        if (handled === fingerprint) return false
        const version = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, '0')
        ).join('')
        let shared: string | null = null
        try {
            shared = environment.localStorage().getItem(PANEL_BUILD_SESSION_KEY)
        } catch {}
        if (saved === null && shared === fingerprint) {
            try {
                environment.sessionStorage().setItem(PANEL_BUILD_SESSION_KEY, fingerprint)
            } catch {}
            handled = fingerprint
            return false
        }
        if (saved === fingerprint || current.searchParams.get(PANEL_BUILD_URL_PARAM) === version) {
            handled = fingerprint
            return false
        }
        if (environment.client.isMutating() > 0) return false
        await environment.beforeReload?.()
        if (handled === fingerprint || environment.client.isMutating() > 0) return false
        handled = fingerprint
        for (const key of PANEL_UI_CACHE_KEYS) {
            try {
                environment.localStorage().removeItem(key)
            } catch {}
        }
        try {
            environment.sessionStorage().setItem(PANEL_BUILD_SESSION_KEY, fingerprint)
        } catch {}
        try {
            environment.localStorage().setItem(PANEL_BUILD_SESSION_KEY, fingerprint)
        } catch {}
        current.searchParams.set(PANEL_BUILD_URL_PARAM, version)
        environment.client.clear()
        environment.location.replace(current.href)
        return true
    }
}
