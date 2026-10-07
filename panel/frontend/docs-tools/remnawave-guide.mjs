import { add } from './guide-source.mjs'

// Upstream concepts are checked against docs.rw; routes and extra behavior refer
// to this fork's source. Keep upstream links visible so readers can compare.
add(
    'upstream-map',
    'start',
    'Remnawave и особенности Remnacust',
    'Remnawave and Remnacust',
    [],
    '/dashboard/home',
    [],
    [
        [
            'Что общее',
            'Панель, ноды, пользователи, внутренние и внешние сквады, профили, хосты и подписки используют модель Remnawave. Начните с [официального быстрого старта](https://docs.rw/learn/quick-start/), затем используйте статьи этого руководства для интерфейса текущей сборки.',
            'Shared model',
            'Panel, nodes, users, internal/external squads, profiles, hosts and subscriptions follow the Remnawave model. Start with the [official quick start](https://docs.rw/learn-en/quick-start/), then use this guide for the current build.'
        ],
        [
            'Что проверять в нашей версии',
            'Здесь есть собственное ядро Xray, лимиты хостов и тегов, персональный безлимит, резервные копии и другие расширения. Официальный сайт описывает Remnawave, но эти дополнительные действия следует проверять в нашем справочнике API и по состоянию ноды. Не переносите инструкции другой версии на действующий сервер без сравнения схем.',
            'Check this build',
            'This build adds a custom Xray core, host/tag limits, personal unlimited quotas, backups and other extensions. Upstream docs describe Remnawave; verify extensions in this build’s API reference and node state. Compare schemas before using instructions from another release.'
        ]
    ]
)

add(
    'online-counts',
    'start',
    'Как читать онлайн-статистику',
    'Understanding online counts',
    ['src/pages/dashboard/home/'],
    '/dashboard/home',
    ['system'],
    [
        [
            'Соединения и уникальные пользователи',
            'Показатель «Онлайн на нодах» суммирует подключения на каждой ноде. Один и тот же пользователь, подключённый к двум нодам, может учитываться дважды. «Онлайн сейчас» в статистике пользователей считает уникальные учётные записи. Поэтому эти карточки могут показывать разные числа при исправной системе. Это различие описано в [быстром старте Remnawave](https://docs.rw/learn/quick-start/).',
            'Connections and unique users',
            'Online on nodes sums connections across nodes; one account connected to two nodes can appear twice. Online users counts unique accounts, so the cards may differ while the system is healthy. See the [Remnawave quick start](https://docs.rw/learn-en/quick-start/).'
        ],
        [
            'Сравнение трафика',
            'Блок «Сегодня» сравнивает текущий интервал с предыдущим периодом; значения обновляются после поступления статистики нод. Нулевой показатель в новой панели сам по себе не означает сбой. Сверяйте момент измерения, период и факт работающего клиентского подключения.',
            'Traffic comparison',
            'The Today card compares its current measurement period against a previous period; node reports update the values. Zero on a new panel does not by itself prove a fault. Check the measurement time, period and a real client connection.'
        ]
    ]
)

add(
    'auth-methods',
    'settings',
    'Пароль, Passkey и OAuth2',
    'Password, Passkey and OAuth2',
    ['src/shared/_modals/remnawave-settings/passkeys-drawer/', 'src/features/auth/'],
    '/dashboard/management/settings',
    ['auth', 'passkeys'],
    [
        [
            'Пароль и сеанс',
            'Администратор входит на странице входа. После смены способа авторизации проверьте работающий вход в отдельном сеансе и возможность восстановления. Если пароль забыт, официальный [быстрый старт](https://docs.rw/learn-en/quick-start/) описывает Rescue CLI; команды и имена контейнеров проверяйте для своего развёртывания.',
            'Password and session',
            'Administrators sign in on the login page. After changing authentication, verify a working sign-in in another session and recovery access. The official [quick start](https://docs.rw/learn-en/quick-start/) describes a Rescue CLI for lost passwords; check container names for your installation.'
        ],
        [
            'Passkey',
            'Passkey привязывается к браузеру/устройству администратора, и ключи можно просматривать и удалять в настройках. Регистрация и вход — разные операции; успешное создание ключа не отключает прежний способ входа автоматически. Для корректного WebAuthn важны HTTPS и домен панели.',
            'Passkey',
            'A passkey is registered for an administrator device/browser and can be viewed or removed in Settings. Registration and login are separate operations; adding a key does not automatically disable another login method. WebAuthn requires the correct panel domain and HTTPS.'
        ],
        [
            'OAuth2',
            'Доступные провайдеры OAuth2 настраиваются отдельно; панель запускает авторизацию и проверяет ответ через callback. Менять домен или redirect URI следует вместе с настройками провайдера. Не путайте OAuth2-вход администратора с API-токеном для интеграции.',
            'OAuth2',
            'Configured OAuth2 providers authorize administrators through a callback. Update provider redirect URIs when changing the panel domain. Administrator OAuth2 login is separate from API tokens for integrations.'
        ]
    ]
)

