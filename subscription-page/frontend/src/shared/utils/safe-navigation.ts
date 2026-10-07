/** Keep app deep links usable while rejecting executable and local-file URLs. */
export function isSafeNavigationUrl(value: string): boolean {
    if (!value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return false
    try {
        const url = new URL(value, 'https://subscription.invalid/')
        return !['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:'].includes(url.protocol)
    } catch {
        return false
    }
}
