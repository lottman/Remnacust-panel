import { add } from './guide-source.mjs'

add(
    'node-integrations',
    'nodes',
    'Конфигурации интеграций ноды',
    'Node integration configurations',
    ['src/shared/_modals/node-integrations/', 'src/shared/ui/forms/nodes/base-node-form/'],
    '/dashboard/management/nodes',
    ['node-integrations'],
    [
        [
            'Конфигурация и назначение',
            'Создайте именованную конфигурацию с описанием и JSON-параметрами, затем назначьте её нужным нодам. Редактирование интеграции и включение её на ноде — отдельные действия. Удалённая olcRTC-интеграция не является поддерживаемой функцией панели; старую запись в базе нельзя считать её поддержкой.',
            'Configuration and assignment',
            'Create a named integration with a description and JSON configuration, then assign it to nodes. Editing the configuration and enabling it on a node are separate actions. Removed olcRTC integration is unsupported in the panel; a legacy database record does not imply support.'
        ],
        [
            'Применение и удаление',
            'При обновлении предусмотрен restartNodes: перезапуск затрагивает использующие интеграцию ноды. Проверьте изменение конфигурации и результаты очереди. Удаление сначала учитывает связь с нодами; не используйте удалённый UUID в новом назначении. Сохранение произвольного JSON не гарантирует, что агент умеет выполнять его содержимое.',
            'Applying and deleting',
            'Updates support restartNodes, affecting nodes assigned to the integration. Inspect configuration changes and queue results. Deletion accounts for linked nodes; do not assign a deleted UUID. Saving arbitrary JSON does not guarantee that the agent supports its contents.'
        ]
    ]
)
add(
    'metadata',
    'users',
    'Метаданные и просмотр JSON',
    'Metadata and JSON inspection',
    [],
    '/dashboard/documentation/api',
    ['metadata'],
    [
        [
            'Дополнительные свойства',
            'Метаданные хранят дополнительные свойства пользователя или ноды для поддерживаемых интеграций. Они отличаются от основных полей, квот и сквадов. Чтение и запись доступны через методы `/api/metadata/user/{userId}` и `/api/metadata/node/{uuid}` с отдельными правами API-токена; проверьте тип сущности и идентификатор перед записью.',
            'Additional properties',
            'Metadata stores extra properties of users or nodes for supported integrations. It is separate from core fields, quotas and squads. Read/write via `/api/metadata/user/{userId}` or `/api/metadata/node/{uuid}` with their API-token scopes; verify entity type and identifier before writing.'
        ],
        [
            'Просмотр данных',
            'JSON-представление помогает видеть сохранённые системные поля и точные значения. Просмотр ответа не является запросом на его полную замену: при обновлении используйте только разрешённые поля RequestBody. Метаданные и JSON могут содержать персональные сведения; копируйте в пример только обезличенные данные.',
            'Inspecting data',
            'JSON inspection shows saved system fields and exact values. Viewing a response does not authorize replacing the whole object: updates accept only supported RequestBody fields. Metadata and JSON may contain personal information; use anonymized examples.'
        ]
    ]
)
add(
    'variable-syntax',
    'subscriptions',
    'Форматирование переменных и единицы',
    'Variable formatting and units',
    [],
    '/dashboard/management/subscription-settings',
    ['subscription-settings'],
    [
        [
            'Аргументы и Base64',
            'Аргументы записываются после двоеточия и разделяются |: `{{NEXT_TRAFFIC_RESET_AT:format=DD.MM.YYYY HH:mm}}`, `{{STATUS:ACTIVE=Активен|DISABLED=Отключён|EXPIRED=Истёк|LIMITED=Лимит}}`. RESET_STRATEGY принимает подписи NO_RESET, DAY, WEEK, MONTH и MONTH_ROLLING. Префикс `rwEncodeBase64:` кодирует итоговую строку и добавляет к результату `base64:`. Неизвестная переменная остаётся исходным текстом.',
            'Arguments and Base64',
            'Arguments follow a colon and use | separators: `{{NEXT_TRAFFIC_RESET_AT:format=DD.MM.YYYY HH:mm}}`, `{{STATUS:ACTIVE=Active|DISABLED=Disabled|EXPIRED=Expired|LIMITED=Limited}}`. RESET_STRATEGY accepts NO_RESET, DAY, WEEK, MONTH and MONTH_ROLLING labels. `rwEncodeBase64:` encodes the rendered string and adds `base64:`. An unknown variable remains literal text.'
        ],
        [
            'Числа, бесконечность и контекст',
            'LOCATION-переменные с MB/GB используют базу 1024 и округление до 3 знаков без единицы; безлимит LIMIT/LEFT выводит ∞. Обычные TRAFFIC_USED_MB/GB и TOTAL_TRAFFIC_MB/GB включают единицу. В заголовке без текущего хоста LOCATION-подстановка может вернуть список `имя: значение`, разделённый ;, с устранением повторов. При нескольких тегах TEG также может вернуть список. Даты LOCATION RESETAT форматируются в UTC.',
            'Numbers, infinity and context',
            'LOCATION MB/GB variants use base 1024, up to three decimal places and no unit; unlimited LIMIT/LEFT returns ∞. Ordinary TRAFFIC_USED_MB/GB and TOTAL_TRAFFIC_MB/GB include units. Without a current host, LOCATION headers can return a deduplicated semicolon-separated name: value list. Multiple tags can also produce a TEG list. LOCATION RESETAT dates use UTC.'
        ],
        [
            'Временные значения',
            'UNIX-переменные возвращают секунды, не миллисекунды. При отсутствии LAST_TRAFFIC_RESET_AT_UNIX/NEXT_TRAFFIC_RESET_AT_UNIX результат 0; форматированные варианты возвращают пустую строку. DAYS_LEFT не становится отрицательным. Обычный TRAFFIC_LEFT для безлимитной подписки возвращает 0 по правилам счётчика, а не ∞; не путайте его с LOCATION LEFT.',
            'Time values',
            'UNIX values are seconds, not milliseconds. Missing LAST_TRAFFIC_RESET_AT_UNIX/NEXT_TRAFFIC_RESET_AT_UNIX is 0; formatted variants are empty. DAYS_LEFT is clamped at zero. Ordinary TRAFFIC_LEFT for an unlimited subscription is 0 according to the counter rules, not ∞; it differs from LOCATION LEFT.'
        ]
    ]
)
