// Public help covers operator workflows. Deployment notes and developer/API
// implementation details must not reappear when the source catalogue grows.
export const panelArticleIds = [
    'architecture',
    'first-connection',
    'navigation',
    'overview',
    'users',
    'user-actions',
    'user-bulk',
    'user-import',
    'devices',
    'internal-squads',
    'external-squads',
    'nodes',
    'node-actions',
    'node-health',
    'node-ssh',
    'node-optimization',
    'core-management',
    'node-plugins',
    'node-statistics',
    'billing',
    'profiles',
    'xray-editor',
    'xera-transport',
    'canvases',
    'snippets',
    'keygen',
    'hosts',
    'host-overrides',
    'host-tags',
    'templates',
    'placeholders',
    'subscription-settings',
    'response-rules',
    'subscription-page',
    'limits',
    'limit-actions',
    'unlimited',
    'quota-periods',
    'hwid-inspector',
    'request-history',
    'sessions',
    'http-stats',
    'torrent-reports',
    'traffic-paths',
    'backups',
    'authentication',
    'api-tokens',
    'appearance',
    'notifications',
    'troubleshooting',
    'variable-syntax',
    'online-counts',
    'auth-methods',
    'subscription-request-path',
    'client-families',
    'support'
]

// Field help accompanies editable settings, rather than internal status cards.
export const panelFieldArticleIds = [
    'users',
    'user-bulk',
    'user-import',
    'devices',
    'nodes',
    'node-actions',
    'node-ssh',
    'billing',
    'profiles',
    'snippets',
    'hosts',
    'host-overrides',
    'host-tags',
    'subscription-settings',
    'subscription-page',
    'quota-periods',
    'backups',
    'authentication',
    'api-tokens'
]

