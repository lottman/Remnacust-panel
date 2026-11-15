export const SUBSCRIPTION_SETTINGS_MUTATION_KEY = ['subscriptionSettings', 'update'] as const

interface GeofilesSettings {
    geofilesSystemEnabled?: boolean
    serveJsonAtBaseSubscription?: boolean
}

export function getGeofilesSettingsState(settings: GeofilesSettings | undefined, ready: boolean) {
    const systemEnabled = settings?.geofilesSystemEnabled === true
    const jsonEnabled = settings?.serveJsonAtBaseSubscription === true
    return {
        systemEnabled,
        jsonEnabled,
        canUpdateFiles: ready && systemEnabled,
        canGenerateClientSettings: ready && systemEnabled && jsonEnabled,
        canEnableSystem: ready && jsonEnabled
    }
}
