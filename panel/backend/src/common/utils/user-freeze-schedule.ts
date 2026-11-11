type FreezeState = { status: string; frozenUntil?: Date | null };
type FreezeChange = { status?: string; frozenUntil?: Date | string | null };

export function freezeScheduleError(
    current: FreezeState | null,
    change: FreezeChange,
    now = Date.now(),
): 'invalid' | 'immutable' | null {
    const status = change.status ?? current?.status ?? 'ACTIVE';
    if (status !== 'FROZEN') return null;
    const saved = current?.status === 'FROZEN' ? current.frozenUntil : null;
    if (saved) {
        return change.frozenUntil !== undefined &&
            (change.frozenUntil === null ||
                new Date(change.frozenUntil).getTime() !== saved.getTime())
            ? 'immutable'
            : null;
    }
    if (change.status !== 'FROZEN' && change.frozenUntil === undefined) return null;
    const deadline = change.frozenUntil == null ? NaN : new Date(change.frozenUntil).getTime();
    return Number.isFinite(deadline) && deadline > now ? null : 'invalid';
}
