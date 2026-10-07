import type { Scope } from './limits.api'

/** Keep scopes that can actually limit traffic or need an unblock action. */
export function hasVisibleLimit(scope: Scope): boolean {
    return (
        BigInt(scope.limitBytes) > 0n ||
        (scope.speedLimitMbps ?? 0) > 0 ||
        (scope.totalSpeedLimitMbps ?? 0) > 0 ||
        scope.paused
    )
}
