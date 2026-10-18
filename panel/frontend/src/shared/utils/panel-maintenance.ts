let maintenance = false

export function setPanelMaintenance(active: boolean) {
    maintenance = active
}

export function isExpectedPanelUpdateError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const value = error as {
        errorCode?: string
        status?: number
        code?: string
        response?: { status?: number; data?: { errorCode?: string } }
    }
    const code = value.errorCode ?? value.response?.data?.errorCode
    if (code === 'PANEL_UPDATING') return true
    return (
        maintenance &&
        ([502, 503, 504].includes(value.status ?? value.response?.status ?? 0) ||
            ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(value.code ?? ''))
    )
}
