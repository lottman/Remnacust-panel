export function httpLogPath(url: string | undefined): string {
    const pathname = url?.split('?', 1)[0] ?? '';
    // A subscription UUID is a bearer credential, including device-specific paths.
    return /^\/api\/sub(?:\/|$)/i.test(pathname) ? '/api/sub/[redacted]' : pathname;
}