// Each tuple is [RU heading, RU help, EN heading, EN help]. Section IDs stay
// stable for existing links, including sections whose wording has changed.
const edits = {
    architecture: [
        'С чего начать',
        'Getting started',
        [
            [
                'Основные разделы',
                'Пользователи — учётные записи и их доступ. Ноды — серверы подключения. Профили задают конфигурацию Xray, а хосты — адреса подключений в подписке. Внутренние сквады объединяют пользователей с разрешёнными входящими подключениями (inbound). Для первой настройки перейдите к статье «Первое рабочее подключение».',
                'Main sections',
                'Users are accounts and their access settings. Nodes are connection servers. Profiles define Xray configuration, while hosts define the connection addresses shown in subscriptions. Internal squads connect users to permitted inbound connections. For your initial setup, follow “First working connection”.'
            ],
            [
                'Что определяет доступ',
                'Для подключения нужны работающая нода, активный inbound профиля, доступный пользователю хост и внутренний сквад с разрешением на этот inbound. Дополнительно проверяются статус пользователя, срок подписки, квота трафика и ограничения устройств. Лимиты хостов и тегов действуют отдельно от общей квоты пользователя.',
                'What determines access',
                'A connection requires a working node, an active profile inbound, an available host and an internal squad permitting that inbound. User status, subscription expiry, traffic quota and device restrictions also apply. Host and tag limits are separate from the user’s overall quota.'
            ],
            [
                'Проверка изменений',
                'После сохранения проверьте обновлённые значения в карточке. Если подключение ещё работает с прежними настройками, проверьте состояние ноды, её журнал и обновите подписку в клиенте.',
                'Checking changes',
                'After saving, check the updated values in the detail view. If a connection still uses the previous settings, check node status and logs, then refresh the subscription in the client.'
            ]
        ]
    ],
    'core-management': [
        'Управление ядром ноды',
        'Node core management',
        [
            [
                'Выбор обновления',
                'В разделе управления ядром проверьте установленную версию и доступные варианты обновления. Выберите нужные ноды и совместимую версию. Обновление может временно прервать подключения на выбранных серверах.',
                'Choosing an update',
                'In core management, check the installed version and available updates. Select the required nodes and a compatible version. Updating may temporarily interrupt connections on those servers.'
            ],
            [
                'Результат операции',
                'Следите за состоянием задачи и журналом каждой ноды. Если доступна отмена, она относится к ещё выполняющейся задаче. После завершения проверьте версию ядра, состояние ноды и подключение тестового пользователя. Для работы лимитов хостов, тегов и отзыва устройств используйте совместимое ядро.',
                'Operation result',
                'Follow the task status and each node’s log. Where available, cancellation applies to a task still in progress. After completion, check the core version, node health and a test user connection. Host and tag limits and device revocation require a compatible core.'
            ]
        ]
    ],
    'xray-editor': [
        'Редактор конфигурации Xray',
        'Xray configuration editor',
        [
            [
                'Работа с конфигурацией',
                'Откройте профиль и отредактируйте JSON. Используйте подсветку, подсказки, поиск, форматирование и полноэкранный режим. Перед сохранением исправьте ошибки, отмеченные редактором, и запустите проверку конфигурации.',
                'Editing a configuration',
                'Open a profile and edit its JSON. Use highlighting, suggestions, search, formatting and full-screen mode. Before saving, resolve highlighted errors and run configuration validation.'
            ],
            [
                'Генерация shortId',
                'В окне «Инструменты» вкладка Short ID создаёт 16 hex-символов из 8 случайных байтов. Скопируйте значение в shortIds серверного realitySettings, а на клиенте используйте его как shortId. Кнопка «Сгенерировать» создаёт новое значение, но не меняет сохранённый профиль и не запускает ротацию.',
                'Generate a shortId',
                'The Short ID tab in Tools generates 16 hex characters from 8 secure random bytes. Copy the value into shortIds in the server realitySettings and use the same value as shortId on the client. Generate creates a new value without changing the saved profile or starting rotation.'
            ],
            [
                'Проверка перед применением',
                'Проверка конфигурации помогает найти ошибки формата и параметров. Дополнительно проверьте адреса, порты, ключи и пути к сертификатам на выбранных нодах. Возможности профиля должны поддерживаться установленным ядром и клиентом пользователя.',
                'Checks before applying',
                'Configuration validation helps identify format and parameter errors. Also check addresses, ports, keys and certificate paths on the selected nodes. The installed core and the user’s client must support the profile’s features.'
            ],
            [
                'После сохранения',
                'Изменение профиля затрагивает использующие его ноды. Проверьте их состояние и журнал, затем обновите подписку тестового пользователя и проверьте подключение. Для отдельного варианта конфигурации сначала клонируйте профиль.',
                'After saving',
                'Profile changes affect nodes using that profile. Check their status and logs, then refresh a test user’s subscription and verify connectivity. Clone the profile first when preparing a separate configuration variant.'
            ],
            [
                'Ключи X25519',
                'В окне «Инструменты» вкладка X25519 показывает password, publicKey и privateKey с отдельными кнопками копирования. password и publicKey содержат один публичный ключ — названия используются в разных версиях и клиентах. Приватный ключ укажите на сервере REALITY, публичный — в поддерживаемом клиентом поле. «Все значения» копирует три поля; генерация обновляет их вместе и не меняет сохранённый профиль.',
                'X25519 keys',
                'The X25519 tab in Tools shows password, publicKey and privateKey with separate copy buttons. password and publicKey contain the same public key; the names are used by different versions and clients. Set the private key on the REALITY server and the public key in the field supported by the client. All values copies the three fields. Generating updates them together without changing the saved profile.'
            ]
        ]
    ],
    'limit-actions': [
        'Выдача, сброс, блокировка и разблокировка',
        'Granting, resetting, blocking and unblocking',
        [
            [
                'Добавить трафик и сбросить расход',
                'Добавление трафика выдаёт разовую добавку к положительной постоянной квоте выбранного хоста или тега. Сброс начинает отсчёт расхода текущего периода заново, сохраняя историческую статистику. Он не отменяет персональный безлимит.',
                'Add traffic and reset usage',
                'Adding traffic grants a one-time addition to an existing positive quota for the selected host or tag. Resetting restarts the current period’s usage counter while retaining historical statistics. It does not revoke a personal unlimited allowance.'
            ],
            [
                'Блокировка и разблокировка',
                'Блокировка приостанавливает трафик выбранного хоста или тега для указанных получателей. Разблокировка снимает эту приостановку. Она не продлевает подписку, не включает отключённого пользователя и не добавляет трафик. Общая блокировка области и персональная блокировка пользователя учитываются вместе.',
                'Blocking and unblocking',
                'Blocking pauses traffic for the selected host or tag and recipients. Unblocking removes that pause. It does not extend a subscription, enable a disabled user or add traffic. A block affecting the entire scope and a personal user block apply together.'
            ],
            [
                'Выбор получателей',
                'Для одного пользователя выделите только его строку. Массовое действие можно применить к выбранным пользователям, всем текущим получателям с доступом или участникам указанного сквада. Поиск и текущая страница таблицы не ограничивают режим «Все» или «Сквад». Перед подтверждением проверьте режим и число получателей. Если результат неясен, обновите таблицу перед повторной выдачей трафика.',
                'Selecting recipients',
                'For one user, select only their row. A bulk action can target selected users, all current recipients with access or members of a chosen squad. Search and pagination do not restrict “All” or “Squad” mode. Check the mode and recipient count before confirming. If the result is unclear, refresh the table before granting more traffic.'
            ]
        ]
    ],
    backups: [
        'Резервные копии',
        'Backups',
        [
            [
                'Доступ и файлы',
                'Раздел доступен администратору. При входе введите пароль доступа к резервным копиям. Нажмите «Создать ZIP-копию» и дождитесь появления файла в списке. Скачивание сохраняет копию на компьютер; отправка передаёт её в настроенный Telegram; удаление убирает выбранную копию. Кнопка «Закрыть доступ» снова скрывает раздел.',
                'Access and files',
                'The section is available to administrators. Enter the backup access password when opening it. Click “Create ZIP backup” and wait for the file to appear in the list. Download saves a copy to your computer; send delivers it to the configured Telegram destination; delete removes the selected copy. “Lock access” hides the section again.'
            ],
            [
                'Автоматическое создание',
                'Включите автоматические копии, выберите период от 1 до 168 часов и хранение от 1 до 7 дней, затем сохраните настройки. Отключение останавливает создание новых автоматических копий; старые файлы продолжают удаляться по установленному сроку хранения.',
                'Automatic creation',
                'Enable automatic backups, select a period from 1 to 168 hours and retention from 1 to 7 days, then save. Disabling automation stops new scheduled backups; older files continue to expire according to the retention setting.'
            ],
            [
                'Отправка в Telegram',
                'Если нужна автоматическая отправка, включите её и заполните токен бота и ID чата или группы. Сохраните настройки и проверьте получение копии. Если создание или отправка завершились ошибкой, прочитайте сообщение панели; настройку сервера выполняет администратор установки.',
                'Telegram delivery',
                'For automatic delivery, enable it and enter the bot token and chat or group ID. Save the settings and check that a backup arrives. If creation or delivery fails, read the panel’s error message; server configuration is handled by the installation administrator.'
            ]
        ]
    ],
    notifications: [
        'Уведомления',
        'Notifications',
        [
            [
                'События панели',
                'Уведомления помогают следить за пользователями, состоянием нод и событиями сервиса. Используйте доступные настройки для выбора получателя и событий. Общие уведомления и отправка резервных копий в Telegram настраиваются отдельно.',
                'Panel events',
                'Notifications help track users, node health and service events. Use the available settings to select recipients and events. General notifications and Telegram backup delivery are configured separately.'
            ],
            [
                'Проверка доставки',
                'После изменения настроек проверьте получение уведомлений. Если сообщения не приходят, проверьте токен, адресата и доступ бота к чату. Ошибки доставки передайте администратору вместе с временем события и сообщением панели.',
                'Checking delivery',
                'After changing settings, verify that notifications arrive. If messages are missing, check the token, recipient and the bot’s access to the chat. Report delivery failures to the administrator with the event time and panel message.'
            ]
        ]
    ],
    'api-tokens': [
        'API-токены и права доступа',
        'API tokens and permissions',
        [
            [
                'Создание и изменение',
                'В настройках создайте отдельный токен для каждой интеграции. Укажите понятное имя, срок действия и необходимые права. После изменения прав сохраните токен. Удаление токена или окончание его срока прекращает доступ интеграции.',
                'Creating and editing',
                'Create a separate token for each integration in settings. Specify a clear name, expiry and required permissions. Save after changing permissions. Deleting a token or reaching its expiry stops the integration’s access.'
            ],
            [
                'Выбор прав',
                'Выдавайте права только на нужные разделы и действия. Чтение позволяет получать данные; изменение — выполнять разрешённые операции. Разрешение всех операций не открывает административные действия, недоступные API-токенам. Для выдачи безлимита требуется соответствующее право. Точный перечень методов и прав находится в отдельном справочнике API.',
                'Choosing permissions',
                'Grant access only to the required sections and actions. Read access retrieves data; write access permits the allowed changes. Access to all operations does not unlock administrative actions unavailable to API tokens. Granting unlimited traffic requires the corresponding permission. Exact methods and permissions are listed in the separate API reference.'
            ],
            [
                'Хранение токена',
                'Передавайте токен только доверенной интеграции. Если он раскрыт, удалите его и создайте новый. Название токена помогает определить, какой сервис использует доступ. Управление доступом конкретных клиентов выполняется в самой интеграции.',
                'Token handling',
                'Share the token only with a trusted integration. If exposed, delete it and create a replacement. The token name helps identify which service uses the access. Access for individual customers is managed by the integration itself.'
            ]
        ]
    ],
    appearance: [
        'Язык и оформление',
        'Language and appearance',
        [
            [
                'Настройка интерфейса',
                'Выберите язык панели и удобное оформление: светлую или тёмную тему, цвет акцента, шрифт, плотность и вариант навигации. Эти настройки меняют отображение интерфейса.',
                'Interface preferences',
                'Choose the panel language and a comfortable appearance: light or dark theme, accent color, font, density and navigation style. These settings change the interface presentation.'
            ],
            [
                'Уменьшение анимации',
                'Включите «Уменьшить анимацию», если предпочитаете спокойный интерфейс. Панель также учитывает соответствующую настройку устройства.',
                'Reducing motion',
                'Enable “Reduce motion” if you prefer a calmer interface. The panel also respects the equivalent device setting.'
            ]
        ]
    ],
    troubleshooting: [
        'Если что-то не работает',
        'Troubleshooting',
        [
            [
                'Не удаётся сохранить',
                'Прочитайте сообщение панели и проверьте обязательные поля. Если сеанс закончился, войдите снова. При отказе в доступе обратитесь к администратору. Если ошибка повторяется, сохраните её текст, время и описание действия для обращения в поддержку.',
                'Unable to save',
                'Read the panel message and check required fields. Sign in again if your session has expired. Contact the administrator if access is denied. If the error persists, record its text, time and the action you were taking for support.'
            ],
            [
                'Не работает подключение',
                '1. Проверьте статус пользователя и срок подписки.\n2. Проверьте общую квоту, лимиты хоста или тега и ограничения устройств.\n3. Убедитесь, что нужный inbound разрешён внутренним сквадом.\n4. Проверьте состояние ноды, профиль, хост и журнал.\n5. Обновите подписку в клиенте и повторите подключение.\nЕсли результат массовой операции неясен, проверьте состояние получателей перед повтором.',
                'Connection does not work',
                '1. Check user status and subscription expiry.\n2. Check the overall quota, host or tag limits and device restrictions.\n3. Ensure the internal squad permits the required inbound.\n4. Check node health, profile, host and logs.\n5. Refresh the subscription in the client and retry the connection.\nIf a bulk operation’s result is unclear, check recipient state before repeating it.'
            ]
        ]
    ]
}

