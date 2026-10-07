import type { SelectionState } from './limits.api'

// Mixed groups are unblocked first. The request remains an explicit idempotent action,
// never an API-side toggle that could invert state on a retry.
export function trafficBlockAction(state: SelectionState): 'PAUSE' | 'RESUME' {
    return state.scopePaused || state.pausedUsers > 0 ? 'RESUME' : 'PAUSE'
}
