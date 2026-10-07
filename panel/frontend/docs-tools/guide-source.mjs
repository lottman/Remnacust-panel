// Editorial source. Generated UI field descriptions and API contracts complement
// these workflows; they are never used as a substitute for explaining behavior.
export const categories = [
    { id: 'start', ru: 'Начало работы', en: 'Getting started', fa: 'شروع کار', zh: '入门' },
    {
        id: 'users',
        ru: 'Пользователи и доступ',
        en: 'Users and access',
        fa: 'کاربران و دسترسی',
        zh: '用户与访问'
    },
    {
        id: 'nodes',
        ru: 'Ноды и инфраструктура',
        en: 'Nodes and infrastructure',
        fa: 'نودها و زیرساخت',
        zh: '节点与基础设施'
    },
    {
        id: 'profiles',
        ru: 'Профили и Xray',
        en: 'Profiles and Xray',
        fa: 'پروفایل‌ها و Xray',
        zh: '配置与 Xray'
    },
    {
        id: 'subscriptions',
        ru: 'Хосты и подписки',
        en: 'Hosts and subscriptions',
        fa: 'هاست‌ها و اشتراک‌ها',
        zh: '主机与订阅'
    },
    {
        id: 'limits',
        ru: 'Лимиты трафика',
        en: 'Traffic limits',
        fa: 'محدودیت ترافیک',
        zh: '流量限制'
    },
    { id: 'tools', ru: 'Диагностика', en: 'Diagnostics', fa: 'عیب‌یابی', zh: '诊断' },
    {
        id: 'settings',
        ru: 'Настройки и сопровождение',
        en: 'Settings and operations',
        fa: 'تنظیمات و نگهداری',
        zh: '设置与维护'
    }
]
export const articles = []
export const add = (id, category, ru, en, sources, route, resources, sections) =>
    articles.push({
        id,
        category,
        ru,
        en,
        sources,
        route,
        resources,
        sections: sections.map(([ruTitle, ruText, enTitle, enText], index) => ({
            id: `${id}-${index + 1}`,
            ru: { title: ruTitle, body: ruText },
            en: { title: enTitle, body: enText }
        }))
    })

