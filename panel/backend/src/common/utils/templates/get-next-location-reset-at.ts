type ResetUnit = 'DAYS' | 'MONTHS';

export function getNextLocationResetAt(
    anchor: Date,
    value: number,
    unit: ResetUnit,
    now = new Date(),
): Date | null {
    if (!Number.isInteger(value) || value <= 0 || !Number.isFinite(anchor.getTime())) return null;

    if (unit === 'DAYS') {
        const period = value * 86_400_000;
        const cycles = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / period) + 1);
        return new Date(anchor.getTime() + cycles * period);
    }

    const monthsSinceAnchor =
        (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
        now.getUTCMonth() -
        anchor.getUTCMonth();
    let cycles = Math.max(0, Math.floor(monthsSinceAnchor / value));
    const atCycle = (cycle: number): Date => {
        const targetMonth = anchor.getUTCMonth() + cycle * value;
        const lastDay = new Date(
            Date.UTC(anchor.getUTCFullYear(), targetMonth + 1, 0),
        ).getUTCDate();
        return new Date(
            Date.UTC(
                anchor.getUTCFullYear(),
                targetMonth,
                Math.min(anchor.getUTCDate(), lastDay),
                anchor.getUTCHours(),
                anchor.getUTCMinutes(),
                anchor.getUTCSeconds(),
                anchor.getUTCMilliseconds(),
            ),
        );
    };
    while (cycles > 0 && atCycle(cycles - 1).getTime() > now.getTime()) cycles--;
    while (atCycle(cycles).getTime() <= now.getTime()) cycles++;
    return atCycle(cycles);
}
