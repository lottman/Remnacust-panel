const descriptions = {}
const put = (keys, ru, en) => {
    for (const key of keys.split(' ')) descriptions[key] = { ru, en }
}

put(
    'USERNAME EMAIL TELEGRAM_ID',
    'Поле пользователя. Пустое необязательное значение выводится пустой строкой.',
    'User field. An empty optional value renders as an empty string.'
)
put(
    'ID SHORT_UUID',
    'Идентификатор пользователя: числовой ID или короткий UUID для публичной подписки.',
    'User identifier: numeric ID or short UUID used in the public subscription.'
)
put(
    'TAG DESCRIPTION',
    'Тег или описание пользователя; если поле не задано, выводится пустая строка.',
    'User tag or description; an unset field renders as an empty string.'
)
put(
    'SUBSCRIPTION_URL',
    'Публичный URL подписки пользователя на настроенном домене.',
    'The user’s public subscription URL on the configured domain.'
)
put(
    'STATUS',
    'Фактический статус: отключённый, истёкший или сохранённый статус. Подписи ACTIVE, DISABLED, EXPIRED и LIMITED можно переопределить аргументами.',
    'Effective status: disabled, expired or stored status. Override ACTIVE, DISABLED, EXPIRED and LIMITED labels with arguments.'
)
put(
    'RESET_STRATEGY',
    'Стратегия сброса трафика. Подписи NO_RESET, DAY, WEEK, MONTH и MONTH_ROLLING можно переопределить аргументами.',
    'Traffic reset strategy. Override NO_RESET, DAY, WEEK, MONTH and MONTH_ROLLING labels with arguments.'
)
put(
    'DAYS_LEFT',
    'Полных дней до окончания подписки, минимум 0.',
    'Whole days until expiry, clamped to zero.'
)
put(
    'EXPIRE_UNIX CREATED_AT_UNIX',
    'Дата истечения или создания пользователя в UNIX-секундах.',
    'User expiry or creation time in UNIX seconds.'
)
put(
    'LAST_TRAFFIC_RESET_AT_UNIX NEXT_TRAFFIC_RESET_AT_UNIX',
    'Время последнего/следующего сброса в UNIX-секундах; 0, если даты нет.',
    'Previous/next reset time in UNIX seconds; zero when unavailable.'
)
put(
    'LAST_TRAFFIC_RESET_AT NEXT_TRAFFIC_RESET_AT',
    'Форматированная дата сброса. Передайте format=…, чтобы изменить формат; при отсутствии даты выводится пустая строка.',
    'Formatted reset date. Pass format=… to change the format; missing dates render as an empty string.'
)
put(
    'SS_HWID_LIMIT',
    'Лимит устройств пользователя; если персональный не задан, используется лимит по умолчанию из настроек подписки, иначе 0.',
    'User device limit; falls back to subscription settings and then zero when no personal limit exists.'
)
put(
    'TRAFFIC_USED TRAFFIC_LEFT TOTAL_TRAFFIC',
    'Использованный, оставшийся или общий трафик пользователя в человекочитаемых единицах. При безлимитной общей квоте обычный остаток равен 0.',
    'Used, remaining or total account traffic with human-readable units. Ordinary remaining traffic is zero when the total quota is unlimited.'
)
put(
    'TRAFFIC_USED_BYTES TRAFFIC_LEFT_BYTES TOTAL_TRAFFIC_BYTES LIFETIME_USED_BYTES',
    'Точный целочисленный счётчик байтов строкой без единицы. LIFETIME_USED_BYTES не обнуляется вместе с текущим периодом.',
    'Exact integer byte count as a string without units. LIFETIME_USED_BYTES survives current-period resets.'
)
put(
    'TRAFFIC_USED_MB TRAFFIC_USED_GB TRAFFIC_LEFT_MB TRAFFIC_LEFT_GB TOTAL_TRAFFIC_MB TOTAL_TRAFFIC_GB',
    'Трафик пользователя в выбранной единице по базе 1024, до 3 знаков после точки; вывод включает MB или GB.',
    'Account traffic in the chosen 1024-based unit, up to three decimal places; output includes MB or GB.'
)
put(
    'HOST_SPEED',
    'Действующее ограничение скорости хоста в Mbps: минимальное положительное ограничение самого хоста или применимых тегов. Если текущего хоста нет, выводится список хостов.',
    'Effective host speed in Mbps: the lowest positive host or applicable tag cap. With no current host, renders a host list.'
)

for (const [name, ru, en] of [
    ['USE', 'Использованный трафик области.', 'Used traffic for the scope.'],
    ['LIMIT', 'Квота области; ∞ означает безлимит.', 'Scope quota; ∞ means unlimited.'],
    [
        'LEFT',
        'Остаток квоты области; ∞ означает безлимит.',
        'Remaining scope quota; ∞ means unlimited.'
    ],
    [
        'RESETAT',
        'Следующий сброс в UTC; format=… меняет формат. Если сброс не задан, выводится ∞.',
        'Next reset in UTC; format=… changes the display. If no reset is configured, renders ∞.'
    ]
]) {
    for (const suffix of ['', 'TEG']) {
        const key = `TRAFFICLOCATION${name}${suffix}`
        put(
            key,
            `${ru} ${suffix ? 'Берётся лимит тега; если применимого тега нет, используется хост.' : 'Берётся хост.'} Без текущего хоста выводится список «имя: значение».`,
            `${en} ${suffix ? 'Uses the tag quota and falls back to the host when no tag applies.' : 'Uses the host.'} Without a current host, returns a name: value list.`
        )
    }
}
for (const kind of ['USED', 'LIMIT', 'LEFT']) {
    for (const unit of ['MB', 'GB']) {
        for (const suffix of ['', 'TEG']) {
            const key = `TRAFFICLOCATION${kind}${unit}${suffix}`
            put(
                key,
                `${kind === 'USED' ? 'Использованный трафик' : kind === 'LIMIT' ? 'Квота' : 'Остаток'} ${suffix ? 'тега с переходом к хосту при отсутствии тега' : 'хоста'} в ${unit}, база 1024. Только число, без MB/GB; безлимитная квота/остаток — ∞.`,
                `${kind === 'USED' ? 'Used traffic' : kind === 'LIMIT' ? 'Quota' : 'Remaining quota'} for ${suffix ? 'tag, falling back to host' : 'host'} in 1024-based ${unit}. Numeric output only, without MB/GB; unlimited quota/remaining is ∞.`
            )
        }
    }
}

export function describeVariable(name) {
    if (!descriptions[name]) throw new Error(`Template variable ${name} needs a description`)
    return descriptions[name]
}
