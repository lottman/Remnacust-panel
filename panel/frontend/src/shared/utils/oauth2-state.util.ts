const STATE_KEY_PREFIX = 'oauth2:state:'
const STATE_LIFETIME_MS = 10 * 60 * 1000
const PROVIDERS = ['github', 'pocketid', 'yandex', 'keycloak', 'generic', 'telegram']

export const saveOAuth2State = (provider: string, authorizationUrl: string): boolean => {
    try {
        if (!PROVIDERS.includes(provider)) return false
        const state = new URL(authorizationUrl).searchParams.get('state')
        if (!state) return false

        sessionStorage.setItem(
            STATE_KEY_PREFIX + provider,
            JSON.stringify({ state, expiresAt: Date.now() + STATE_LIFETIME_MS })
        )
        return true
    } catch {
        return false
    }
}

export const consumeOAuth2State = (provider: string, state: string): boolean => {
    try {
        if (!PROVIDERS.includes(provider) || !state) return false
        const key = STATE_KEY_PREFIX + provider
        const saved = sessionStorage.getItem(key)
        sessionStorage.removeItem(key)
        if (!saved) return false

        const pending = JSON.parse(saved)
        return (
            pending?.state === state &&
            typeof pending.expiresAt === 'number' &&
            pending.expiresAt > Date.now()
        )
    } catch {
        return false
    }
}
