// An old tab may request a lazy chunk removed by a deployment. Reload only
// after confirming the HTML points to another build, at most once per minute.
export function installStaleAssetRecovery() {
    let checking = false
    let reloading = false
    const key = 'xera:asset-recovery'
    const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src
    async function recover() {
        if (checking || reloading || !entry || !navigator.onLine) return
        checking = true
        try {
            const previous = Number(sessionStorage.getItem(key) ?? '0')
            if (Date.now() - previous < 60_000) return
            const response = await fetch('/', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
            if (!response.ok) return
            const html = new DOMParser().parseFromString(await response.text(), 'text/html')
            const candidate = html.querySelector('script[type="module"][src]')?.getAttribute('src')
            if (!candidate) return
            const next = new URL(candidate, location.origin)
            if (next.origin !== location.origin || next.href === entry) return
            sessionStorage.setItem(key, String(Date.now()))
            reloading = true
            location.reload()
        } catch {
            // Offline, blocked storage, or a transient server error: retain the
            // normal error boundary and its manual retry instead of a reload loop.
        } finally {
            checking = false
        }
    }
    window.addEventListener('vite:preloadError', () => { void recover() })
    window.addEventListener('unhandledrejection', event => {
        const message = event.reason instanceof Error ? event.reason.message : String(event.reason)
        if (/dynamically imported module|module script|loading chunk|unable to preload css/i.test(message)) {
            void recover()
        }
    })
}
