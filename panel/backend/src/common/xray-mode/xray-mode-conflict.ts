import { HttpExceptionWithErrorCodeType } from '../exception/http-exeception-with-error-code.type';

export function hasXrayDatabaseCode(error: unknown, code: string): boolean {
    const pending: unknown[] = [error];
    const seen = new Set<object>();
    for (let visited = 0; pending.length && visited < 64; visited++) {
        const current = pending.pop();
        if (!current || typeof current !== 'object' || seen.has(current)) continue;
        seen.add(current);
        const item = current as Record<string, unknown>;
        if (item.code === code || item.originalCode === code) return true;
        for (const key of ['cause', 'meta', 'originalError', 'driverAdapterError', 'error', 'data'])
            if (item[key] && typeof item[key] === 'object') pending.push(item[key]);
    }
    return false;
}

export function rethrowXrayModeConflict(error: unknown): void {
    if (
        error instanceof HttpExceptionWithErrorCodeType &&
        error.errorCode === 'CUSTOM_XRAY_REQUIRED'
    )
        throw error;
    if (hasXrayDatabaseCode(error, 'P0C01'))
        throw new HttpExceptionWithErrorCodeType(
            'This operation requires custom Xray',
            'CUSTOM_XRAY_REQUIRED',
            409,
        );
}
