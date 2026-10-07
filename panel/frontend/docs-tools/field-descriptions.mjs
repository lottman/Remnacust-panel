export const fieldDescriptions = {
    address: [
        'Адрес, к которому обращается клиент или управляющая панель в контексте этой формы. Укажите доступный IP/домен; это не название записи.',
        'Reachable IP/domain used by the client or panel in this form’s context; separate from the display name.'
    ],
    port: [
        'TCP/UDP-порт выбранной службы. Клиентский порт хоста и управляющий порт агента ноды могут отличаться.',
        'Port of the selected service. A host client port and node agent management port can differ.'
    ],
    name: [
        'Название объекта в панели. Идентификатор UUID остаётся отдельным системным полем.',
        'Object display name. UUID remains a separate identifier.'
    ],
    remark: [
        'Название подключения, выдаваемое пользователю в подписке. Поддерживаемые переменные вычисляются при выдаче.',
        'Connection name delivered in the subscription. Supported variables resolve when the response is generated.'
    ],
    email: [
        'Контакт и ключ поиска пользователя; не разрешает доступ к inbound.',
        'User contact/search field; it does not grant inbound access.'
    ],
    telegramId: [
        'Числовой Telegram ID пользователя. Это не username и не ID чата для отправки резервных копий.',
        'Numeric user Telegram ID, distinct from a username or backup-delivery chat ID.'
    ],
    tag: [
        'Пользовательский тег для группировки/поиска. Он отличается от массива тегов хоста и не назначает сквад.',
        'User grouping/search tag, separate from host tag arrays and squad membership.'
    ],
    tags: [
        'Массив меток объекта. У хостов теги также связывают включённые политики. Пустой массив при сохранении очищает метки.',
        'Object label array. Host tags also connect enabled policies; saving an empty array clears labels.'
    ],
    note: [
        'Административная заметка об объекте. Не заменяет настройки маршрутизации и доступа.',
        'Administrator note about the object, not a routing/access configuration.'
    ],
    countryCode: [
        'Код страны для отображения и группировки. Флаг не меняет географию сервера.',
        'Country code used for display/grouping. The flag does not change server location.'
    ],
    consumptionMultiplier: [
        'Коэффициент учёта расхода. Меняет списываемый объём, не скорость подключения.',
        'Usage accounting multiplier. It changes charged volume, not connection bandwidth.'
    ],
    nodeConsumptionMultiplier: [
        'Коэффициент учёта ноды в соответствующей массовой форме. Не является личной квотой хоста.',
        'Node accounting multiplier in the bulk form, separate from a personal host quota.'
    ],
    hwidDeviceLimit: [
        'null использует резервный лимит; 0 отключает лимит; положительное число ограничивает зарегистрированные устройства. Запрет новой регистрации задаётся отдельно.',
        'null uses the fallback; 0 disables the limit; a positive number caps registered devices. New-registration denial is separate.'
    ],
    'hwidSettings.enabled': [
        'Включает общую обработку HWID в выдаче подписки. Клиент должен отправлять поддерживаемые заголовки.',
        'Enables global subscription HWID processing; the client must send supported headers.'
    ],
    'passwordSettings.enabled': [
        'Разрешает вход администратору по паролю. Не выключайте единственный проверенный способ входа.',
        'Enables administrator password sign-in. Keep another verified sign-in method before disabling it.'
    ],
    'passkeySettings.enabled': [
        'Разрешает вход по настроенным passkeys в совместимом браузере. Сам переключатель не регистрирует ключ.',
        'Enables configured passkeys in compatible browsers. The switch alone does not register a key.'
    ],
    internalSquads: [
        'Сквады, разрешающие пользователю inbounds. В форме хоста это отдельное ограничение включения/исключения сквадов.',
        'Squads granting user inbound access. On a host this is a separate squad include/exclude restriction.'
    ],
    'internalSquads.squads': [
        'Список UUID сквадов для текущего режима включения/исключения на хосте.',
        'Squad UUID list for the current host include/exclude mode.'
    ],
    integrationUuids: [
        'Назначенные конфигурации интеграций ноды. Запись интеграции и назначение её ноде — разные действия.',
        'Assigned node integration configurations. Creating an integration and assigning it to a node are separate actions.'
    ],
    defaultSquadUuid: [
        'Внутренний сквад, добавляемый импортируемым пользователям как выбранное назначение. Используйте существующий сквад.',
        'Existing internal squad selected for imported users.'
    ],
    nodes: [
        'Выбранные ноды для связи/выдачи хоста. Нода должна иметь соответствующий профиль и активный inbound.',
        'Nodes associated with host delivery; each must run the matching profile and active inbound.'
    ],
    trafficLimitBytes: [
        'Общая квота подписки в байтах; 0 означает безлимит. В форме единицы отображаются отдельно. Лимиты хоста/тега не снимаются этим значением.',
        'Subscription quota in bytes; 0 means unlimited. The form displays units separately. Host/tag limits remain independent.'
    ],
    isTrafficTrackingActive: [
        'Включает учёт месячного расхода ноды с её порогом и датой сброса. Не является переключателем доступа пользователя.',
        'Enables node monthly traffic tracking with its threshold/reset day, not user access.'
    ],
    notifyPercent: [
        'Порог уведомления об использовании отслеживаемого трафика ноды в процентах. Сам порог не повышает квоту.',
        'Notification percentage threshold for tracked node usage. It does not increase allowance.'
    ],
    sni: [
        'Имя сервера для TLS/REALITY. Должно соответствовать настройке сервера и проверке сертификата.',
        'TLS/REALITY server name; it must match server configuration and certificate verification.'
    ],
    host: [
        'HTTP Host транспорта. Это не обязательно адрес TCP-подключения; учитывайте требования выбранного транспорта.',
        'Transport HTTP Host, which may differ from the TCP endpoint address.'
    ],
    path: [
        'Путь HTTP/WebSocket/XHTTP транспорта согласно серверному inbound. Не применяется одинаково ко всем протоколам.',
        'HTTP/WebSocket/XHTTP path matching the server inbound. Applicability varies by protocol.'
    ],
    alpn: [
        'Согласование прикладного протокола TLS. Выбирайте значения, поддерживаемые сервером и клиентом.',
        'TLS application protocol negotiation. Choose values supported by both server and client.'
    ],
    fingerprint: [
        'Клиентский TLS fingerprint для поддерживаемых клиентов. Не является pin сертификата.',
        'Client TLS fingerprint for supported clients, distinct from certificate pinning.'
    ],
    securityLayer: [
        'Переопределение слоя безопасности подключения. Должно быть совместимо с inbound и выбранным форматом клиента.',
        'Connection security-layer override compatible with the inbound and client format.'
    ],
    muxParams: [
        'JSON-параметры клиентского мультиплексирования для поддерживаемого генератора. Не включают mux на всех серверах автоматически.',
        'Client multiplexing JSON parameters for a supported generator; they do not enable mux on every server automatically.'
    ],
    sockoptParams: [
        'JSON-параметры сокета клиентского транспорта. Проверяйте поддержку ядром клиента и ОС.',
        'Client transport socket JSON options; check client core and OS support.'
    ],
    finalMask: [
        'Параметры маскировки транспорта в новой конфигурации Xray. Порядок обёрток и поддержка клиента имеют значение.',
        'New Xray transport masking configuration. Wrapper order and client support matter.'
    ],
    xhttpExtraParams: [
        'Дополнительные JSON-параметры XHTTP. Сверяйте их с настройками соответствующего серверного транспорта.',
        'Extra XHTTP JSON parameters; align them with the server transport.'
    ],
    vlessRouteId: [
        'Идентификатор маршрута VLESS для поддерживаемой конфигурации. Не заменяет UUID аккаунта или shortUuid подписки.',
        'VLESS routing identifier for supported configurations, separate from account UUID and subscription shortUuid.'
    ],
    serverDescription: [
        'Описание сервера в поддерживаемых клиентских форматах. Не каждый клиент отображает этот текст.',
        'Server description delivered in supported client formats; not every client displays it.'
    ],
    pinnedPeerCertSha256: [
        'SHA-256 pin сертификата сервера. Устаревший/неверный pin приводит к ошибке TLS; это не отключение проверки.',
        'Server certificate SHA-256 pin. A stale/incorrect pin causes TLS failure; it does not disable verification.'
    ],
    verifyPeerCertByName: [
        'Разрешённое имя при проверке сертификата сервера. Используйте значение, соответствующее сертификату.',
        'Allowed server certificate verification name; use a name matching the certificate.'
    ],
    mihomoX25519: [
        'Параметр совместимого клиента Mihomo для соответствующей схемы ключей REALITY. Не меняет ключ сервера автоматически.',
        'Compatible Mihomo REALITY key-scheme option; it does not rotate server keys automatically.'
    ],
    mihomoIpVersion: [
        'Выбор IP-версии подключения в поддерживаемом генераторе Mihomo.',
        'Connection IP-version choice in the supported Mihomo generator.'
    ],
    excludeFromSubscriptionTypes: [
        'Форматы подписки, из выдачи которых исключается этот хост. Исключение формата не удаляет хост.',
        'Subscription formats that exclude this host. Excluding a format does not delete the host.'
    ],
    xrayJsonTemplateUuid: [
        'UUID шаблона Xray JSON для соответствующего переопределения. Выберите существующий совместимый шаблон.',
        'Xray JSON template UUID for this override. Select an existing compatible template.'
    ],
    mapper: [
        'Правило преобразования/переопределения параметров в текущем формате шаблона. Проверяйте сгенерированный ответ после изменения.',
        'Mapping/override configuration for the current template format. Inspect generated output after changes.'
    ],
    intervalHours: [
        'Интервал автоматических резервных копий в часах: 1–168. Применяется только при включённом расписании.',
        'Scheduled backup interval in hours: 1–168; used only when scheduling is enabled.'
    ],
    retentionDays: [
        'Хранение резервных копий в днях: 1–7. Очистка по возрасту выполняется и при отключённом создании новых копий.',
        'Backup retention in days: 1–7. Age-based cleanup runs even when scheduled creation is off.'
    ],
    sendToTelegram: [
        'Включает отправку запланированных резервных копий в отдельно настроенный Telegram. Не включает общие уведомления панели.',
        'Enables scheduled backup delivery to separately configured Telegram, not general panel notifications.'
    ],
    telegramBotToken: [
        'Токен бота для отправки копий. Это секрет, а не API-токен панели; хранится в настройках защищённого раздела.',
        'Backup-delivery bot token, a secret distinct from the panel API token.'
    ],
    telegramChatId: [
        'Чат-получатель резервных копий. Бот должен иметь доступ к этому чату.',
        'Backup recipient chat; the bot must have access.'
    ]
}
