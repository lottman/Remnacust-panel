type FrozenUser = { userStatus: string; frozenRemainingMs?: number | null }

export function frozenSubscription(user: FrozenUser, language: string) {
    if (user.userStatus !== 'FROZEN') return null
    const labels: Record<string, { status: string; remaining: string }> = {
        en: { status: 'Frozen', remaining: 'Remaining' },
        ru: { status: 'Заморожена', remaining: 'Осталось' },
        fa: { status: 'متوقف', remaining: 'باقی‌مانده' },
        zh: { status: '已冻结', remaining: '剩余' }
    }
    const label = labels[language.split('-')[0]] ?? labels.en
    const ms = Math.max(0, user.frozenRemainingMs ?? 0)
    const units = [
        ['day', 86400000], ['hour', 3600000], ['minute', 60000], ['second', 1000]
    ] as const
    const [unit, size] = units.find(([, factor]) => ms >= factor) ?? units[3]
    const duration = new Intl.NumberFormat(language, { style: 'unit', unit, unitDisplay: 'long' })
        .format(ms === 0 ? 0 : Math.ceil(ms / size))
    return { status: label.status, remaining: `${label.remaining}: ${duration}` }
}
