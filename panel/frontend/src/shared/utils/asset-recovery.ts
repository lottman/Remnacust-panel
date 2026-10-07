const recoveryKey = 'xera:asset-recovery'

function entryUrl(document: Document): string | null {
    const src = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src')
    return src ? new URL(src, location.origin).href : null
}

let recovery: Promise<boolean> | undefined

/** Recover only when the server serves a different entry module than this tab. */
export function recoverUpdatedAssets(): Promise<boolean> {
    recovery ??= (async () => {
        try {
            const current = entryUrl(document)
            if (!current || !navigator.onLine) return false
            const response = await fetch(location.pathname, {
                cache: 'no-store',
                headers: { Accept: 'text/html' },
                signal: AbortSignal.timeout(8000)
            })
            if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return false
            const next = entryUrl(new DOMParser().parseFromString(await response.text(), 'text/html'))
            if (!next || next === current || new URL(next).origin !== location.origin) return false
            const key = JSON.stringify([current, next])
            // Persist before reload; unavailable session storage disables automatic recovery.
            if (sessionStorage.getItem(recoveryKey) === key) return false
            sessionStorage.setItem(recoveryKey, key)
            location.reload()
            return true
        } catch {
            return false
        }
    })().finally(() => { recovery = undefined })
    return recovery
}

export async function loadWithAssetRecovery<T>(load: () => Promise<T>, recover = recoverUpdatedAssets): Promise<T> {
    try {
        return await load()
    } catch (error) {
        if (await recover()) {
            // Keep Suspense visible while the new document loads, rather than flashing 500.
            return new Promise<T>(() => {})
        }
        throw error
    }
}