const sectionHelp = {
    'users-1': [
        'Имя пользователя помогает отличать учётные записи. Email, Telegram ID, описание и тег используются для поиска и группировки. Доступ к подключениям задаётся внутренними сквадами.',
        'The username identifies an account. Email, Telegram ID, description and tag help with searching and grouping. Internal squads determine connection access.'
    ],
    'users-3': [
        'Перед сохранением проверьте сквады и срок подписки. Затем проверьте статус и дату в карточке. Подписка заканчивается в указанное время; цвет индикатора даты не меняет срок.',
        'Before saving, check squads and subscription expiry. Then verify the status and date in the detail view. A subscription ends at the specified time; the date indicator’s color does not change the expiry.'
    ],
    'user-import-1': [
        'Выберите JSON-файл экспорта с пользователями и при необходимости внутренний сквад для импортированных записей. Форма принимает до 20 000 пользователей. Проверьте количество созданных, пропущенных и неудачных записей: завершение импорта не означает, что добавлен каждый пользователь.',
        'Select an exported user JSON file and, if needed, an internal squad for the imported accounts. The form accepts up to 20,000 users. Check created, skipped and failed counts: completing the import does not mean every user was added.'
    ],
    'node-health-2': [
        'Журнал здоровья помогает найти время разрыва связи, ошибок применения и перезапуска. Лог Xray показывает сообщения ядра; его содержание зависит от настройки логирования. Сравнивайте время сообщений с изменениями профиля.',
        'The health log helps locate connection failures, application errors and restarts. The Xray log shows core messages; its contents depend on logging settings. Compare message timestamps with profile changes.'
    ],
    'node-ssh-2': [
        'SSH-терминал доступен для административной работы с сервером. Закрытие вкладки не гарантирует остановку запущенных команд. Проверяйте результат и состояние длительной операции перед повторным запуском.',
        'The SSH terminal supports administrative server work. Closing a tab does not guarantee that commands stop. Check the result and status of a long-running operation before starting it again.'
    ],
    'keygen-2': [
        'Выберите тип ключа, соответствующий шифру в конфигурации Shadowsocks-2022. Используйте согласованные параметры на сервере и в клиенте. Ключи для разных шифров не взаимозаменяемы.',
        'Choose the key type matching the cipher in your Shadowsocks-2022 configuration. Use matching parameters on the server and client. Keys for different ciphers are not interchangeable.'
    ],
    'host-tags-3': [
        'Изменение общих настроек тега действует на связанные хосты, у которых включено участие в квоте тега. Перед сохранением проверьте список хостов и выбранные ограничения. Для работы с получателями и персональными исключениями откройте «Лимиты».',
        'Changing shared tag settings affects associated hosts participating in the tag quota. Check the host list and chosen restrictions before saving. Open “Limits” to manage recipients and personal exceptions.'
    ],
    'subscription-page-2': [
        'После сохранения откройте страницу подписки тестового пользователя. Проверьте выбранный вариант, язык, ссылки приложений и отображение на телефоне. Ссылка подписки предоставляет доступ к данным пользователя; передавайте её только владельцу.',
        'After saving, open a test user’s subscription page. Check the chosen variant, language, application links and mobile layout. The subscription link gives access to the user’s data; share it only with its owner.'
    ],
    'limits-1': [
        'Выберите отдельный хост или тег, объединяющий хосты с общей квотой. Страница показывает области с квотой, ограничением скорости или блокировкой. Области без ограничений и блокировки скрыты.',
        'Select an individual host or a tag grouping hosts under a shared quota. The page shows scopes with a quota, speed restriction or block. Scopes without restrictions or a block are hidden.'
    ],
    'limits-3': [
        'Ищите пользователя по имени, идентификатору, email или Telegram ID. Используйте фильтры статуса, доступности и сквада, сортировку и размер страницы. Сообщение «Трафик заблокирован: N из M получателей» относится к выбранному режиму получателей, а не только к видимым строкам.',
        'Search by username, identifier, email or Telegram ID. Use status, availability and squad filters, sorting and page size. “Traffic blocked: N of M recipients” refers to the selected recipient mode, not only visible rows.'
    ],
    'overview-2': [
        'Откройте карточку состояния для подробностей. Если данные ещё не появились, дождитесь загрузки или нажмите обновление. Вращающийся значок означает, что запрос ещё выполняется.',
        'Open a status card for details. If data has not appeared, wait for loading or refresh. A spinning icon indicates that the request is still in progress.'
    ]
}

export function productionArticles(source) {
    return panelArticleIds
        .map((id) => {
            const article = source.find((entry) => entry.id === id)
            if (!article) throw new Error(`Missing panel help: ${id}`)
            const edit = edits[id]
            if (!edit?.[2]) return article
            return {
                ...article,
                ru: edit[0],
                en: edit[1],
                sections: edit[2].map(([ruTitle, ruBody, enTitle, enBody], index) => ({
                    id: `${id}-${index + 1}`,
                    ru: { title: ruTitle, body: ruBody },
                    en: { title: enTitle, body: enBody }
                }))
            }
        })
        .map((article) => {
            const sections =
                article.id === 'unlimited' ? article.sections.slice(0, 2) : article.sections
            return {
                ...article,
                sections: sections.map((section) => {
                    const help = sectionHelp[section.id]
                    if (!help) return section
                    return {
                        ...section,
                        ru: { ...section.ru, body: help[0] },
                        en: { ...section.en, body: help[1] }
                    }
                })
            }
        })
}