add(
    'subscription-request-path',
    'subscriptions',
    'Что происходит при открытии подписки',
    'What happens when a subscription is opened',
    ['src/pages/dashboard/subpage-config/'],
    '/dashboard/management/subscription-settings',
    ['subscriptions'],
    [
        [
            'Один адрес, разные ответы',
            'Пользователь получает URL подписки. Браузер может показать страницу для человека, а совместимый клиент получает конфигурацию. Панель учитывает параметры запроса и тип клиента; не делайте вывод о выдаче клиента только по виду страницы в браузере. Проверьте [официальное описание](https://docs.rw/learn-en/quick-start/) и локальную историю запросов.',
            'One URL, different responses',
            'The user receives a subscription URL. A browser can display a human-oriented page while a compatible client receives a configuration. The panel considers request details and client type; a browser page alone cannot prove client output. See the [official guide](https://docs.rw/learn-en/quick-start/) and local request history.'
        ],
        [
            'Порядок формирования',
            'Хост задаёт точку подключения и связан с одним inbound. Шаблон определяет формат конфигурации, правила ответа выбирают вариант выдачи, настройки подписки добавляют метаданные, а внешний сквад может переопределить шаблон и некоторые настройки. Это разные этапы; при поиске ошибки проверьте каждый последовательно.',
            'Generation pipeline',
            'A host defines a connection entry point and maps to one inbound. A template selects the configuration format, response rules choose delivery behavior, subscription settings add metadata, and an external squad can override templates and settings. Troubleshoot each stage separately.'
        ]
    ]
)

add(
    'client-families',
    'subscriptions',
    'Форматы клиентов и шаблоны',
    'Client formats and templates',
    ['src/pages/dashboard/templates/'],
    '/dashboard/templates',
    ['subscription-template'],
    [
        [
            'Семейства форматов',
            'Шаблоны разделяются по семействам клиентов, включая Mihomo, Xray JSON, sing-box и fallback Base64. Привязывайте шаблон к ожидаемому типу клиента; наличие inbound в серверном профиле не гарантирует поддержку транспорта всеми генераторами клиентских конфигураций. Для новых возможностей ядра сверяйте результат JSON и ограничения генератора.',
            'Format families',
            'Templates are separated by client family, including Mihomo, Xray JSON, sing-box and Base64 fallback. Select the template for the actual client; a server inbound does not guarantee that every client generator represents its transport. Check rendered JSON and generator support for new core features.'
        ],
        [
            'Внешний сквад и правила ответа',
            'Внешний сквад может подменять шаблон для группы. Правила ответа управляют формированием подписки в зависимости от запроса. После изменения откройте историю запросов конкретного пользователя и полученную конфигурацию в нужном клиенте. [Официальный обзор](https://docs.rw/learn-en/quick-start/) разделяет шаблоны и правила выдачи.',
            'External squads and response rules',
            'An external squad can override a template for a group. Response rules select how subscription output is generated from request conditions. After edits, inspect one user’s request history and the actual client output. The [official overview](https://docs.rw/learn-en/quick-start/) separates templates and delivery rules.'
        ]
    ]
)

add(
    'public-subpage',
    'subscriptions',
    'Публичная страница подписки',
    'Public subscription page',
    ['src/pages/dashboard/subpage-config/'],
    '/dashboard/subpage',
    ['subscription-page-configs'],
    [
        [
            'Назначение',
            'Страница подписки показывает пользователю статус и способы импорта, скрывая адрес административной панели за отдельным публичным доменом. Сам клиентский URL и доступ пользователя по-прежнему формируются сервером. Настройка страницы не заменяет хосты, сквады и шаблоны.',
            'Purpose',
            'A subscription page presents status and import instructions on a public domain while keeping the admin panel domain separate. The backend still produces the subscription URL and access checks. It does not replace hosts, squads or templates.'
        ],
        [
            'Отдельное развёртывание',
            'Если страница запускается отдельно, ей нужны URL панели и серверный API-токен с необходимыми правами. Токен храните на стороне сервера, не в браузерном коде. В [официальной инструкции bundled](https://docs.rw/install/subscription-page/bundled/) перечислены параметры такого развёртывания; для нашей сборки дополнительно сравните доступные права в справочнике API.',
            'Separate deployment',
            'A separately deployed page needs the panel URL and a server-held API token with required scopes. Keep that token on the server, never in browser code. The [official bundled guide](https://docs.rw/install/subscription-page/bundled/) lists deployment values; compare scopes against this build’s API reference.'
        ]
    ]
)

