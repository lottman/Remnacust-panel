type Lifetime = { status: string; expireAt: Date; frozenAt?: Date | null };

export function frozenRemainingMs(user: Lifetime): number | null {
    if (user.status !== 'FROZEN' || !user.frozenAt) return null;
    return Math.max(0, user.expireAt.getTime() - user.frozenAt.getTime());
}

export function effectiveUserExpiry(user: Lifetime, now = Date.now()): Date {
    const remaining = frozenRemainingMs(user);
    return remaining === null ? user.expireAt : new Date(now + remaining);
}

// Frozen rows keep a virtual clock. An explicit date edit is relative to the request time.
export function frozenDateEdit(user: Lifetime, date: Date, now = Date.now()): Date {
    return user.status === 'FROZEN' && user.frozenAt
        ? new Date(user.frozenAt.getTime() + Math.max(0, date.getTime() - now))
        : date;
}