add(
    'architecture',
    'start',
    'Как устроена Remnacust',
    'How Remnacust works',
    ['src/pages/dashboard/home/'],
    '/dashboard/home',
    ['system'],
    [
        [
            'Панель, нода, профиль и хост',
            'Панель хранит пользователей, настройки и историю в PostgreSQL. Redis обслуживает кеш и очереди. Нода запускает наше ядро Xray и получает от панели конфигурацию и пользователей. Профиль содержит серверные inbounds, outbounds, DNS и маршрутизацию. Хост описывает адрес подключения, который получает клиент в подписке. Один профиль может использоваться на нескольких нодах; хост ссылается на конкретный inbound профиля.',
            'Panel, node, profile and host',
            'The panel stores users, settings and history in PostgreSQL. Redis provides caching and queues. A node runs our Xray core and receives configuration and accounts from the panel. A profile contains server inbounds, outbounds, DNS and routing. A host describes the connection delivered to the subscription client. Multiple nodes can share a profile; a host references one inbound in that profile.'
        ],
        [
            'Цепочка доступа',
            'Внутренний сквад связывает пользователя с разрешёнными inbounds. Нода должна запускать соответствующий профиль и inbound. Хост должен быть доступен этому пользователю и подходить под правила выдачи. Статус, срок подписки, общая квота, лимит устройства и политики хоста/тега проверяются отдельно. Настройка одного уровня не отменяет ограничения остальных.',
            'Access chain',
            'An internal squad grants a user access to inbounds. A node must run the corresponding profile and inbound. The host must be available to that user and eligible for delivery. Account status, expiry, subscription quota, device restrictions and host/tag policies are independent checks. Changing one layer does not bypass the others.'
        ],
        [
            'Сохранение и применение',
            'Успешное сохранение означает, что панель приняла настройки. Распространение пользователей и политик на ноды выполняется отдельно, в том числе через очередь. Проверяйте состояние ноды и журнал, если подключение ещё использует прежнюю конфигурацию. Публикация сборки latest сама по себе не обновляет работающие контейнеры.',
            'Saving and applying',
            'Successful saving means the panel accepted the settings. Accounts and policies are distributed to nodes separately, including through queues. Check node state and logs if a connection still uses an older configuration. Publishing a latest build does not update running containers by itself.'
        ]
    ]
)
add(
    'first-connection',
    'start',
    'Первое рабочее подключение',
    'First working connection',
    [],
    '/dashboard/management/nodes',
    ['nodes', 'config-profiles', 'hosts', 'users', 'internal-squads'],
    [
        [
            'Порядок настройки',
            '1. [Создайте профиль](/dashboard/management/config-profiles) с корректным inbound и уникальным tag.\n2. [Подключите ноду](/dashboard/management/nodes), выберите профиль и активируйте inbound.\n3. [Создайте внутренний сквад](/dashboard/management/internal-squads), разрешающий этот inbound.\n4. [Создайте хост](/dashboard/management/hosts) с адресом и портом, привяжите его к inbound.\n5. [Создайте активного пользователя](/dashboard/management/users), задайте срок и добавьте в сквад.\n6. Откройте [пользователя](/dashboard/management/users), скопируйте его ссылку подписки и импортируйте её в совместимый клиент.',
            'Setup order',
            '1. [Create a profile](/dashboard/management/config-profiles) with a valid inbound and a unique tag.\n2. [Connect a node](/dashboard/management/nodes), select the profile and activate the inbound.\n3. [Create an internal squad](/dashboard/management/internal-squads) granting that inbound.\n4. [Create a host](/dashboard/management/hosts) with its address and port, linked to the inbound.\n5. [Create an active user](/dashboard/management/users), set expiry and add the squad.\n6. Open the [user](/dashboard/management/users), copy their subscription URL and import it into a compatible client.'
        ],
        [
            'Если хоста нет в подписке',
            'Проверьте сквад, активность inbound на ноде, скрытие/отключение хоста, ограничения сквадов на хосте и пользовательский статус. Затем проверьте формат ответа и правила User-Agent. Наличие строки хоста в панели ещё не доказывает его доступность конкретному пользователю.',
            'If a host is missing',
            'Check squad membership, inbound activation on the node, host visibility/status, squad restrictions on the host and account status. Then check the delivered format and User-Agent response rules. A host existing in the panel does not prove that a particular user can access it.'
        ]
    ]
)
add(
    'navigation',
    'start',
    'Навигация, таблицы и массовый выбор',
    'Navigation, tables and selection',
    ['src/shared/ui/quick-launcher/', 'src/app/layouts/'],
    '/dashboard/tools/quick-open',
    [],
    [
        [
            'Перемещение по панели',
            'Боковое меню раскрывает категории. На телефоне оно открывается кнопкой меню; после выбора страницы закрывается. Быстрый переход ищет разделы, а «Открыть сущность» открывает известного пользователя, ноду, хост или профиль по идентификатору. Ссылки на документацию сохраняют выбранную статью или API-метод в URL.',
            'Moving around',
            'The sidebar expands categories. On a phone the menu button opens navigation, which closes after choosing a page. Quick launch finds sections; open entity resolves a known user, node, host or profile by identifier. Documentation links preserve the selected article or API operation in the URL.'
        ],
        [
            'Таблицы и выбор',
            'Используйте поиск, фильтры колонок, сортировку, размер страницы и управление видимостью колонок. Выбор строк и фильтр таблицы — разные вещи: перед массовым действием проверьте показанное число получателей. Для лимитов режим «Все» означает всех текущих получателей области, а не только видимую страницу или результаты поиска.',
            'Tables and recipients',
            'Use search, column filters, sorting, page size and column visibility. Row selection and table filtering are different concepts: review the recipient count before a bulk action. In limits, ALL targets all current entitled users of the scope, not just the visible page or search results.'
        ]
    ]
)
add(
    'overview',
    'start',
    'Главная: показатели и состояние',
    'Home: metrics and health',
    ['src/pages/dashboard/home/', 'src/widgets/dashboard/recap/'],
    '/dashboard/home',
    ['system', 'bandwidth-stats'],
    [
        [
            'Показатели',
            'Главная показывает трафик, текущие скорости, онлайн пользователей и нод, распределение пользовательских статусов и статистику активности. Объём переданных данных и скорость — разные величины. Онлайн сейчас, онлайн за день/неделю и «никогда не были онлайн» относятся к разным временным окнам и не обязаны совпадать.',
            'Metrics',
            'Home shows transferred traffic, current bandwidth, online users and nodes, account status totals and activity statistics. Transferred volume and bandwidth are different quantities. Online now, online today/week and never online describe different time windows and should not be expected to match.'
        ],
        [
            'Диагностика панели',
            'Карточки состояния открывают подробности памяти, процессов и окружения, если сервер возвращает эти данные. Пустое значение не равно нулю: дождитесь загрузки или проверьте доступность API. Обновление запрашивает свежие данные; вращающийся значок обозначает незавершённый запрос.',
            'Panel diagnostics',
            'Health cards open memory, process and environment details when the server supplies them. A missing value is not zero: wait for loading or check API connectivity. Refresh requests current data; a spinning icon marks a pending request.'
        ]
    ]
)
add(
    'users',
    'users',
    'Создание и редактирование пользователя',
    'Creating and editing users',
    ['src/shared/ui/forms/users/', 'src/features/dashboard/users/'],
    '/dashboard/management/users',
    ['users'],
    [
        [
            'Идентификация и контакты',
            'Имя пользователя отличает учётную запись от её числового ID, UUID и shortUuid. ID используется в ряде административных операций, shortUuid — в ссылке подписки. Email, Telegram ID, описание и пользовательский тег помогают искать и группировать записи. Они не заменяют внутренние сквады и сами по себе не дают доступ к inbound.',
            'Identity and contacts',
            'The username is separate from numeric ID, UUID and shortUuid. Administrative operations use different identifiers; shortUuid is used in subscription links. Email, Telegram ID, description and the user tag help locate and group accounts. They do not replace internal squads or grant inbound access by themselves.'
        ],
        [
            'Доступ и квота',
            'Задайте статус, срок окончания, общую квоту трафика, стратегию сброса, внутренние сквады и при необходимости внешний сквад. Общая квота со значением 0 означает безлимит подписки. Лимиты конкретных хостов и тегов остаются отдельными. Поля карточки ниже показывают точные названия параметров и подсказки текущей формы.',
            'Access and quota',
            'Set status, expiry, subscription traffic quota, reset strategy, internal squads and optionally an external squad. A subscription quota of 0 is unlimited. Host and tag quotas remain independent. The field reference below uses the exact names and help text from the current form.'
        ],
        [
            'Сохранение',
            'Сохраняйте только после проверки сквадов и срока. Закрытие формы не является подтверждением применения на каждой ноде. Статус и дата в карточке показывают сохранённые данные; истечение наступает в точный момент expireAt. Красный индикатор даты не переносит срок автоматически.',
            'Saving',
            'Review squads and expiry before saving. Closing the form is not confirmation that every node has applied the account. The card reflects saved status and expiry; expiration occurs at the exact expireAt instant. A red date indicator does not extend the subscription.'
        ]
    ]
)
add(
    'user-actions',
    'users',
    'Действия и карточка пользователя',
    'User actions and details',
    [
        'src/features/ui/dashboard/users/',
        'src/shared/ui/forms/users/forms-components/user-identification-card.tsx'
    ],
    '/dashboard/management/users',
    ['users', 'subscriptions', 'metadata', 'connections'],
    [
        [
            'Статусы и сбросы',
            'ACTIVE разрешает доступ при выполнении остальных проверок. DISABLED отключает пользователя; EXPIRED обозначает истёкший срок; LIMITED — исчерпанную общую квоту. Включение, отключение, сброс расхода и перевыпуск подписки — самостоятельные операции. Сброс общей статистики не следует считать сбросом всех квот хостов/тегов; для них используйте страницу «Лимиты».',
            'Status and resets',
            'ACTIVE allows access when other checks pass. DISABLED turns off the account, EXPIRED indicates expiry and LIMITED an exhausted subscription quota. Enable, disable, reset traffic and revoke/rotate a subscription are separate operations. Resetting subscription usage must not be treated as resetting every host/tag quota; use Limits for those scopes.'
        ],
        [
            'Кнопки карточки',
            'QR-код и ключи подключения помогают импортировать подписку. JSON показывает данные, метаданные — дополнительные свойства, подробности — сведения об аккаунте, ноды — размещение/доступ. Остальные кнопки открывают блокировку торрентов, историю запросов подписки, HWID-устройства и активные соединения. Наведите курсор или используйте доступное имя кнопки; на телефоне кнопки имеют увеличенную область нажатия.',
            'Card buttons',
            'QR and connection keys help import the subscription. JSON shows data, metadata exposes extra properties, details show account information and nodes show placement/access. Other buttons open torrent restrictions, subscription request history, HWID devices and active connections. Tooltips and accessible button names identify actions; touch controls have larger hit areas.'
        ],
        [
            'Ссылка и удаление',
            'Нажатие на поле подписки или кнопку копирования копирует URL. Справка рядом открывается нажатием и работает на телефоне. Ссылка содержит секрет доступа пользователя: не публикуйте реальную ссылку в документации. Удаление учётной записи удаляет пользователя; отключение оставляет запись для дальнейшего включения.',
            'Link and deletion',
            'Click the subscription field or copy button to copy its URL. The adjacent help opens on click and works on phones. The URL contains the user access secret: do not publish a real link in documentation. Deleting removes the account; disabling keeps it available for later reactivation.'
        ]
    ]
)
add(
    'user-bulk',
    'users',
    'Массовые операции с пользователями',
    'Bulk user operations',
    ['src/shared/ui/forms/users/bulk-', 'src/features/dashboard/users/'],
    '/dashboard/management/users',
    ['users'],
    [
        [
            'Изменение выбранных записей',
            'Выделите пользователей и выберите действие. При массовом редактировании подтверждение показывает только изменяемые поля: отсутствие поля означает «не менять», а null и 0 могут быть реальными новыми значениями. Подтверждение показывает имена полей запроса, например status и trafficLimitBytes, чтобы точно показать отправляемые параметры.',
            'Updating selected accounts',
            'Select users and choose an action. Bulk edit confirmation lists only changed fields: an omitted field means keep existing values, while null and 0 may be actual replacements. It shows request field names such as status and trafficLimitBytes so you can inspect the exact submitted parameters.'
        ],
        [
            'Проверка результата',
            'Изменение сквадов, трафика, срока, устройств или статуса затрагивает каждого получателя. Перед удалением убедитесь, что выбор корректен. Обновите список после завершения и проверьте сведения отдельного пользователя. Сетевой сбой не доказывает, что действие не выполнялось: сначала прочитайте актуальное состояние.',
            'Checking results',
            'Squad, traffic, expiry, device and status changes affect each recipient. Review selection before deleting. Refresh after completion and inspect an individual account. A network failure does not prove that no operation ran: read the current state before retrying a mutation.'
        ]
    ]
)
add(
    'user-import',
    'users',
    'Импорт и экспорт пользователей',
    'Importing and exporting users',
    ['src/widgets/dashboard/users/users-import/'],
    '/dashboard/management/users',
    ['users'],
    [
        [
            'Формат импорта',
            'Импорт принимает JSON с непустым массивом users; форма ограничивает его 20 000 записями. Выберите файл экспорта и при необходимости внутренний сквад, в который добавятся импортированные пользователи. Проверьте итоговые created, skipped и failed: завершение импорта не означает, что создана каждая строка.',
            'Import format',
            'Import accepts JSON with a non-empty users array; the form allows up to 20,000 records. Choose an export file and optionally an internal squad for imported users. Inspect created, skipped and failed counts: a completed import does not mean that every record was created.'
        ],
        [
            'Что переносится',
            'Экспорт/импорт пользователей не является резервной копией всей базы: он не восстанавливает профили, ноды, токены и все настройки панели. Сопоставление сквадов и конфликтов проверяйте по результату импорта. Не переносите секреты в публичный пример и не удаляйте исходные записи до проверки новой панели.',
            'What is transferred',
            'User export/import is not a full database backup: it does not restore profiles, nodes, tokens and all panel settings. Verify squad mapping and conflicts in the import result. Keep secrets out of public examples and validate the destination before removing source records.'
        ]
    ]
)
add(
    'devices',
    'users',
    'HWID: устройства, блокировка и регистрация',
    'HWID: devices, blocking and registration',
    [
        'src/shared/ui/forms/users/forms-components/device-tag-settings-card.tsx',
        'src/shared/_modals/users/user-hwid-devices-modal/',
        'src/features/dashboard/hwid'
    ],
    '/dashboard/management/users',
    ['hwid-user-devices'],
    [
        [
            'Лимит и регистрация',
            'HWID связывает запросы совместимого приложения с устройством. В настройках пользователя null использует резервный лимит, 0 отключает лимит, положительное число ограничивает количество устройств. Запрет новых устройств — отдельный переключатель: уже зарегистрированные разрешённые устройства продолжают работать, а размер лимита сохраняется при повторном разрешении регистрации.',
            'Limit and registration',
            'HWID links requests from a compatible application to a device. A null user limit uses the fallback, 0 disables the limit and a positive number caps device count. Forbidding new registrations is a separate switch: existing allowed devices continue working, and the configured limit is retained when registration is enabled again.'
        ],
        [
            'Удаление и блокировка',
            'Удаление убирает регистрацию устройства. Если регистрация разрешена, приложение может зарегистрироваться снова. Блокировка сохраняет запрет для HWID и отзывает доступ этого устройства; разблокировка снимает запрет. Кнопка «Удалить все незаблокированные» удаляет только незаблокированные устройства и не должна превращать удаление в блокировку.',
            'Deletion versus blocking',
            'Deleting removes a device registration. If registration is allowed, the client may register again. Blocking retains a ban for that HWID and revokes device access; unblocking removes the ban. Delete all unblocked devices only removes unblocked registrations and must not act as a blocking operation.'
        ],
        [
            'Условия работы',
            'Приложение должно отправлять поддерживаемые HWID-заголовки. Удалённая строка не равна запрету повторного входа. Для автоматизации используйте отдельные права регистрации, блокировки и разблокировки; обычное право чтения списка не даёт права блокировать.',
            'Requirements',
            'The application must send supported HWID headers. Removing a registration is not a permanent admission ban. Automation uses separate registration, blocking and unblocking scopes; listing devices does not grant blocking permission.'
        ]
    ]
)
add(
    'internal-squads',
    'users',
    'Внутренние сквады',
    'Internal squads',
    [
        'src/pages/dashboard/internal-squads/',
        'src/widgets/dashboard/internal-squads/',
        'src/features/ui/dashboard/internal-squads/'
    ],
    '/dashboard/management/internal-squads',
    ['internal-squads'],
    [
        [
            'Назначение',
            'Сквад — набор разрешённых inbounds и его пользователей. Создайте сквад, выберите inbounds и добавьте пользователей. Пользователь может состоять в нескольких внутренних сквадах. Изменение inbounds меняет предоставляемый доступ; настройка сквада не создаёт ноду или хост автоматически.',
            'Purpose',
            'A squad groups allowed inbounds and its users. Create it, choose inbounds and assign users. A user can join multiple internal squads. Changing inbounds changes granted access; a squad does not create nodes or hosts automatically.'
        ],
        [
            'Управление',
            'Карточка открывает участников, назначение inbounds, статистику и действия с группой. Экспорт участников переносит пользователей, а не весь сквад со всей инфраструктурой. Ограничения сквадов на хостах могут дополнительно включать или исключать хост; поэтому членство само по себе не гарантирует присутствие каждого хоста в подписке.',
            'Management',
            'The card opens members, inbound assignment, statistics and group actions. Exporting members transfers users rather than the entire squad infrastructure. Host squad restrictions may include or exclude a host, so membership alone does not guarantee every host appears in a subscription.'
        ]
    ]
)
add(
    'external-squads',
    'users',
    'Внешние сквады и варианты подписки',
    'External squads and subscription variants',
    [
        'src/pages/dashboard/external-squads/',
        'src/shared/_modals/external-squads/',
        'src/widgets/dashboard/external-squads/'
    ],
    '/dashboard/management/external-squads',
    ['external-squads'],
    [
        [
            'Назначение',
            'Внешний сквад задаёт отдельные параметры выдачи подписки для связанного пользователя: шаблоны, страницу подписки и доступные переопределения. Он не заменяет внутренние сквады, которые разрешают inbounds. Назначайте его пользователю после проверки настроек группы.',
            'Purpose',
            'An external squad supplies a subscription delivery variant for an assigned user, including templates, subscription page and supported overrides. It does not replace internal squads that authorize inbounds. Assign it only after reviewing the group settings.'
        ],
        [
            'Переопределения',
            'Изменение шаблонов или настроек внешнего сквада может менять выдачу всем его участникам. Сравнивайте действующую подписку конкретного пользователя с глобальными настройками: итог может зависеть от внешнего сквада. При удалении или смене группы проверьте дальнейшую выдачу.',
            'Overrides',
            'Changing external squad templates or settings can change delivery for all members. Compare an individual subscription with global settings because external squad overrides can affect the result. Verify delivery after deleting or changing the assigned group.'
        ]
    ]
)
add(
    'nodes',
    'nodes',
    'Добавление и настройка ноды',
    'Adding and configuring a node',
    ['src/shared/ui/forms/nodes/', 'src/pages/dashboard/nodes/'],
    '/dashboard/management/nodes',
    ['nodes'],
    [
        [
            'Подключение',
            'Нода — агент на сервере с нашим Xray. Создайте запись, укажите адрес и порт управления, настройте ключ/сертификаты связи и выберите профиль с активными inbounds. Управляющий порт ноды не равен клиентскому порту хоста. Проверьте доступность ноды с сервера панели и корректность параметров соединения.',
            'Connection',
            'A node is a server agent running our Xray. Create the record, set its management address/port, configure connection credentials and select a profile with active inbounds. The management port is separate from a host client port. Verify reachability from the panel server and correct connection parameters.'
        ],
        [
            'Поля и учёт',
            'Название, страна, теги и провайдер описывают инфраструктуру. Профиль и список inbounds определяют запускаемые подключения. Коэффициент расхода ноды влияет на учёт пользовательского трафика и не является скоростным лимитом. Отслеживание трафика, месячный порог, дата сброса и уведомления ноды относятся к расходу сервера, а не к личной квоте пользователя.',
            'Fields and accounting',
            'Name, country, tags and provider describe infrastructure. The profile and inbound list determine active services. A node consumption multiplier changes user traffic accounting and is not a bandwidth cap. Traffic tracking, monthly threshold, reset day and node notifications concern server usage rather than an individual user quota.'
        ]
    ]
)
add(
    'node-actions',
    'nodes',
    'Действия с нодами',
    'Node actions',
    ['src/features/ui/dashboard/nodes/', 'src/features/dashboard/nodes/multi-select-nodes/'],
    '/dashboard/management/nodes',
    ['nodes'],
    [
        [
            'Включение, перезапуск и сброс',
            'Включение/отключение управляет состоянием ноды в панели. Перезапуск повторно применяет работу Xray и может прервать текущие подключения. Сброс статистики расхода не является удалением пользователей или обновлением ядра. Удаление записи ноды не удаляет сервер у провайдера.',
            'Enable, restart and reset',
            'Enable/disable controls the node state in the panel. Restart reapplies Xray operation and can interrupt connections. Resetting usage statistics does not delete users or upgrade the core. Deleting a node record does not terminate the provider server.'
        ],
        [
            'Массовое изменение',
            'При выборе нескольких нод подтверждение показывает изменяемые поля. Перед сменой профиля проверьте, что на каждом сервере доступны нужные сертификаты, адреса listen и порты. После операции проверьте здоровье всех выбранных нод, а не только первой строки.',
            'Bulk update',
            'Selecting multiple nodes shows the changed fields in confirmation. Before switching profiles, verify certificates, listen addresses and ports on each server. After applying, inspect health on every selected node rather than only the first row.'
        ]
    ]
)
add(
    'node-health',
    'nodes',
    'Ресурсы, здоровье и журналы ноды',
    'Node resources, health and logs',
    [
        'src/shared/ui/forms/nodes/base-node-form/node-vitals.card.tsx',
        'src/widgets/dashboard/nodes/'
    ],
    '/dashboard/management/nodes',
    ['nodes'],
    [
        [
            'Состояние и ресурсы',
            'Карточка показывает доступность, онлайн, загрузку, память, скорости и расход. Подробное состояние включает CPU, диск, сеть, процессы и сведения Xray, если агент их возвращает. Версия панели, агента ноды и ядра Xray — отдельные версии. Пустые данные или сбой запроса не следует показывать как здоровую ноду с нулевой нагрузкой.',
            'State and resources',
            'The card shows availability, online count, load, memory, bandwidth and usage. Detailed runtime includes CPU, disk, network, processes and Xray details when supplied by the agent. Panel, node agent and Xray have separate versions. Missing data or a failed request is not a healthy node with zero load.'
        ],
        [
            'Журналы',
            'Журнал здоровья помогает установить момент разрыва связи, ошибок применения и перезапуска. Лог Xray показывает сообщения ядра, но доступность и объём зависят от настройки логирования. Используйте временные отметки и сравнивайте с изменениями профиля. Чтение логов по API требует отдельного права и не даёт права менять ядро.',
            'Logs',
            'Health history helps identify connectivity loss, apply errors and restart timing. Xray logs show core messages; availability and volume depend on logging settings. Correlate timestamps with profile changes. API log access has a separate scope and does not authorize core changes.'
        ]
    ]
)
add(
    'node-ssh',
    'nodes',
    'SSH-терминал ноды',
    'Node SSH terminal',
    ['src/features/ui/dashboard/nodes/open-node-ssh/', 'src/shared/_modals/nodes/'],
    '/dashboard/management/nodes',
    [],
    [
        [
            'Работа с сервером',
            'SSH-терминал открывает соединение с сервером по отдельно настроенным SSH-реквизитам. SSH-адрес и порт могут отличаться от параметров агента. Команда выполняется на выбранном сервере с правами SSH-пользователя; sudo требует соответствующих прав на сервере. Проверяйте ноду перед запуском команд.',
            'Server access',
            'The terminal connects using separately configured SSH credentials. Its address and port may differ from the node agent. Commands run on the selected server as the SSH user; sudo depends on server permissions. Verify the target node before running commands.'
        ],
        [
            'Доступ',
            'SSH относится к административным функциям панели и не выдаётся обычному API-токену. Закрытие браузерной вкладки не следует считать гарантией отмены всех запущенных на сервере процессов. Состояние длительной команды проверяйте на сервере.',
            'Access',
            'SSH is an administrator panel function and is not granted to ordinary API tokens. Closing a browser tab is not a guarantee that every server process has stopped. Check long-running command state on the server.'
        ]
    ]
)
add(
    'node-optimization',
    'nodes',
    'Оптимизация сервера ноды',
    'Node server optimization',
    ['src/shared/ui/forms/nodes/base-node-form/node-optimization.card.tsx'],
    '/dashboard/management/nodes',
    [],
    [
        [
            'Профили оптимизации',
            'Уровни none, safe, balanced и performance запускают встроенный сценарий через SSH-терминал. Это изменение настроек ОС сервера, а не лимит подписки. Рекомендация учитывает память: сервер с менее 2 GiB или занятостью памяти от 85% получает осторожный уровень safe; остальные — balanced.',
            'Optimization levels',
            'none, safe, balanced and performance launch the bundled script through the SSH terminal. They change server OS settings rather than subscription limits. Recommendations use memory: below 2 GiB or at least 85% memory usage suggests safe; other servers suggest balanced.'
        ],
        [
            'Проверка применения',
            'Кнопка проверки читает фактическое состояние сервера. Выбранный уровень и последний подтверждённый уровень могут различаться до завершения команды и проверки. Если проверка не подтвердила состояние, не считайте профиль применённым: откройте SSH и изучите вывод.',
            'Verifying application',
            'Check reads the actual server state. A chosen level can differ from the last verified level until the command and verification finish. If verification fails, do not assume success: inspect SSH output.'
        ]
    ]
)
add(
    'core-management',
    'nodes',
    'Управление нашим ядром Xray',
    'Managing our Xray core',
    ['src/features/dashboard/nodes/core-management/'],
    '/dashboard/management/nodes',
    [],
    [
        [
            'Совместимость',
            'Remnacust сохраняет наше расширенное ядро Xray на базе 26.9.30. Оно поддерживает политики хостов/тегов и отзыв устройств. Замена обычным ядром может убрать принудительное соблюдение этих политик. Управление ядром — отдельная административная операция; скачивание артефакта не равно успешному обновлению ноды.',
            'Compatibility',
            'Remnacust retains our extended Xray based on 26.9.30, including host/tag policies and device revocation. Replacing it with a stock core can remove policy enforcement. Core management is an administrator operation; downloading an artifact is not a successful node upgrade.'
        ],
        [
            'Задачи',
            'Каталог, состояние, создание задачи, журнал и отмена относятся к контроллеру управления ядром. Проверяйте поддержку выбранной операции текущей установкой и итог каждой ноды. Новая сборка панели не изменяет ядро на серверах автоматически. Встроенный редактор и генераторы клиента обновлены под те же возможности, но конкретный клиент должен поддерживать выбранный протокол.',
            'Jobs',
            'Catalog, state, job creation, history and cancellation belong to core management. Check operation support in the installed deployment and each node result. A new panel build does not replace server cores automatically. The editor and client generators track the same capabilities, but each client must support the selected protocol.'
        ]
    ]
)
add(
    'node-plugins',
    'nodes',
    'Плагины нод и общие списки',
    'Node plugins and shared lists',
    [
        'src/pages/dashboard/node-plugins/',
        'src/widgets/dashboard/node-plugins/',
        'src/features/dashboard/node-plugins/'
    ],
    '/dashboard/management/plugins',
    ['node-plugins'],
    [
        [
            'Конфигурация плагина',
            'Раздел β хранит конфигурации плагинов, их теги и назначение нодам. Создание, клонирование, редактирование, удаление, сортировка и синхронизация — отдельные действия. Редактор проверяет конфигурацию; несохранённые изменения защищены предупреждением при уходе. Сохранение не следует путать с запуском исполнителя.',
            'Plugin configuration',
            'The beta section stores plugin configurations, tags and node assignments. Create, clone, edit, delete, reorder and synchronize are distinct actions. The editor validates configuration and warns before leaving with unsaved changes. Saving is separate from executor operation.'
        ],
        [
            'Общие списки',
            'Shared lists позволяют нескольким конфигурациям ссылаться на один список. После изменения списка используйте предусмотренную синхронизацию и проверяйте назначенные ноды. Удаление или переименование используемого списка может затронуть несколько плагинов.',
            'Shared lists',
            'Shared lists let multiple configurations reference the same list. Synchronize after editing and check assigned nodes. Deleting or renaming a referenced list can affect several plugins.'
        ]
    ]
)
add(
    'node-statistics',
    'nodes',
    'Статистика и метрики нод',
    'Node statistics and metrics',
    [
        'src/pages/dashboard/statistic-nodes/',
        'src/pages/dashboard/nodes-metrics/',
        'src/widgets/dashboard/nodes-statistic/'
    ],
    '/dashboard/management/stats/nodes',
    ['nodes-usage-history', 'bandwidth-stats'],
    [
        [
            'История расхода',
            'Статистика показывает расход по нодам и временным периодам. Выберите диапазон и сравнивайте одинаковые интервалы. Мгновенная скорость не равна суточному расходу; сброс месячного счётчика не должен интерпретироваться как удаление всех исторических записей.',
            'Usage history',
            'Statistics show node usage across time ranges. Compare matching intervals. Instant bandwidth is not daily volume; resetting a monthly counter is not equivalent to deleting all historical records.'
        ],
        [
            'Метрики',
            'Страница метрик помогает сравнить загрузку и состояние нод. Недоступная нода может не отдавать свежие значения. Даты и доступный горизонт истории зависят от сохранённых сервером данных и настроек очистки; интерфейс не восстанавливает отсутствующие записи.',
            'Metrics',
            'The metrics page compares node load and health. An unreachable node may not return fresh values. Dates and available history depend on stored data and retention settings; the interface cannot reconstruct missing records.'
        ]
    ]
)
add(
    'billing',
    'nodes',
    'Провайдеры и расходы инфраструктуры',
    'Providers and infrastructure billing',
    [
        'src/pages/dashboard/crm/infra-billing/',
        'src/widgets/dashboard/infra-billing/',
        'src/shared/ui/forms/nodes/base-node-form/node-tracking-and-billing.card.tsx'
    ],
    '/dashboard/crm/infra-billing',
    ['infra-billing'],
    [
        [
            'Учёт серверов',
            'Создайте провайдера и привяжите к нему ноды. Задайте стоимость и срок/период оплаты в предусмотренных полях. Карточки и статистика собирают расходы инфраструктуры. Значок провайдера на ноде — метаданные учёта, а не способ авторизации на сервере.',
            'Server accounting',
            'Create a provider and assign nodes. Set cost and payment date/period using the available fields. Cards and statistics summarize infrastructure spending. The provider badge is accounting metadata rather than server authentication.'
        ],
        [
            'Даты и уведомления',
            'Дата оплаты помогает контролировать продление аренды. Запись оплаты или изменение даты в панели не совершает платёж провайдеру. Перед удалением провайдера проверьте связанные ноды и историю учёта.',
            'Dates and notifications',
            'Payment dates help track renewal. Recording payment or editing a date in the panel does not transfer money to the provider. Check linked nodes and accounting history before deleting a provider.'
        ]
    ]
)
add(
    'profiles',
    'profiles',
    'Конфигурационные профили',
    'Configuration profiles',
    [
        'src/pages/dashboard/config-profiles/',
        'src/widgets/dashboard/config-profiles/config-profile-card/',
        'src/widgets/dashboard/config-profiles/config-profiles-grid/'
    ],
    '/dashboard/management/config-profiles',
    ['config-profiles'],
    [
        [
            'Профиль сервера',
            'Профиль содержит полную конфигурацию Xray. Создайте его, добавьте inbounds с уникальными tag, настройте outbounds, маршрутизацию и DNS. Активируйте inbounds на нодах и разрешите их сквадам. Хост выбирает inbound именно этого профиля, поэтому смена или удаление tag влияет на связанные хосты.',
            'Server profile',
            'A profile contains the complete Xray configuration. Create it with uniquely tagged inbounds, outbounds, routing and DNS. Activate inbounds on nodes and grant them through squads. Hosts reference an inbound of that profile, so changing or removing its tag affects linked hosts.'
        ],
        [
            'Сохранение и клонирование',
            'Клонирование создаёт отдельный профиль для эксперимента; изменение исходного профиля может затронуть все использующие его ноды. Сервер проверяет конфигурацию независимо от редактора. Проверяйте здоровье нод после применения и не вставляйте постоянные пользовательские accounts вместо управляемых панелью.',
            'Save and clone',
            'Cloning creates a separate profile for experiments; editing the original can affect every assigned node. Server validation is independent of editor validation. Check node health after applying and avoid static accounts in place of panel-managed accounts.'
        ]
    ]
)
add(
    'xray-editor',
    'profiles',
    'Редактор Xray: проверка и новые возможности',
    'Xray editor: validation and new features',
    [
        'src/widgets/dashboard/config-profiles/config-editor/',
        'src/features/dashboard/config-profiles/monaco-setup/'
    ],
    '/dashboard/management/config-profiles',
    ['config-profiles'],
    [
        [
            'Инструменты редактора',
            'Редактор предоставляет подсветку, подсказки, ошибки схемы и проверку нашим WebAssembly-парсером Xray 26.9.30. Форматирование, поиск, полноэкранный режим и сохранение помогают работать с JSON. Сообщение об успешной проверке не проверяет доступность внешнего сервера, наличие файлов сертификатов или свободный порт на каждой ноде.',
            'Editor tools',
            'The editor provides highlighting, completions, schema errors and validation with our Xray 26.9.30 WebAssembly parser. Formatting, search, fullscreen and save assist JSON editing. Passing validation does not check remote reachability, certificate files or free ports on each node.'
        ],
        [
            'Генерация shortId',
            'В окне «Инструменты» вкладка Short ID создаёт 16 hex-символов из 8 случайных байтов. Скопируйте значение в shortIds серверного realitySettings, а на клиенте используйте его как shortId. Кнопка «Сгенерировать» создаёт новое значение, но не меняет сохранённый профиль и не запускает ротацию.',
            'Generate a shortId',
            'The Short ID tab in Tools generates 16 hex characters from 8 secure random bytes. Copy the value into shortIds in the server realitySettings and use the same value as shortId on the client. Generate creates a new value without changing the saved profile or starting rotation.'
        ],
        [
            'Протоколы и транспорт',
            'В обновлённом ядре есть MASQUE, XDRIVE, новые finalmask, XDNS, UDPHop и обновления TUN, Shadowsocks-2022, Hysteria и WireGuard. MASQUE требует подходящего транспорта и TLS. MASQUE/XDRIVE выдаются через поддерживаемый нативный Xray JSON; генераторы других клиентов исключают их, если не имеют совместимого представления.',
            'Protocols and transports',
            'The updated core includes MASQUE, XDRIVE, new finalmask, XDNS, UDPHop and updates to TUN, Shadowsocks-2022, Hysteria and WireGuard. MASQUE requires compatible transport and TLS. MASQUE/XDRIVE are delivered through supported native Xray JSON; other client generators exclude them where no compatible representation exists.'
        ],
        [
            'Миграция настроек',
            'Удалённый upstream параметр TLS allowInsecure не следует возвращать вместо проверки сертификата; используйте поддерживаемые проверки и pinning. Старые параметры WireGuard и TUN проверяйте по новой схеме. Freedom ограничивает частные назначения по умолчанию в новых правилах: необходимые локальные сервисы разрешайте явно и узко. Наличие автодополнения не гарантирует поддержку функции старым ядром на ноде.',
            'Migrating settings',
            'Do not restore removed upstream TLS allowInsecure instead of certificate verification; use supported verification and pinning. Check legacy WireGuard and TUN settings against the new schema. New Freedom defaults restrict private destinations: explicitly allow the local services you need. Completion support does not imply support by an older core installed on a node.'
        ],
        [
            'Ключи X25519',
            'В окне «Инструменты» вкладка X25519 показывает password, publicKey и privateKey с отдельными кнопками копирования. password и publicKey содержат один публичный ключ — названия используются в разных версиях и клиентах. Приватный ключ укажите на сервере REALITY, публичный — в поддерживаемом клиентом поле. «Все значения» копирует три поля; генерация обновляет их вместе и не меняет сохранённый профиль.',
            'X25519 keys',
            'The X25519 tab in Tools shows password, publicKey and privateKey with separate copy buttons. password and publicKey contain the same public key; the names are used by different versions and clients. Set the private key on the REALITY server and the public key in the field supported by the client. All values copies the three fields. Generating updates them together without changing the saved profile.'
        ]
    ]
)
add(
    'canvases',
    'profiles',
    'Визуальная схема профиля',
    'Visual profile canvas',
    [
        'src/pages/dashboard/config-profiles/components/profile-canvas',
        'src/pages/dashboard/config-profiles/connectors/profile-canvases'
    ],
    '/dashboard/management/canvases',
    ['config-profiles'],
    [
        [
            'Схема и JSON',
            'Canvas помогает видеть связи inbounds, outbounds и маршрутов профиля. Откройте схему нужного профиля и сверяйте изменения с JSON. Применённый JSON остаётся конфигурацией ядра: визуальное расположение блока само по себе не задаёт порядок правил.',
            'Canvas and JSON',
            'The canvas helps visualize a profile’s inbounds, outbounds and routes. Open the desired profile and compare edits with JSON. Applied JSON remains the core configuration: visual block placement alone does not determine rule order.'
        ],
        [
            'Проверка изменений',
            'После редактирования проверьте валидность и сохраните профиль, затем состояние назначенных нод. Сложные параметры, не представленные визуально, рассматривайте в редакторе; отсутствие блока на схеме не является указанием удалить соответствующий параметр JSON.',
            'Checking changes',
            'Validate and save profile edits, then inspect assigned node health. Review complex parameters in the JSON editor when the canvas does not expose them; an absent visual block is not a reason to remove its JSON parameter.'
        ]
    ]
)
add(
    'snippets',
    'profiles',
    'Сниппеты и синхронизация профилей',
    'Snippets and profile synchronization',
    ['src/widgets/dashboard/config-profiles/snippets/'],
    '/dashboard/management/config-profiles',
    ['snippets'],
    [
        [
            'Переиспользуемая конфигурация',
            'Сниппет хранит именованный фрагмент конфигурации. Создайте его, используйте в нужных профилях, затем редактируйте централизованно. Сохранение фрагмента и синхронизация его использования — отдельные шаги: подтверждение синхронизации позволяет распространить изменение.',
            'Reusable configuration',
            'A snippet stores a named configuration fragment. Create it, use it in profiles and edit it centrally. Saving the fragment and synchronizing its consumers are distinct steps; synchronization confirmation distributes the change.'
        ],
        [
            'Удаление',
            'После удаления интерфейс предлагает синхронизацию. Проверьте затронутые профили и ноды, поскольку ссылки на удалённый фрагмент могут потребовать изменения. Перед массовым применением проверьте итоговый JSON, а не только отдельный фрагмент.',
            'Deletion',
            'The interface offers synchronization after deleting a snippet. Check affected profiles and nodes because references may need changes. Validate the resulting JSON before broad application, not only the isolated fragment.'
        ]
    ]
)
add(
    'keygen',
    'profiles',
    'Генерация ключей и паролей',
    'Generating keys and passwords',
    ['src/widgets/dashboard/config-profiles/keypair-generator/'],
    '/dashboard/management/config-profiles',
    ['keygen'],
    [
        [
            'Ключевой материал',
            'Генератор создаёт поддерживаемые пары ключей и параметры для конфигурации. Публичный ключ можно передать клиенту, приватный должен оставаться на стороне сервера. Форматы разных протоколов не взаимозаменяемы. Сохраните обе согласованные части и проверяйте соответствие ключа выбранному inbound.',
            'Key material',
            'The generator creates supported key pairs and configuration parameters. Public keys can be delivered to clients; private keys must remain server-side. Formats for different protocols are not interchangeable. Preserve matching parts and check the key against the selected inbound.'
        ],
        [
            'Shadowsocks-2022',
            'Серверный ключ AES-128 имеет 16 байт, AES-256 — 32 байта до Base64-кодирования. Управляемые пользовательские ключи формирует панель/нода по правилам нашего ядра. Нельзя считать случайный UUID подходящим серверным ключом или вручную смешивать настройки разных cipher.',
            'Shadowsocks-2022',
            'AES-128 server keys contain 16 bytes and AES-256 keys 32 bytes before Base64 encoding. Panel/node generate managed user keys according to our core rules. A random UUID is not automatically a valid server key, and cipher settings must not be mixed arbitrarily.'
        ]
    ]
)
add(
    'hosts',
    'subscriptions',
    'Хосты: адреса и выдача клиенту',
    'Hosts: addresses and client delivery',
    ['src/pages/dashboard/hosts/', 'src/shared/ui/forms/hosts/'],
    '/dashboard/management/hosts',
    ['hosts'],
    [
        [
            'Основные параметры',
            'Remark — имя подключения в подписке. Address и port — клиентская точка подключения, inbound — серверные параметры из профиля. Настройки SNI, Host, path, ALPN и security уточняют TLS/транспорт; они должны соответствовать серверу. Назначение нод в хосте и выбор inbounds на ноде — разные настройки.',
            'Core parameters',
            'Remark names a subscription connection. Address and port are the client endpoint; inbound supplies server parameters from a profile. SNI, Host, path, ALPN and security customize TLS/transport and must match the server. Host node assignment and node inbound activation are separate settings.'
        ],
        [
            'Видимость и действия',
            'Скрытие влияет на выдачу, отключение — на доступность согласно политике. Ограничения внутренних сквадов задают включение или исключение. Клонирование создаёт новую запись с параметрами исходного хоста и выполняется без лишнего предупреждения о необратимом действии; удаление является отдельным действием. Сохранение хоста возвращает управление после принятия настроек, а политики распространяются отдельно.',
            'Visibility and actions',
            'Hiding affects delivery; disabling affects availability according to policy. Internal squad restrictions include or exclude access. Cloning creates another record from the original settings without an unnecessary irreversible-action prompt; deletion is separate. Saving returns control when settings are accepted, while policy synchronization happens separately.'
        ],
        [
            'Массовое изменение',
            'Выделите нужные хосты, выберите изменяемые поля и проверьте подтверждение. tags: [] очищает теги; isDisabled: false включает хост. Порядок хостов влияет на выдачу. Проверяйте подписку пользователя после смены inbound, тега, видимости или сквада.',
            'Bulk editing',
            'Select hosts, choose changed fields and inspect confirmation. tags: [] clears tags and isDisabled: false enables the host. Host order affects delivery. Check a user subscription after changing inbound, tags, visibility or squads.'
        ]
    ]
)
add(
    'host-overrides',
    'subscriptions',
    'Переопределения и правила хоста',
    'Host overrides and rules',
    [
        'src/shared/ui/forms/hosts/base-host-form/options/',
        'src/shared/ui/forms/hosts/base-host-form/host-limits-and-rules.tsx'
    ],
    '/dashboard/management/hosts',
    ['hosts'],
    [
        [
            'TLS, транспорт и клиент',
            'SNI выбирает имя TLS, overrideSniFromAddress подставляет адрес как SNI, fingerprint относится к клиентскому TLS. Host и path используются транспортом. Публичный pin сертификата, verifyPeerCertByName, параметры Mihomo X25519 и IP version поддерживаются только совместимыми клиентами. mux, sockopt, транспортные JSON-переопределения и serverDescription не следует переносить между форматами без проверки поддержки.',
            'TLS, transport and client',
            'SNI specifies the TLS name; overrideSniFromAddress derives it from the address, and fingerprint configures client TLS. Host and path are transport fields. Certificate pinning, verifyPeerCertByName, Mihomo X25519 and IP version require compatible clients. Verify format support before transferring mux, sockopt, transport JSON overrides or serverDescription settings.'
        ],
        [
            'Правила доменов',
            'OFF отключает дополнительный фильтр. ALLOW_ONLY разрешает только перечисленные назначения; DENY запрещает перечисленные. Это политика трафика хоста, а не условие User-Agent для получения подписки. Проверяйте доступность обязательных DNS/служебных назначений и возможности изоляции inbound.',
            'Domain rules',
            'OFF disables the additional filter. ALLOW_ONLY permits only listed destinations, while DENY blocks them. This is a host traffic policy rather than a User-Agent subscription delivery condition. Verify required DNS/service destinations and inbound isolation support.'
        ],
        [
            'Ротация SNI и shortId',
            'Включённая ротация использует заданный пул SNI и интервал в часах; shortIds обновляются при включённой опции. Диапазоны формы: интервал 1–8760 часов, количество shortId 1–10, длина 4–16. После ротации ноды применяют изменения; клиенту требуется актуальная подписка. Не включайте ротацию без корректного пула и совместимой серверной настройки.',
            'SNI and shortId rotation',
            'Rotation uses the configured SNI pool and hourly interval; shortIds rotate when enabled. Form ranges are 1–8760 hours, 1–10 shortIds and length 4–16. Nodes apply updated settings and clients need a refreshed subscription. Do not enable rotation without a valid pool and compatible server configuration.'
        ]
    ]
)
add(
    'host-tags',
    'subscriptions',
    'Теги хостов и общие настройки',
    'Host tags and shared settings',
    [
        'src/pages/dashboard/hosts/ui/components/host-tag-limits.card.tsx',
        'src/shared/ui/forms/hosts/base-host-form/host-limits-and-rules.tsx'
    ],
    '/dashboard/management/hosts',
    ['hosts'],
    [
        [
            'Тег и политика',
            'Тег группирует хосты. Само наличие тега не задаёт квоту: откройте настройки тега и сохраните её. Для хоста отдельно включаются наследование квоты тега, скорости пользователя и общей скорости. Эти переключатели независимы. Собственные ограничения хоста продолжают применяться вместе с включёнными ограничениями тегов.',
            'Tag and policy',
            'A tag groups hosts but does not create a quota by itself: configure and save the tag settings. Each host independently opts into tag quota, per-user bandwidth and shared bandwidth. These switches are independent, and host-specific limits still apply alongside enabled tag limits.'
        ],
        [
            'Скорость и коэффициент',
            'Квота тега объединяет расход пользователя на участвующих хостах. Скорость пользователя от тега применяется к каждому участвующему хосту отдельно; общая скорость тега делится между участвующим трафиком. Явный коэффициент хоста задаёт учёт, null выбирает наследование от тегов; собственная квота хоста при этом использует коэффициент 1 согласно настройке формы.',
            'Bandwidth and multiplier',
            'Tag quota combines a user’s usage across participating hosts. A tag per-user bandwidth cap applies independently on each participating host; shared tag bandwidth is shared across participating traffic. An explicit host multiplier controls accounting, while null selects tag inheritance; the host’s own quota then uses multiplier 1 as explained by the form.'
        ],
        [
            'Постоянные настройки',
            'Панель сохраняет настройки через внутренние panel-tag-limits. Удалённые публичные GET/PUT/DELETE /api/hosts/tag-limits не поддерживаются. Для внешней интеграции существуют операции страницы лимитов с отдельными правами; не выдавайте административный доступ ради изменения тегов.',
            'Persistent settings',
            'The panel saves settings through internal panel-tag-limits routes. The removed public GET/PUT/DELETE /api/hosts/tag-limits routes are unsupported. External integrations use limit operations with dedicated scopes; do not grant panel administrator access merely to manage tags.'
        ]
    ]
)
add(
    'templates',
    'subscriptions',
    'Шаблоны подписки и редакторы',
    'Subscription templates and editors',
    [
        'src/pages/dashboard/templates/',
        'src/widgets/dashboard/templates/',
        'src/features/dashboard/subscription-templates/'
    ],
    '/dashboard/templates',
    ['subscription-template'],
    [
        [
            'Форматы',
            'Отдельные шаблоны существуют для Xray JSON, Mihomo, Stash, Singbox и Clash. Выберите формат и шаблон, затем редактируйте его структуру. Шаблон клиента отличается от серверного профиля Xray. Генератор вставляет разрешённые хосты и пользовательские данные; неподдерживаемые новым протоколом форматы могут исключить соответствующие хосты.',
            'Formats',
            'Xray JSON, Mihomo, Stash, Singbox and Clash have separate templates. Choose a format/template and edit its structure. A client template is different from a server Xray profile. The generator inserts allowed hosts and user data; formats without protocol support may exclude incompatible hosts.'
        ],
        [
            'Проверка выдачи',
            'Создание, клонирование, переименование, сохранение и удаление управляют шаблонами. Перед удалением проверьте глобальные настройки и внешние сквады, использующие этот шаблон. Проверка редактора должна дополняться получением реальной подписки и импортом в клиент. Параметры маршрутизации клиента работают на клиенте, а серверные правила — на ноде.',
            'Checking delivery',
            'Create, clone, rename, save and delete manage templates. Before deleting, inspect global settings and external squads that reference the template. Complement editor validation with an actual subscription response and client import. Client routing runs in the client; server rules run on the node.'
        ]
    ]
)
add(
    'placeholders',
    'subscriptions',
    'Переменные {{…}} в именах и заголовках',
    'Variables {{…}} in names and headers',
    [
        'src/widgets/dashboard/subscription-settings/settings/cards/subscription-response-headers-card.widget.tsx'
    ],
    '/dashboard/management/subscription-settings',
    ['subscription-settings'],
    [
        [
            'Контекст подстановки',
            'Переменные заполняются при формировании ответа подписки для конкретного пользователя. Подставляйте только поддерживаемые имена; регистр и суффикс имеют значение. Системные значения, дата, расход и квота относятся к моменту выдачи, а не являются постоянно обновляемым элементом уже импортированного клиентского файла.',
            'Substitution context',
            'Variables are resolved when a subscription response is built for a particular user. Use supported names exactly: case and suffix matter. System values, dates, usage and quota describe response generation time, not continuously updating fields inside an already imported client file.'
        ],
        [
            'Трафик хоста и тега',
            '{{TRAFFICLOCATIONUSEDGB}}, {{TRAFFICLOCATIONUSEDMB}} и аналогичные LIMIT/LEFT возвращают число без единицы. Добавляйте GB/MB сами, если они нужны в тексте. Без TEG значения относятся к текущему хосту. Варианты с TEG относятся к контексту тега; если тег не назначен, используется хост. С RESETAT выводится момент сброса, а не число байтов. Точный каталог подстановок находится ниже.',
            'Host and tag traffic',
            '{{TRAFFICLOCATIONUSEDGB}}, {{TRAFFICLOCATIONUSEDMB}} and corresponding LIMIT/LEFT variants return numeric values without units. Add GB/MB yourself if desired. Without TEG the context is the current host. TEG variants use tag context and fall back to the host when no tag is assigned. RESETAT describes reset time rather than bytes. The exact supported variable catalog is listed below.'
        ],
        [
            'Пример',
            '`DE · {{TRAFFICLOCATIONLEFTGBTEG}} GB` показывает остаток в контексте тега. `{{TRAFFICLOCATIONUSEDMB}} MB` показывает расход хоста. Обычная квота подписки и квота конкретного местоположения различаются; выбирайте переменную по нужному счётчику.',
            'Example',
            '`DE · {{TRAFFICLOCATIONLEFTGBTEG}} GB` displays remaining tag-context quota. `{{TRAFFICLOCATIONUSEDMB}} MB` displays host usage. Subscription quota and location quota are distinct; choose the variable matching the desired counter.'
        ]
    ]
)
add(
    'subscription-settings',
    'subscriptions',
    'Глобальные настройки подписки',
    'Global subscription settings',
    ['src/pages/dashboard/subscription-settings/', 'src/widgets/dashboard/subscription-settings/'],
    '/dashboard/management/subscription-settings',
    ['subscription-settings'],
    [
        [
            'Выдача и заголовки',
            'Настройки задают заголовки ответа, описание/название подписки, интервал обновления, ссылки поддержки и шаблоны по умолчанию. HTTP-заголовки доставляются при запросе, а их отображение зависит от клиента. Custom remarks позволяют возвращать понятные записи для разных статусов. Настройка внешнего сквада может переопределять глобальную выдачу.',
            'Delivery and headers',
            'Settings control response headers, subscription name/description, update interval, support links and default templates. Headers are delivered with a request and their presentation depends on the client. Custom remarks provide understandable entries for account states. External squads may override global delivery.'
        ],
        [
            'HWID и действия',
            'Здесь настраиваются общие правила HWID и резервные значения, а индивидуальные ограничения хранятся у пользователя. Кнопки/действия в выдаче поддерживаются только совместимыми клиентами; они не заменяют административные права. Проверьте реальный ответ для активного, отключённого, истёкшего и ограниченного пользователя.',
            'HWID and actions',
            'Global HWID rules and fallback values live here; user-specific settings remain on the account. Delivered actions/buttons require compatible clients and do not replace administrator authorization. Test responses for active, disabled, expired and quota-limited accounts.'
        ]
    ]
)
add(
    'response-rules',
    'subscriptions',
    'Правила выдачи подписки',
    'Subscription response rules',
    ['src/pages/dashboard/response-rules/', 'src/widgets/dashboard/response-rules/'],
    '/dashboard/management/response-rules',
    ['subscription-settings'],
    [
        [
            'Условия и порядок',
            'Правило сопоставляет условия HTTP-запроса, например User-Agent, с типом ответа или шаблоном. Включение, порядок и операторы условий определяют итог. Список приложений на странице извлекается из положительных условий User-Agent включённых правил; это обзор, а не полный независимый whitelist.',
            'Conditions and order',
            'Rules match HTTP request conditions, such as User-Agent, to response types or templates. Enabled state, order and condition operators determine the result. The application list extracts positive User-Agent conditions from enabled rules; it is an overview rather than an independent complete allowlist.'
        ],
        [
            'Ответы и тестирование',
            'Правила могут выбрать формат, блокировать запрос, вернуть 404/451 или закрыть соединение. Тестируйте через инструмент matcher с точными заголовками клиента. Обработка списка, отрицательных операторов и приоритета должна проверяться по итоговому результату. Ошибка JSON или недоступный шаблон требует исправления до сохранения.',
            'Responses and testing',
            'Rules can select a format, block a request, return 404/451 or drop the connection. Test the matcher with the client’s actual headers. Verify negative operators, list matching and priority using the resulting decision. Fix invalid JSON or template references before saving.'
        ]
    ]
)
add(
    'subscription-page',
    'subscriptions',
    'Страницы подписки',
    'Subscription pages',
    [
        'src/pages/dashboard/subpage-config/',
        'src/widgets/dashboard/subpage-configs/',
        'src/features/ui/dashboard/subpage-configs/'
    ],
    '/dashboard/subpage',
    ['subscription-page-configs'],
    [
        [
            'Конфигурации страницы',
            'Конфигурация определяет внешний вид и содержание страницы подписки: тексты, приложения, инструкции и поддерживаемые параметры. Создавайте варианты и назначайте их пользователям/внешним сквадам предусмотренным способом. Это конфигурация страницы, а не профиль сервера и не самостоятельный лимит трафика.',
            'Page configurations',
            'A configuration defines subscription page presentation and content, including text, applications, instructions and supported options. Create variants and assign them using the supported user/external-squad settings. It is neither a server profile nor an independent traffic limit.'
        ],
        [
            'Публикация',
            'Сохранённая конфигурация используется совместимой страницей подписки при обращении за данными. Проверьте назначение, язык, ссылки приложений и отображение на телефоне. Не публикуйте чужой shortUuid или реальную ссылку пользователя как пример. Для интеграции страницы используйте серверный API-токен с нужными правами.',
            'Delivery',
            'A compatible subscription page consumes the saved configuration when fetching data. Verify assignment, language, application links and phone layout. Do not publish another user’s shortUuid or real subscription URL as an example. Page integration should use a server-held API token with necessary scopes.'
        ]
    ]
)
add(
    'limits',
    'limits',
    'Лимиты: области и таблица пользователей',
    'Limits: scopes and user table',
    ['src/pages/dashboard/limits/'],
    '/dashboard/management/limits',
    ['limits'],
    [
        [
            'Что отображается',
            'Область HOST — один хост, TAG — группа хостов с участием в квоте тега. Страница показывает области с квотой, скоростным ограничением либо приостановкой, чтобы сохранить возможность снять блокировку. Полностью безграничные и не приостановленные области скрыты. Серверный GET /api/limits возвращает каталог областей; фильтр страницы применяется отдельно.',
            'Displayed scopes',
            'HOST represents one host; TAG represents hosts participating in a tag quota. The page shows scopes with a quota, bandwidth cap or pause so that pauses remain reversible. Fully unlimited, unpaused scopes are hidden. GET /api/limits returns the scope catalog; the page applies its visibility filter separately.'
        ],
        [
            'Столбцы',
            'Таблица показывает пользователя, расход/эффективную квоту, остаток, разовую добавку и состояние доступа. baseLimitBytes — постоянная квота, bonusBytes — персональная добавка, limitBytes — действующая квота; 0 в limitBytes означает безлимит. usedBytes продолжает считаться при персональном безлимите. paused и accessNow — разные признаки: отсутствие доступа может объясняться другими ограничениями.',
            'Columns',
            'The table shows user, usage/effective quota, remaining allowance, one-time bonus and access state. baseLimitBytes is the persistent quota, bonusBytes the personal addition and limitBytes the effective quota; 0 means unlimited. usedBytes still accumulates for personally unlimited users. paused and accessNow differ: other restrictions may deny access.'
        ],
        [
            'Поиск и статус',
            'Поиск работает по имени, ID, shortUuid, email и Telegram ID. Доступны фильтры статуса, доступности и сквада, сортировка и страницы 25/50/100. Статус «Трафик заблокирован: N из M получателей» относится к текущему режиму получателей, а не только отфильтрованным строкам. Он обновляется отдельно от таблицы.',
            'Search and state',
            'Search matches username, ID, shortUuid, email and Telegram ID. Status, access state and squad filters, sorting and 25/50/100 pagination are available. Traffic blocked: N of M recipients refers to the current recipient mode, not merely filtered rows. It refreshes independently of the table.'
        ]
    ]
)
add(
    'limit-actions',
    'limits',
    'Выдача, сброс, блокировка и разблокировка',
    'Grant, reset, pause and resume',
    ['src/pages/dashboard/limits/traffic-block-action.ts'],
    '/dashboard/management/limits',
    ['limits'],
    [
        [
            'ADD и RESET',
            'ADD добавляет выбранному получателю разовую квоту в текущей области; сначала должна существовать постоянная положительная квота. RESET меняет точку отсчёта расхода текущего периода и не удаляет историческую статистику. Он не отменяет персональный безлимит. При смене периода действуют правила периода, а не простое удаление всех записей пользователя.',
            'ADD and RESET',
            'ADD grants a one-time quota addition in the selected scope and requires an existing positive base quota. RESET changes the usage baseline for the current period without deleting historical statistics. It does not revoke personal unlimited access. Period changes follow quota window rules rather than deleting all user records.'
        ],
        [
            'PAUSE и RESUME',
            'PAUSE приостанавливает трафик области для выбранного режима получателей; сервер заранее проверяет возможность изоляции используемых inbounds. RESUME снимает эту приостановку, но не продлевает срок подписки, не включает отключённого пользователя и не добавляет квоту. Блокировка всего scope и личная блокировка пользователя учитываются совместно.',
            'PAUSE and RESUME',
            'PAUSE pauses scope traffic for the selected recipient mode; the server first verifies inbound isolation support. RESUME removes that pause but does not extend subscriptions, enable disabled users or grant quota. Scope-wide and personal pauses are considered together.'
        ],
        [
            'Получатели и повтор',
            'SELECTED принимает 1–500 уникальных числовых ID строками. Один ID — один пользователь. ALL включает всех текущих имеющих доступ, SQUAD — текущих участников внутреннего/внешнего сквада с доступом. Поиск и пагинация не ограничивают ALL/SQUAD. Неизвестный или не имеющий доступа выбранный ID отменяет операцию целиком. Идентичный повтор с тем же requestId безопасен; другое тело с тем же ID даёт 409.',
            'Recipients and replay',
            'SELECTED accepts 1–500 unique numeric IDs as strings; one ID targets one user. ALL includes current entitled users, and SQUAD current entitled internal/external squad members. Search and pagination do not constrain ALL/SQUAD. An unknown or ineligible selected ID rejects the entire operation. An identical requestId replay is safe; a different body with the same ID returns 409.'
        ]
    ]
)
add(
    'unlimited',
    'limits',
    'Персональный и массовый безлимит',
    'Personal and bulk unlimited quota',
    [],
    '/dashboard/management/limits',
    ['limits'],
    [
        [
            'Выдача и отмена',
            '«Выдать безлимит» сохраняет персональное исключение для выбранного хоста/тега. Оно действует до явной отмены, переживает перезапуск и смену периода. Постоянные настройки области остаются прежними. «Отменить безлимит» возвращает текущую базовую квоту с существующей добавкой. Для выдачи одному человеку выберите только его строку.',
            'Grant and revoke',
            'Grant unlimited saves a personal exemption for the selected host/tag. It persists until explicitly revoked, across restarts and period changes. Scope settings remain unchanged. Revoke unlimited restores the current base quota with existing bonus allowance. To grant it to one person, select only that user.'
        ],
        [
            'Границы действия',
            'Безлимит снимает только квоту этой области. Приостановка, скорость, срок, статус, HWID и другие области продолжают действовать; статистика расхода сохраняется. Массовая выдача относится к текущим получателям: будущие пользователи и будущие участники сквада её не наследуют.',
            'Boundaries',
            'Unlimited exempts only that scope’s quota. Pauses, bandwidth caps, expiry, status, HWID and other scopes still apply; usage remains recorded. Bulk grants target current recipients; future users and future squad members do not inherit them.'
        ],
        [
            'API и права',
            'Используйте POST /api/limits/unlimited с enabled: true/false и новым requestId для каждой новой операции. Требуется limits:unlimited либо более широкое право limits:write, limits:* или *. limits:actions само по себе не разрешает безлимит. Не пытайтесь отправить UNLIMITED в обычный actions: этот маршрут принимает только ADD/RESET/PAUSE/RESUME.',
            'API and scopes',
            'Use POST /api/limits/unlimited with enabled: true/false and a new requestId for each different operation. It requires limits:unlimited or limits:write, limits:* or *. limits:actions alone does not authorize unlimited quota. Do not submit UNLIMITED to ordinary actions, which accepts only ADD/RESET/PAUSE/RESUME.'
        ]
    ]
)
add(
    'quota-periods',
    'limits',
    'Периоды, коэффициенты и скорость',
    'Periods, multipliers and bandwidth',
    ['src/shared/ui/forms/hosts/base-host-form/host-limits-and-rules.tsx'],
    '/dashboard/management/hosts',
    ['hosts', 'limits'],
    [
        [
            'Разные ограничения',
            'Пользовательская квота — объём данных. Скорость пользователя хоста — ограничение одного пользователя, общая скорость — разделяемый предел. Коэффициент меняет списываемый объём, но не скорость соединения. Несколько применимых ограничений работают вместе; безлимит одной квоты не отключает остальные.',
            'Distinct restrictions',
            'A user quota is data volume. Host per-user bandwidth caps one user, while shared bandwidth is a common cap. The multiplier changes charged volume rather than connection speed. Applicable restrictions operate together; unlimited status in one quota does not disable the others.'
        ],
        [
            'Сброс периода',
            'Для хоста/тега задаётся интервал сброса в днях или месяцах; 0 означает отсутствие автоматического сброса. Период привязан к сохранённой опорной дате настройки. Изменение коэффициента пересчитывает текущий учёт области по правилам политики и не меняет обычный счётчик подписки. До смены периода проверяйте текущую квоту, добавки и расход.',
            'Period reset',
            'Host/tag reset intervals use days or months; 0 means no automatic reset. The quota window uses the saved configuration anchor date. Changing a multiplier recalculates current scope accounting under policy rules without changing ordinary subscription usage. Inspect current allowance, bonus and usage before changing a period.'
        ]
    ]
)
add(
    'hwid-inspector',
    'tools',
    'Инспектор HWID',
    'HWID inspector',
    ['src/pages/dashboard/hwid-inspector/', 'src/widgets/dashboard/hwid-inspector/'],
    '/dashboard/tools/hwid-inspector',
    ['hwid-user-devices'],
    [
        [
            'Обзор устройств',
            'Инспектор объединяет информацию об устройствах, приложениях и платформах, показывает распределение и список пользователей. Это диагностический обзор зарегистрированных данных: HWID может отсутствовать у несовместимого клиента. Поиск и фильтры помогают найти запись, а действия конкретного пользователя открываются в его карточке.',
            'Device overview',
            'The inspector aggregates devices, applications and platforms, with distributions and user lists. It describes registered data; incompatible clients may supply no HWID. Search and filters locate entries; account-specific management is available in the user card.'
        ],
        [
            'Интерпретация',
            'Название ОС и приложения поступает из клиентских заголовков и не является гарантированной аппаратной идентификацией. Не считайте отсутствие устройства доказательством отсутствия соединений. Для блокировки используйте отдельное действие HWID и проверяйте владельца.',
            'Interpretation',
            'OS and application names come from client headers and are not guaranteed hardware identity. Missing device records do not prove there are no connections. Use the dedicated HWID blocking action and verify ownership.'
        ]
    ]
)
add(
    'request-history',
    'tools',
    'История запросов подписки',
    'Subscription request history',
    ['src/pages/dashboard/srh-inspector/', 'src/widgets/dashboard/srh-inspector/'],
    '/dashboard/tools/srh-inspector',
    ['user-subscription-request-history'],
    [
        [
            'Что хранится',
            'История показывает обращения за подпиской: пользователя, время, адрес, клиентские заголовки и результат в доступных полях. Это запросы конфигурации, а не весь интернет-трафик через прокси. Карточка пользователя открывает его историю, глобальный инспектор помогает сравнивать запросы и искать ошибки выдачи.',
            'What is recorded',
            'History shows subscription fetches, with user, time, address, client headers and outcome where recorded. These are configuration requests, not all internet traffic through the proxy. The user card opens account history; the global inspector helps compare requests and diagnose delivery.'
        ],
        [
            'Если история пустая',
            'Проверьте, обращался ли клиент за подпиской, настройки записи SRH и очистку истории. Кеш клиента может уменьшать число запросов. История не проверяет сама по себе, установилось ли соединение после импорта.',
            'Empty history',
            'Check whether the client fetched its subscription and whether SRH recording or retention is disabled. Client caching may reduce requests. A fetch record alone does not confirm successful proxy connection after import.'
        ]
    ]
)
add(
    'sessions',
    'tools',
    'Активные соединения и сброс сессий',
    'Active connections and dropping sessions',
    ['src/pages/dashboard/sessions-explorer/', 'src/widgets/dashboard/sessions-explorer/'],
    '/dashboard/tools/sessions-explorer',
    ['connections'],
    [
        [
            'Запрос состояния',
            'Выберите пользователя или ноду и запустите сбор соединений. Некоторые операции создают задачу, после чего интерфейс получает её результат: список не является мгновенным снимком всей инфраструктуры. Группировка по IP и нодам помогает найти активность и географию в пределах доступных данных.',
            'Collecting state',
            'Choose a user or node and collect connections. Some operations create a job whose result is fetched afterward; the list is not an instantaneous snapshot of the entire infrastructure. IP/node grouping helps inspect activity and geography in the available data.'
        ],
        [
            'Принудительное закрытие',
            'Drop connections закрывает текущие соединения выбранной цели. Это не блокировка учётной записи: разрешённый клиент может переподключиться. Для долговременного запрета используйте статус пользователя, блокировку HWID или приостановку соответствующей области. После сброса запросите новый снимок.',
            'Dropping connections',
            'Drop connections closes current sessions for the selected target. It does not disable the account: an allowed client can reconnect. For persistent denial use account status, HWID blocking or the relevant quota scope pause. Collect another snapshot after dropping sessions.'
        ]
    ]
)
add(
    'http-stats',
    'tools',
    'HTTP-статистика',
    'HTTP statistics',
    ['src/pages/dashboard/http-stats/', 'src/widgets/dashboard/http-stats/'],
    '/dashboard/tools/http-stats',
    ['system'],
    [
        [
            'Назначение',
            'Страница показывает статистику HTTP-обращений, которую собирает сервер, и помогает увидеть загруженные маршруты и ошибки. Это метрики панели; они не заменяют расход трафика нод и не являются списком сайтов пользователя. Проверяйте фильтры и период перед сравнением показателей.',
            'Purpose',
            'The page displays HTTP request statistics collected by the server, helping identify busy routes and errors. These are panel metrics rather than node usage or a list of user browsing destinations. Review filters and time range before comparing results.'
        ],
        [
            'Пустые и устаревшие данные',
            'Если сбор отключён или сервер перезапущен, набор данных может быть пустым либо иметь короткий период. Повтор запроса обновляет отображение, но не восстанавливает несобранную статистику.',
            'Missing or old data',
            'Disabled collection or a server restart may leave no data or a short history. Refresh updates the display but cannot reconstruct statistics that were never collected.'
        ]
    ]
)
add(
    'torrent-reports',
    'tools',
    'Блокировка торрентов и отчёты',
    'Torrent restrictions and reports',
    [
        'src/pages/dashboard/torrent-blocker-reports/',
        'src/widgets/dashboard/torrent-blocker-reports/'
    ],
    '/dashboard/tools/torrent-blocker-reports',
    ['node-plugins'],
    [
        [
            'Политика и отчёт',
            'Функция требует соответствующего механизма/плагина на ноде и настроек пользователя. Переключатель в карточке пользователя задаёт политику, отчёты показывают зарегистрированные события. Отсутствие отчёта не доказывает отсутствие попыток, если сбор или плагин не работает.',
            'Policy and reports',
            'The feature requires the corresponding node mechanism/plugin and account settings. The user card switch sets policy; reports show recorded events. No reports do not prove there were no attempts if collection or the plugin is unavailable.'
        ],
        [
            'Проверка',
            'Проверьте назначение плагина, синхронизацию на нодах и временной диапазон отчётов. Не путайте действие блокировки торрентов с отключением всего аккаунта или с удалением HWID.',
            'Verification',
            'Check plugin assignment, synchronization and the report range. Torrent restrictions are separate from disabling the entire account or deleting HWID registrations.'
        ]
    ]
)
add(
    'traffic-paths',
    'tools',
    'Путь трафика пользователя',
    'User traffic paths',
    ['src/widgets/dashboard/nodes/traffic-paths/'],
    '/dashboard/management/nodes',
    ['system'],
    [
        [
            'Связи доступа',
            'Выберите пользователя, затем хост. Инструмент показывает связанный профиль, ноды, inbounds, outbounds и применимые правила, помогая объяснить, куда может попасть трафик. Фильтры выделяют доступные, отключённые, скрытые или ограниченные хосты.',
            'Access relationships',
            'Choose a user and host to inspect linked profiles, nodes, inbounds, outbounds and applicable rules. Filters highlight available, disabled, hidden or quota-limited hosts.'
        ],
        [
            'Ограничение модели',
            'Схема строится из настроек панели и не является трассировкой каждого сетевого пакета. Реальный результат зависит от DNS, маршрутизации ядра, доступности назначения и состояния ноды. Для фактического сбоя дополняйте её журналами и активными соединениями.',
            'Model limitations',
            'The diagram is built from panel configuration rather than tracing each packet. Actual behavior depends on DNS, core routing, destination availability and node health. Use logs and active sessions to investigate a real failure.'
        ]
    ]
)
add(
    'backups',
    'settings',
    'Резервные копии: создание и хранение',
    'Backups: creation and retention',
    ['src/pages/dashboard/backups/'],
    '/dashboard/management/backups',
    [],
    [
        [
            'Доступ и файлы',
            'Раздел доступен администратору и дополнительно разблокируется паролем на время посещения. Создание формирует защищённый ZIP с дампом PostgreSQL. Скачивание сохраняет файл на компьютер; «Отправить» отправляет его в настроенный Telegram; удаление убирает выбранную копию. Старые незашифрованные копии можно перевести в защищённый формат предусмотренной миграцией.',
            'Access and files',
            'Backups require administrator access and a password unlock for the page visit. Create produces a protected ZIP containing a PostgreSQL dump. Download saves a local file; Send delivers it to configured Telegram; Delete removes the selected backup. The migration action converts supported legacy plaintext backups to the protected format.'
        ],
        [
            'Расписание',
            'Автоматическое создание по умолчанию выключено. Включите его вручную и выберите интервал 1–168 часов и хранение 1–7 дней. Значение DAILY в серверной модели означает включённый планировщик с выбранным intervalHours, а не обязательно ровно сутки. Отключение останавливает новые автоматические копии; очистка старых файлов по сроку продолжает выполняться.',
            'Schedule',
            'Automatic creation defaults to off. Enable it manually and choose 1–168 hours between backups and 1–7 days retention. DAILY in the server model means the scheduler is enabled with intervalHours, not necessarily exactly one day. Turning it off stops new scheduled backups; age-based cleanup still runs.'
        ],
        [
            'Условия автоматизации',
            'Автоматическая копия требует настроенного зашифрованного пароля на сервере. Планировщик ориентируется на последнюю запланированную ZIP-копию, а не на каждую ручную копию. Пути хранения задаются контейнерным mount и XERA_BACKUPS_DIR/XERA_PLAIN_DUMPS_DIR; папка dumps на хосте должна быть действительно смонтирована. Не считайте файл внутри несохраняемого контейнера надёжной копией.',
            'Automation requirements',
            'Scheduled backups require an encrypted password configured on the server. The scheduler uses the last scheduled ZIP, not every manual backup. Container mounts and XERA_BACKUPS_DIR/XERA_PLAIN_DUMPS_DIR determine storage; a host dumps directory must actually be mounted. A file in an ephemeral container is not durable backup storage.'
        ]
    ]
)
add(
    'backup-restore',
    'settings',
    'Восстановление из резервной копии',
    'Restoring a backup',
    [],
    '/dashboard/management/backups',
    [],
    [
        [
            'Подготовка',
            'В панели нет универсальной кнопки восстановления поверх работающей базы. Скачайте нужную копию, проверьте пароль и содержимое, сохраните текущую базу перед заменой. ZIP содержит дамп PostgreSQL; импорт users.json не заменяет восстановление базы. Используйте совместимую версию PostgreSQL и подходящую версию схемы панели.',
            'Preparation',
            'The panel has no universal restore-over-live-database button. Download the backup, verify its password/content and preserve the current database before replacing it. ZIP contains a PostgreSQL dump; importing users.json is not equivalent to restoring the database. Use a compatible PostgreSQL version and panel schema.'
        ],
        [
            'Проверка после восстановления',
            'Восстановление выполняется средствами PostgreSQL в выбранную базу с остановкой конфликтующих записей приложения. Сохраните необходимые ключи окружения для зашифрованных данных. После запуска проверьте администратора, пользователей, сквады, профили, ноды и настройки расписания. Подключения нод перепроверьте; база не содержит все файлы и состояние ОС серверов.',
            'After restoration',
            'Restore with PostgreSQL tools into the intended database while preventing conflicting application writes. Preserve required environment keys for encrypted data. After startup verify administrator access, users, squads, profiles, nodes and scheduling settings. Recheck node connections: the database does not include every server file or OS setting.'
        ]
    ]
)
add(
    'authentication',
    'settings',
    'Вход, правила и сеансы администратора',
    'Login, terms and administrator sessions',
    ['src/pages/auth/', 'src/widgets/remnawave-settings/authentification-settings-card/'],
    '/dashboard/management/settings',
    [],
    [
        [
            'Методы входа',
            'Настройки поддерживают пароль, доступные OAuth2-провайдеры и passkeys. Включайте только настроенные способы; изменение кнопки входа не настраивает провайдера автоматически. Ключ passkey создаётся в совместимом браузере/устройстве. Административная сессия и API-токен предназначены для разных сценариев.',
            'Sign-in methods',
            'Settings support password, configured OAuth2 providers and passkeys. Enable only configured methods; changing a login button does not configure the provider automatically. Passkeys require a compatible browser/device. Administrator sessions and API tokens serve different purposes.'
        ],
        [
            'Правила и выход',
            'Если правила панели ещё не приняты, переход на другие страницы принудительно возвращает на главную до принятия. Выход завершает текущую сессию; удаление/отзыв сеанса относится к административной авторизации и не отключает подписки всех пользователей. Не отключайте единственный рабочий метод входа без другого проверенного способа.',
            'Terms and sign-out',
            'Until panel terms are accepted, navigation to other pages returns to Home. Sign-out ends the current administrator session; revoking an admin session does not disable every subscription user. Do not disable the only working sign-in method without another verified method.'
        ]
    ]
)
add(
    'api-tokens',
    'settings',
    'API-токены и права доступа',
    'API tokens and permissions',
    ['src/widgets/remnawave-settings/api-tokens-card/'],
    '/dashboard/management/settings',
    [],
    [
        [
            'Создание и редактирование',
            'В настройках создайте отдельный токен с именем, сроком и минимальными правами. Редактирование имени и scopes не продлевает его срок и не требует перевыпуска JWT. Права считываются сервером при следующих запросах. Удаление токена или истечение срока прекращает доступ.',
            'Create and edit',
            'In settings create a token with a name, expiry and minimal scopes. Editing its name/scopes does not extend expiry or require a replacement JWT. The server reads current permissions on subsequent requests. Deletion or expiration revokes access.'
        ],
        [
            'Уровни прав',
            '`resource:operation` разрешает конкретный метод, `resource:read` чтение, `resource:write` изменение, `resource:*` группу, `*` весь разрешённый токенам каталог. Даже * не выдаёт административные функции панели: SSH, бекапы и изменение прав токенов остаются закрыты. Пустой scopes не даёт доступ. Право read/write определяется метаданными операции, а не только её HTTP-глаголом.',
            'Scope levels',
            '`resource:operation` allows one operation, `resource:read` reads, `resource:write` writes, `resource:*` the resource and `*` the whole token-eligible catalog. Even * does not grant panel-only SSH, backups or token-permission management. Empty scopes grant no access. Read/write classification follows operation metadata rather than HTTP verb alone.'
        ],
        [
            'Граница интеграции',
            'Scopes ограничивают операции, а не владельца пользователя/хоста. Сервер бота или личного кабинета должен проверить принадлежность запрошенного ID своему клиенту. API-токен хранится на сервере интеграции. Примеры в справочнике содержат только заглушки и не выполняют запрос автоматически.',
            'Integration boundary',
            'Scopes authorize operations, not ownership of an account or host. A bot or customer portal server must verify requested IDs belong to its authenticated customer. Store API tokens on the integration server. Reference examples contain placeholders and do not execute requests automatically.'
        ]
    ]
)
add(
    'appearance',
    'settings',
    'Тема, язык и анимации',
    'Theme, language and motion',
    ['src/shared/ui/appearance/'],
    '/dashboard/home',
    [],
    [
        [
            'Персональные настройки',
            'Выберите светлую/тёмную тему, цвет акцента, шрифт, плотность и вариант навигации в настройках оформления. Они меняют отображение интерфейса и не являются настройками ядра или прав доступа. Язык меняет подписи, статусы и формат даты; технические имена полей API остаются неизменными.',
            'Personal settings',
            'Appearance controls light/dark mode, accent, font, density and navigation layout. They affect presentation rather than core behavior or authorization. Language changes labels, statuses and date formatting; technical API field names remain unchanged.'
        ],
        [
            'Анимации и телефон',
            'Наведение подчёркивает интерактивные элементы. После короткой задержки иконка немного увеличивается и притягивается к курсору; нажатие вдавливает её, а отпускание возвращает с пружинным отскоком. Кнопка сохраняет своё положение и область нажатия. Обновление вращает значок до завершения, переходы и меню плавно открываются. «Уменьшить анимацию» и системное prefers-reduced-motion отключают декоративное движение. На сенсорном экране притяжение не используется, а обратная связь нажатия сохраняется, если анимации разрешены.',
            'Motion and phones',
            'Hover highlights interactive controls. After a short delay, an icon grows slightly and moves toward the cursor; pressing sinks it inward and releasing produces a spring rebound. The button keeps its position and hit area. Refresh spins until completion, and pages/menus transition smoothly. Reduce motion and OS prefers-reduced-motion suppress decorative motion. Touch uses press feedback without cursor attraction when motion is enabled.'
        ]
    ]
)
add(
    'branding',
    'settings',
    'Брендинг панели',
    'Panel branding',
    ['src/widgets/remnawave-settings/branding-settings-card/'],
    '/dashboard/management/settings',
    ['remnawave-settings'],
    [
        [
            'Название и оформление',
            'Брендинг задаёт отображаемое название и поддерживаемые элементы фирменного оформления. Название в заголовке страницы берётся из сохранённых branding settings либо из Remnacust по умолчанию. Настройка меняет интерфейс, но не переименовывает протоколы, поля API и таблицы базы.',
            'Name and appearance',
            'Branding controls the displayed name and supported brand elements. Page titles use saved branding settings or Remnacust by default. It changes presentation rather than protocol names, API fields or database tables.'
        ],
        [
            'Проверка',
            'Проверьте главную, вход, заголовки страниц и телефон после сохранения. Ссылки/изображения должны быть доступны клиентскому браузеру; сохранённый URL недоступного изображения не создаёт файл на сервере.',
            'Verification',
            'Check Home, login, page titles and phone layout after saving. Linked images must be reachable by the client browser; saving an unavailable URL does not create the image file on the server.'
        ]
    ]
)
add(
    'notifications',
    'settings',
    'Telegram, webhook и события',
    'Telegram, webhooks and events',
    [],
    '/dashboard/management/settings',
    [],
    [
        [
            'События',
            'Сервер может отправлять уведомления о пользователях, нодах, инфраструктуре, сервисных событиях и блокировке торрентов через настроенные интеграции. Telegram-настройки общих событий и отправка бекапов на странице копий — отдельные конфигурации. Их включение требует корректного токена, адресата и сетевой доступности.',
            'Events',
            'The server can send user, node, infrastructure, service and torrent events through configured integrations. General Telegram notifications and backup delivery use separate settings. Enabling them requires valid credentials, a recipient and network reachability.'
        ],
        [
            'Webhook и потоки',
            'Webhook отправляет события настроенному серверному получателю. Redis-потоки, если включены, экспортируют поддерживаемые события для внешнего потребителя. Уведомление о сохранении не гарантирует успешную доставку webhook/Telegram: проверяйте журналы очередей и ответ получателя. Подробные типы событий и схемы есть в OpenAPI.',
            'Webhooks and streams',
            'Webhooks deliver events to the configured server. Enabled Redis streams export supported events for external consumers. Saving a setting does not guarantee successful webhook/Telegram delivery; inspect queue logs and recipient responses. OpenAPI includes supported event payload models.'
        ]
    ]
)
add(
    'backend-tools',
    'settings',
    'Очереди, Swagger и Scalar',
    'Queues, Swagger and Scalar',
    ['src/widgets/remnawave-settings/backend-tools-card/'],
    '/dashboard/management/settings',
    [],
    [
        [
            'Инструменты',
            'В настройках кнопки открывают просмотр очередей, Swagger или Scalar. Панель получает одноразовый билет для входа; на iOS открывает адрес в текущем окне, на остальных системах — отдельную вкладку. Доступность инструментов зависит от серверных настроек. Новый встроенный справочник документации читает статический контракт и не требует включать интерактивные docs.',
            'Tools',
            'Settings open the queue viewer, Swagger or Scalar using a one-time sign-in ticket. iOS navigates the current window; other systems open a tab. Availability depends on server configuration. The new built-in reference reads a static contract and does not require enabling interactive server docs.'
        ],
        [
            'Очереди и ошибки',
            'Очередь распределяет фоновые операции по нодам и уведомлениям. Перед повтором провалившейся задачи выясните причину и возможность повторного эффекта. Успех HTTP-сохранения не равен завершению каждой фоновой задачи; проверяйте результат операции и состояние нужной ноды.',
            'Queues and errors',
            'Queues distribute node operations and notifications. Before retrying a failed job, identify its cause and whether repetition duplicates side effects. A successful save request does not mean every background job completed; inspect the job result and target node state.'
        ]
    ]
)
add(
    'deployment',
    'settings',
    'Установка, обновление и самостоятельная сборка',
    'Installation, updates and standalone builds',
    [],
    '/dashboard/home',
    [],
    [
        [
            'Компоненты установки',
            'Панель требует PostgreSQL, Redis, переменные окружения, постоянные тома и HTTPS-прокси. Ноды разворачиваются отдельно и подключаются к панели. Бинарник нашего Xray включается в воспроизводимую сборку ноды. Панель и нода не требуют обязательной привязки к частному файловому хосту или его токенам.',
            'Deployment components',
            'The panel requires PostgreSQL, Redis, environment configuration, persistent volumes and an HTTPS reverse proxy. Nodes deploy separately and connect to it. Our Xray binary is included in reproducible node builds. Panel and node do not require binding to the private artifact host or its tokens.'
        ],
        [
            'Обновление',
            'Перед обновлением сохраните базу, конфигурацию и ключи окружения. Соберите/получите совместимые панель, ноду и ядро, примените предусмотренные миграции и пересоздайте выбранные контейнеры. Проверяйте вход, профиль, ноду, подписку, HWID и лимиты после обновления. Документация привязана к исходникам сборки и должна пересобираться вместе с контрактом API.',
            'Update',
            'Preserve the database, configuration and environment keys before updating. Build or obtain compatible panel/node/core versions, apply their migrations and recreate the intended containers. Verify login, profiles, nodes, subscriptions, HWID and limits afterward. Documentation is tied to build source and should be regenerated with the API contract.'
        ]
    ]
)
add(
    'troubleshooting',
    'settings',
    'Ошибки и диагностика',
    'Errors and troubleshooting',
    [],
    '/dashboard/home',
    [],
    [
        [
            'HTTP-ошибки',
            '400 — неверные параметры/валидация, 401 — отсутствующая или недействительная авторизация, 403 — недостаточное право/роль, 404 — неизвестная сущность, 409 — конфликт, включая повтор requestId с другим телом. 5xx требует проверки серверного журнала, базы, Redis и доступности нод; 503 не исправляется выдачей лишних прав токену.',
            'HTTP errors',
            '400 means invalid input/validation, 401 missing or invalid authentication, 403 insufficient scope/role, 404 an unknown resource and 409 a conflict, including a reused requestId with a different body. For 5xx inspect server logs, database, Redis and node connectivity; granting extra token scopes is not a fix for 503.'
        ],
        [
            'Порядок проверки',
            '1. Прочитайте точный ответ запроса и текущее состояние сущности.\n2. Проверьте права и идентификатор.\n3. Проверьте профиль, сквады, статус/срок и лимиты.\n4. Посмотрите очередь и журнал ноды.\n5. Получите подписку в нужном формате и обновите клиент.\nНе повторяйте выдачу добавочного трафика новым requestId, пока не выяснили, была ли первая операция сохранена.',
            'Investigation order',
            '1. Read the exact response and current resource state.\n2. Check permission and identifier.\n3. Review profile, squads, status/expiry and quotas.\n4. Inspect queues and node logs.\n5. Fetch the correct subscription format and refresh the client.\nDo not retry a traffic bonus using a new requestId until you know whether the first request was saved.'
        ]
    ]
)