add(
    'webhook-delivery',
    'settings',
    'Webhook: события и проверка',
    'Webhooks: events and verification',
    [],
    '/dashboard/management/settings',
    [],
    [
        [
            'Форма события',
            'Webhook передаёт scope, event, timestamp и data. Возможные группы событий включают пользователя, HWID, ноду, сервис, инфраструктурные расходы и торрент-отчёты. Точный набор события зависит от сборки; [официальная таблица](https://docs.rw/features/webhooks/) и схемы в справочнике API помогают обработать выбранный тип.',
            'Event shape',
            'A webhook includes scope, event, timestamp and data. Groups include users, HWID devices, nodes, service events, infrastructure billing and torrent reports. The exact set depends on the build; consult the [official table](https://docs.rw/features/webhooks/) and API payload schemas.'
        ],
        [
            'Проверка и повтор',
            'Получатель должен проверять подписанные заголовки webhook и использовать собственное подавление повторов. Сбой доставки проверяйте по журналу и очереди, а не только по сохранённой настройке. Не публикуйте секрет подписи или реальный payload пользователя в примерах документации.',
            'Verification and retries',
            'Verify signed webhook headers at the receiver and handle repeated delivery safely. Diagnose delivery through logs and queues rather than the saved setting alone. Do not publish signing secrets or real user payloads in examples.'
        ]
    ]
)

add(
    'api-compatibility',
    'settings',
    'Совместимость SDK и API',
    'SDK and API compatibility',
    [],
    '/dashboard/documentation/api',
    ['api-tokens'],
    [
        [
            'Версии контрактов',
            'Официальный [TypeScript SDK](https://docs.rw/sdk/typescript-sdk/) предоставляет типы REST API, но требует своего HTTP-клиента. Для upstream 3.4.4 указана совместимая версия контракта 3.4.15. Наша сборка добавляет поля, права и методы: для них используйте загружаемый OpenAPI этого экземпляра и пересобирайте типы после изменения backend.',
            'Contract versions',
            'The official [TypeScript SDK](https://docs.rw/sdk/typescript-sdk/) supplies REST API types but needs an HTTP client. Upstream 3.4.4 maps to contract 3.4.15. This build adds fields, scopes and methods: use its downloadable OpenAPI for extensions and regenerate types after backend changes.'
        ],
        [
            'Токены и ошибки',
            'API-токен передаётся в Authorization: Bearer. На странице метода указаны необходимый scope и тип доступа. Административные сеансовые маршруты не становятся доступными от одного только токена. Проверяйте коды 400/401/403/409 и поле response перед повтором изменяющего запроса.',
            'Tokens and errors',
            'Pass the API token as Authorization: Bearer. Each method page shows the required scope and access type. Admin-session routes are not made available by an API token alone. Inspect 400/401/403/409 and the response envelope before retrying a mutation.'
        ]
    ]
)

add(
    'recovery-essentials',
    'settings',
    'Проверка установки и восстановление',
    'Deployment checks and recovery',
    [],
    '/dashboard/home',
    [],
    [
        [
            'Контур',
            'Панель запускается с PostgreSQL и Redis за HTTPS reverse proxy; нода подключается отдельно. [Официальная установка](https://docs.rw/install/remnawave-panel/) описывает базовый контур. В нашей сборке также проверьте том для dumps, настройки резервного копирования и соответствие версии собственного Xray бинарнику ноды.',
            'Services',
            'The panel runs with PostgreSQL and Redis behind an HTTPS reverse proxy; nodes connect separately. The [official installation guide](https://docs.rw/install/remnawave-panel/) explains the baseline. For this build also check the dumps volume, backup settings and the custom Xray binary in the node image.'
        ],
        [
            'После восстановления',
            'Проверьте вход администратора, запись в базе, очередь Redis, одну подключённую ноду, профиль, доступный хост и тестового пользователя. Для бекапа проверьте пароль архива и полноту дампа до возможного удаления старой копии. Изменения переменных окружения применяются к запущенному процессу после перезапуска соответствующего сервиса.',
            'After recovery',
            'Check administrator login, database writes, Redis queues, one connected node, a profile, a reachable host and a test user. Verify the archive password and dump integrity before removing older backups. Environment changes reach a running process after restarting the relevant service.'
        ]
    ]
)