add(
    'api-start',
    'start',
    'API: подключение и идентификаторы',
    'API: connection and identifiers',
    [],
    '/dashboard/documentation/api',
    [],
    [
        [
            'Заголовки',
            'Запросы направляются на домен панели: https://panel.example.com/api/… . Для интеграции передайте Authorization: Bearer <API_TOKEN>, Accept: application/json и Content-Type: application/json для JSON-тела. Публичная подписка, вход, метрики Prometheus и административные маршруты имеют собственные требования; справочник отмечает тип доступа каждого метода.',
            'Headers',
            'Send requests to the panel domain: https://panel.example.com/api/… . Integrations use Authorization: Bearer <API_TOKEN>, Accept: application/json and Content-Type: application/json for JSON bodies. Public subscriptions, sign-in, Prometheus metrics and administrator operations have distinct requirements; the reference marks each operation’s access type.'
        ],
        [
            'Идентификаторы',
            'Не смешивайте numeric ID, UUID, shortUuid, имя тега и HWID. Справочник показывает тип параметра конкретного маршрута. Счётчики байтов в лимитах передаются строками, чтобы сохранять точность; amountBytes при выдаче — положительное целое число в безопасном диапазоне JavaScript. Расход, остаток и скорость используют разные единицы.',
            'Identifiers',
            'Do not mix numeric ID, UUID, shortUuid, tag name and HWID. The reference shows each route parameter type. Limit byte counters use decimal strings to preserve precision; amountBytes for grants is a positive integer within JavaScript’s safe range. Usage, remaining allowance and bandwidth use different units.'
        ],
        [
            'Примеры и контракт',
            'Выберите метод в отдельном справочнике API: доступны параметры, вложенные схемы, ответы, требуемое право и копирование cURL. Заглушки заменяются вашими данными; пример не выполняется из браузера. Схема describe показывает документированный контракт, а сервер может дополнительно проверять связи, доступ получателей и состояние ядра.',
            'Examples and contract',
            'Select an operation in the separate API reference to inspect parameters, nested schemas, responses, required scope and copyable cURL. Replace placeholders with your data; examples never execute in the browser. Schemas describe the published contract; the server additionally validates relationships, recipient access and core state.'
        ]
    ]
)
