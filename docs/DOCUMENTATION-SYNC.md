# Сверка документации — 23 октября 2026

Этот файл связывает актуальные инструкции с исходниками последних 45 изменений. Исторические аудиты и заметки выпусков сохраняют свои даты, незавершённые шаги и результаты; их нельзя читать как текущую инструкцию.

## Комплект 1.2.80

Панель и страница подписки 1.1.7.46, нода 1.1.18, Core/WASM 1.1.11. Миграций БД нет. Исправлены подтверждения плагинов и проверка доступных возможностей до изменения активной конфигурации; старые ноды сохраняют совместимость при снятии уже отсутствующего плагина. Исключения torrent blocker и его отчёты учитывают владельца персональных ключей устройства/хоста.

Обход сессий пользователя отличает успешный пустой ответ от отказа всех нод и показывает частичные результаты с перечнем недоступных нод. Предупреждение переведено на четыре языка и проверено на мобильном экране в светлой и тёмной темах, включая RTL. Ограничение хоста DENY сохраняет ручные и geofile-правила Xray JSON. Загрузка SRS проверяет структуру всех записей. Одновременный импорт одинакового geofile между API-процессами возвращает одну запись; проверка включена в PostgreSQL CI. OpenAPI и справочник синхронизированы. Подробности: [geofiles](GEOFILES.md), [сессии](SESSIONS-RECORDING.md).

Комплект [1.2.80](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.80) опубликован как Latest. Проверены десять файлов выпуска, SHA-256, закреплённые исходники, шесть анонимных манифестов GHCR и публичное скачивание установщика. [CI панели](https://github.com/lottman/Remnacust-panel/actions/runs/39954036851), [CI ноды](https://github.com/lottman/Remnacust-node/actions/runs/39953733473), [повторный Linux CI ядра](https://github.com/lottman/Remnacust-core/actions/runs/39725463990), [сборка образов](https://github.com/lottman/Remnacust-installer/actions/runs/39955888662). Рабочий VPS не обновлялся.

## Публикация 1.2.79

Панель и страница подписки 1.1.7.45: каталог шести опубликованных DAT-наборов V2Fly/MetaCubeX, локализованная подсказка «Нажмите, чтобы загрузить» и единые карточки новых вкладок. Используются общий Card, цвета темы, скругления и отступы панели. У заголовка геофайлов убрана декоративная иконка. Мобильная форма записи сессий складывается в одну колонку, кнопки имеют высоту не менее 44 px. Убраны отдельные анимации подъёма карточек схем; клавиатурный фокус сохранён. Node/Core не изменены.

Официальный GitHub API подтвердил публикацию и размер всех шести файлов каталога. Браузерная проверка выполнена на изолированном стенде с настоящими компонентами и подменённым API: импорт получает выбранные имя/тип/URL, не меняет черновик и ручные поля формы. Проверены RU/EN/FA/ZH, RTL, темы Dark/Light/Green и отсутствие горизонтального переполнения при ширине 390 px. Это не проверка скачивания всех внешних файлов на рабочем сервере; сервер продолжает проверять HTTPS, DNS, переходы, содержимое и размер при каждом настоящем импорте. Выпуск опубликован после CI и проверки готовых образов. Дополнительно все шесть файлов каталога действительно скачаны через downloadGeofile и проверены validateGeofile/datCategories без подмены DNS, HTTPS и содержимого; сохранены размеры, число категорий и SHA-256. Это проверка внешних источников с машины сборки на момент выпуска, без гарантии их доступности с любого VPS.

## Комплект и рабочие изменения

Последний опубликованный комплект, закреплённый в `Remnacust-installer/component-sources.json`: **установщик 1.2.80, панель и страница подписки 1.1.7.46, нода 1.1.18, Core/WASM 1.1.11**. Основа: официальные Remnawave 3.4.7, Node 3.4.3, Subscription Page 8.0.1 и опубликованный Xray v26.10.21 (prerelease). Коммиты после официального тега Xray из main не добавляются. [Совместимость](COMPATIBILITY.md).

Выпущены в комплекте 1.2.72 (панель и страница подписки 1.1.7.41): единицы скорости во всех формах хоста/тега, раздельные разделы пользовательских и общих лимитов, корректное `∞` для нулевой скорости тега, обновлённые руководства. Sidebar использует переводы разделов и пункта страницы подписки на RU/EN/FA/ZH. Обозначение Mbps сохраняется на английском во всех языках и проверяется при контроле локалей. Отдельного нового поля скорости в модели пользователя и миграции БД нет: используется существующий серверный механизм ограничения в области хоста. Эти изменения не означают, что на рабочем сервере уже установлена новая версия.

## Что описывают текущие инструкции

| Область | Текущее поведение и существенные ограничения | Руководство |
| --- | --- | --- |
| Скорость и объём | Mbps — скорость, GiB — объём. Все устройства владельца делят скорость хоста; скорость пользователя тега действует отдельно на каждом хосте. Общая скорость — отдельный пул. 0 снимает соответствующий собственный предел, не ограничения тегов. | [Поля, наследование и примеры](HOST-LIMITS.md) |
| Локальные резервы | При недоступной панели работает выданный остаток. Новый резерв требует связи; исчерпание не даёт безлимит. Сброс доступным нодам сразу; расход старого резерва недоступной нодой может временно превысить новую квоту. | [Учёт и восстановление](QUOTA-RECOVERY.md) |
| Порты и профили | Отдельные привязки порта/профиля/inbound. Совместимые runtime-изменения сохраняют соединения. Смена порта, транспорта или несовместимых настроек занятого listener требует нового listener либо явного обслуживания. Обновление бинарника/контейнера может прервать связь. | [Архитектура портов и история решений](LIVE-PORTS-DESIGN.md) |
| Сохранение конфигурации | Ошибка структуры/протокола не меняет профиль. Сохранение в БД и применение на ноде — разные результаты. Сниппеты раскрываются до подготовки сертификатов; стадия подготовки имеет конкретную диагностику. Оригинальная техническая ошибка listener показывается без дополнительного русского пересказа. | [Панель](../panel/README.md), встроенные «Редактор Xray» и «Действия с нодой» |
| История редакторов | Сравнение с черновиком и открытие сохранённого кода; применение через сохранение создаёт новую версию. Все типы шаблонов имеют историю. Отмена автобаланса восстанавливает код, а не только визуальные настройки. | [Автовыбор и история](XRAY-AUTOSELECT.md) |
| Автовыбор | all/random/group для всех селекторов; права и видимость проверяются до отбора. random/roundRobin не требуют наблюдений. leastLoad позволяет редактировать expected/tolerance/baselines/maxRTT, сохраняя остальные параметры. Изменение и удаление действуют на связанные элементы кода. | [Редактор шаблонов](XRAY-AUTOSELECT.md) |
| Сессии и запись | Каждый обход получает свежие ноды. Ошибка не считается пустым успешным ответом. Идентификаторы устройств/хостов сопоставляются с владельцами. Опрос 10–300 секунд, запись 1 минута–7 дней, до 20 записей с хранением 3 дня; короткие соединения между снимками могут не попасть. Экспорт содержит актуальные ссылки подписок и доступен администратору. NET_ADMIN для чтения IP через Xray не нужен. | [Запись](SESSIONS-RECORDING.md), [датированные проверки](SESSION-COLLECTION-VALIDATION-20261018.md) |
| Здоровье нод | Без связи, активной конфигурации или свежего подтверждения работающего ядра — 0/100. Четыре сигнала по 25 баллов; неизвестные ресурсы не считаются исправными. Кеш uptime 16 секунд, ресурсов 30 секунд. Журнал ограничен хранением. | [Здоровье](UPDATE-PROGRESS-AND-NODE-HEALTH.md) |
| Обновление | Восемь этапов, последние 24 события, прошедшее время; ETA только при наличии измерений прежней операции. Закрытие вкладки не отменяет задачу. С 1.2.71 свежий Latest закрепляется до проверки и установки; версия из старого уведомления — минимум, понижение запрещено. Старую службу нужно обновить на сервере. | [Установщик](INSTALLER.md) |
| Docker и NET_ADMIN | Готовые образы и Compose v2, без компиляции на VPS. Эффективный CapEff ноды проверяется при обновлении: действующее право сохраняется, иначе интерактивный запуск спрашивает. После успеха очистка сохраняет текущий/предыдущий и используемые контейнерами образы, без глобального prune и удаления томов. | [Обслуживание](INSTALLER.md) |
| Каталог ядра | Проверенные Linux amd64/arm64 с SHA-256 и исходным коммитом; проверяются версия, архитектура, квоты и конфигурация. Явный каталог администратора, включая пустой, имеет приоритет. Для стандартного репозитория разрешён только проверяемый GitHub redirect; собственные URL не получают неограниченные перенаправления. | [Совместимость](COMPATIBILITY.md), встроенное «Управление ядром» |
| Ключи и подписки | Временная ошибка кеша при подготовке ключей допускает чтение из БД. Некорректное percent-экранирование имени не срывает выдачу. Сырой конфиг загружается по запросу пользователя. Недоступность управляющего API ноды сама по себе не удаляет разрешённый хост из подписки. | [Совместимость нод](NODE-COMPATIBILITY.md), [страница подписки](../subscription-page/README.md) |
| HWID | Удаление освобождает регистрацию, постоянный запрет требует блокировки. Очередь отзыва сохраняется для недоступных нод; физически недоступная нода получит изменение при связи. Резервный лимит, явный 0 и запрет новых устройств — разные настройки. | [Отзыв устройств](DEVICE-RECONCILIATION.md) |
| Резервные копии | Защита паролем, расписание, отправка, проверка восстановления. Диагностические записи сессий и выборки не включаются в восстанавливаемый дамп. APP_SECRET, .env и сертификаты требуют отдельного сохранения согласно процедуре. | [Копии](BACKUPS.md), [старая БД](DATABASE-COMPATIBILITY.md) |
| UI и мобильный экран | Существующая тема и семантические цвета; поля и действия перестраиваются по ширине. Сроки оплаты: нейтральный больше 7 дней, жёлтый 2–7, оранжевый завтра, красный сегодня/просрочено, по календарным датам UTC. Состояние срока не совершает платёж. | Встроенный «Учёт серверов», [исторический UI-аудит](UI-REVIEW-20261018.md) |
| Справочник | Четыре языка RU/EN/FA/ZH, общие ID разделов, реальные маршруты, версия OpenAPI и контрольные суммы исходников. Генерация проверяется вместе с переводами и TypeScript. | [Сборка](BUILDING.md), [API](API.md) |

## Дополнение 1.1.7.47

Серверные черновики и история ошибок, единая карточка автовыбора, готовый выбор подходящих хостов при создании через GUI, явный способ выдачи geofiles, поиск стран на RU/EN/FA/ZH, ответ массовых действий после commit с фоновой доставкой и два поля X25519 описаны в [новом руководстве](TEMPLATE-DRAFTS.md). Встроенное руководство и новые сообщения синхронизированы на всех четырёх языках.

## Последние 45 изменений исходников

Список получен из Git текущей панели; повторные выпуски одного исправления оставлены как отдельные реальные коммиты. Таблица выше сводит повторения по пользовательскому поведению. Это карта охвата документации, а не утверждение, что каждый старый тест повторно запускался 21 октября.

| Коммит | Изменение |
| --- | --- |
| [17f418d](https://github.com/lottman/Remnacust-panel/commit/17f418d) | fix: show original core listener diagnostics without translated explanation |
| [f6e6293](https://github.com/lottman/Remnacust-panel/commit/f6e6293) | fix: provide verified latest core builds in node tasks |
| [2a4cf3b](https://github.com/lottman/Remnacust-panel/commit/2a4cf3b) | fix: unify responsive UI and harden subscription config preparation |
| [e1e3a48](https://github.com/lottman/Remnacust-panel/commit/e1e3a48) | fix: refresh nodes on every session scan and update bundled validator |
| [c6114a4](https://github.com/lottman/Remnacust-panel/commit/c6114a4) | fix: refresh session scan availability and explain blocked states |
| [c201f9a](https://github.com/lottman/Remnacust-panel/commit/c201f9a) | fix: show update progress, correct node health and preserve real sessions |
| [53ce3f8](https://github.com/lottman/Remnacust-panel/commit/53ce3f8) | Fix autoselect modes, balancing controls and editor UI; prepare 1.1.7.34 |
| [db4f97d](https://github.com/lottman/Remnacust-panel/commit/db4f97d) | Add timed session recording, subscription export and responsive history fixes |
| [0c510c1](https://github.com/lottman/Remnacust-panel/commit/0c510c1) | Rebuild validator with HTTP/2 security fix and record release evidence |
| [5b44460](https://github.com/lottman/Remnacust-panel/commit/5b44460) | Check backend contracts against the pinned 1.1.10 node |
| [012e8b4](https://github.com/lottman/Remnacust-panel/commit/012e8b4) | Coordinate offline reserves and expose independent node ports |
| [ce7b37f](https://github.com/lottman/Remnacust-panel/commit/ce7b37f) | Unify HWID limit subscription responses and verify device defaults |
| [656b7b4](https://github.com/lottman/Remnacust-panel/commit/656b7b4) | Allow authorized hidden hosts in subscription injection; release 1.1.7.30 |
| [3454a11](https://github.com/lottman/Remnacust-panel/commit/3454a11) | Align Runtime header controls and mobile touch targets; release 1.1.7.29 |
| [a966f2b](https://github.com/lottman/Remnacust-panel/commit/a966f2b) | Align Runtime header controls and mobile touch targets; release 1.1.7.28 |
| [85e8ca3](https://github.com/lottman/Remnacust-panel/commit/85e8ca3) | Align Runtime header controls and mobile touch targets; release 1.1.7.27 |
| [6547ced](https://github.com/lottman/Remnacust-panel/commit/6547ced) | Align Runtime header controls and mobile touch targets; release 1.1.7.26 |
| [7a0e680](https://github.com/lottman/Remnacust-panel/commit/7a0e680) | Exclude diagnostic samples from recoverable compressed backups; release 1.1.7.23 |
| [cf141ba](https://github.com/lottman/Remnacust-panel/commit/cf141ba) | Bound health log retention and background cleanup; release 1.1.7.22 |
| [e6cc1b4](https://github.com/lottman/Remnacust-panel/commit/e6cc1b4) | Persist device deletion and reconcile offline nodes; release 1.1.7.21 |
| [48f64c5](https://github.com/lottman/Remnacust-panel/commit/48f64c5) | Fix detached host editing and inbound validation; release 1.1.7.20 |
| [c8baab2](https://github.com/lottman/Remnacust-panel/commit/c8baab2) | Fix detached host editing and inbound validation; release 1.1.7.19 |
| [466c17f](https://github.com/lottman/Remnacust-panel/commit/466c17f) | Fix detached host editing and inbound validation; release 1.1.7.18 |
| [f3e970d](https://github.com/lottman/Remnacust-panel/commit/f3e970d) | Unify template and flag field actions; release 1.1.7.17 |
| [1e04608](https://github.com/lottman/Remnacust-panel/commit/1e04608) | Fix node refresh, rebuild traffic chart and add country flags; release 1.1.7.16 |
| [54e36d3](https://github.com/lottman/Remnacust-panel/commit/54e36d3) | Fix node refresh, rebuild traffic chart and add country flags; release 1.1.7.15 |
| [43cc117](https://github.com/lottman/Remnacust-panel/commit/43cc117) | Restore node data freshness and statistics motion; release 1.1.7.14 |
| [b890bec](https://github.com/lottman/Remnacust-panel/commit/b890bec) | Optimize statistics hover and tooltip; release 1.1.7.13 |
| [98d1f15](https://github.com/lottman/Remnacust-panel/commit/98d1f15) | Fix query recovery and modal overflow; release 1.1.7.12 |
| [af3af93](https://github.com/lottman/Remnacust-panel/commit/af3af93) | Restore profile save and verify mobile layouts; release 1.1.7.11 |
| [e0b5cc1](https://github.com/lottman/Remnacust-panel/commit/e0b5cc1) | Restore profile save and verify mobile layouts; release 1.1.7.10 |
| [d535e1b](https://github.com/lottman/Remnacust-panel/commit/d535e1b) | Restore profile save and verify mobile layouts; release 1.1.7.9 |
| [de62f69](https://github.com/lottman/Remnacust-panel/commit/de62f69) | Improve view switching, branding and installable update checks; release 1.1.7.8 |
| [e0961ce](https://github.com/lottman/Remnacust-panel/commit/e0961ce) | Color and animate the available update indicator; release 1.1.7.7 |
| [c0ffc1f](https://github.com/lottman/Remnacust-panel/commit/c0ffc1f) | Compact node card layout and traffic values; release 1.1.7.6 |
| [79f6337](https://github.com/lottman/Remnacust-panel/commit/79f6337) | Add panel updates and harden subscription processing; release 1.1.7.5 |
| [4e90673](https://github.com/lottman/Remnacust-panel/commit/4e90673) | Localize backup password control and align upstream documentation; release 1.1.7.4 |
| [3ac6c65](https://github.com/lottman/Remnacust-panel/commit/3ac6c65) | Keep overlay action buttons visible and arrange user forms by available width; release 1.1.7.3 |
| [6fd6cb8](https://github.com/lottman/Remnacust-panel/commit/6fd6cb8) | Explain Xera HTTP as an XHTTP fork across all guide languages; release 1.1.7.2 |
| [ea1f211](https://github.com/lottman/Remnacust-panel/commit/ea1f211) | Fix worker dependency initialization while preserving panel 1.1.7.1; release 1.1.7.1 |
| [2acd109](https://github.com/lottman/Remnacust-panel/commit/2acd109) | Update documented installer release to 1.2.17 |
| [762dd16](https://github.com/lottman/Remnacust-panel/commit/762dd16) | Fix profile validation, scrolling and node setup; release 1.1.7 |
| [18f8f20](https://github.com/lottman/Remnacust-panel/commit/18f8f20) | Fix build metadata GitHub links; release panel 1.1.6 |
| [91be8c9](https://github.com/lottman/Remnacust-panel/commit/91be8c9) | Rename build info community button to Support; release panel 1.1.5 |
| [07b54c9](https://github.com/lottman/Remnacust-panel/commit/07b54c9) | Preserve Monaco across tabs, fill canvas grid and align overlay footers; release 1.1.4 |

## Как поддерживать согласованность

При изменении поведения исправляйте исходник соответствующей статьи в `panel/frontend/docs-tools/`, четыре локали формы и тематическое руководство `docs/`. Итоговые `public/documentation/guide-*.json` и `guide-*.md` генерируются, а не редактируются вручную. Изменения текущих версий берутся из VERSION/package.json, таблицы совместимости и закреплённого `component-sources.json`; исторические заметки выпусков не переписываются новыми номерами.

После удаления временных UI-fixtures выполните `npm run docs:generate`, `npm run docs:check`, `npm run i18n:check` и `npm run typecheck` в `panel/frontend`. При выпуске дополнительно проверяются исходные коммиты, каталог ядра и пакет компонентов. Успешная проверка справочника не доказывает, что все приложения, старые ноды и рабочий VPS проверены в реальном трафике.

## Результат этой сверки

- Четыре существующих теста скорости Core из [HOST-LIMITS.md](HOST-LIMITS.md) прошли; общий бюджет устройств и направлений, отдельные пользовательские пределы хостов и общий пул подтверждены тестами механизма ядра.
- На локальном стенде с настоящими компонентами формы проверены изменение поля хоста, сохранение тега через изолированный тестовый адаптер, отображение `∞` при нуле, RU/EN/FA/ZH, RTL, светлая/тёмная темы, ширина 390 и 1280 px. Горизонтального переполнения нет. Рабочая БД и настройки нод не изменялись.
- TypeScript и линтер пяти изменённых компонентов прошли. Генератор и проверка справочника подтвердили 56 статей, 150 разделов на язык, 238 API-операций, 52 переменные и 214 элементов управления. Переводы: 2971 совпадающий ключ, 4195 статических вызовов проверены.
- Проверены 90 локальных Markdown-ссылок изменённых документов в четырёх репозиториях; отсутствующих целей нет. Временные UI-fixtures удалены, тестовый сервер остановлен.

Это проверка рабочих изменений исходников. После сверки опубликован выпуск 1.2.72; результат сборки и публичной проверки приведён ниже.


## Публикация 1.2.72 — 21 октября 2026

[Выпуск 1.2.72](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.72) опубликован как Latest: панель/страница подписки 1.1.7.41, нода 1.1.15, Core/WASM 1.1.9. [Сборка](https://github.com/lottman/Remnacust-installer/actions/runs/39545211597), проверки исходников панели и два прогона установщика завершились успешно. Проверены десять файлов выпуска, SHA-256, закреплённые коммиты, анонимное скачивание installer.sh и анонимный доступ к шести манифестам GHCR. Sidebar и обозначение Mbps проверены на RU/EN/FA/ZH, в том числе RTL и мобильной ширине. Обновление рабочего VPS этим прогоном не выполнялось.


## Подготовка 1.2.73 — 22 октября 2026

Панель/страница подписки 1.1.7.42, Node 1.1.16, Core/WASM 1.1.11. Обновлены поля хоста и тега, таблица совместимости, справка API, четыре встроенных руководства и README компонентов. Лимит приватного ключа устройства отделён от общего бюджета пользователя; динамическая очередь не резервирует канал неактивным ключам. Между нодами остаётся консервативное распределение. Копии одного ключа остаются одной идентичностью. При смене версии валидатор и схемы пересобираются; каталог закрепляется только после проверки опубликованных нативных бинарников. Сопутствующее исправление follow-redirects 1.16.1 отражено в lock-файлах. Публикация подтверждается отдельной записью после проверки артефактов.


## Публикация 1.2.73 — 22 октября 2026

[Выпуск 1.2.73](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.73) опубликован как Latest. [Сборка](https://github.com/lottman/Remnacust-installer/actions/runs/39726734748) завершилась успешно: шесть нативных Docker-образов amd64/arm64, запуск готовых образов панели с БД и проверка метаданных, запуск ноды с NET_ADMIN и без него. Сверены десять файлов выпуска и SHA-256, коммиты компонентов, анонимное скачивание installer.sh и шесть анонимных манифестов GHCR. Каталог панели закреплён на опубликованных бинарниках Core 1.1.11: скачанные amd64/arm64 проверены по ELF, размеру и SHA-256.

Проверки исходников панели, ноды, ядра и установщика прошли. Linux -race, сохранение живого VLESS при обновлении политик, автономные резервы, отзыв устройств и govulncheck прошли на новой официальной базе Xray v26.10.21/Go 1.27.3. Браузерный валидатор прошёл 27 примеров, включая встроенные геоданные, XDNS DoH, MASQUE Mux и требуемое XDRIVE-шифрование. Новые параметры хостов и тегов проверены с API и БД; интерфейс формы проверен на четырёх языках, в светлой/тёмной теме и мобильных размерах на изолированном стенде. Это не проверка всех физических устройств и клиентских приложений. Копии ключа остаются одной идентичностью. Старый нешифрованный XDRIVE-профиль требует подготовки согласно заметкам выпуска. Рабочий VPS этой публикацией не обновлялся.

## Официальные обновления от 22 октября 2026

В опубликованный комплект 1.2.74 перенесены Backend/Frontend 3.4.7, Node 3.4.3 и Subscription Page 8.0.1. Последний подтверждён официальным тегом и успешной публикацией контейнера для amd64/arm64 (у проекта нет GitHub Release). Xray v26.10.21, xtls-sdk 0.17.0 и geocheck 0.3.0 уже актуальны. Закреплён Node.js 24.22.1; сохранены свои лимиты, ключи устройств и исправления зависимостей. Новая генерация публичных X25519-ключей проверяется по RFC 7748, массовое удаление — по скомпилированному параметризованному SQL, INCY-ссылка — обратным расшифрованием.

## Публикация 1.2.74 — 22 октября 2026

[Выпуск 1.2.74](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.74) опубликован как Latest: панель/страница подписки 1.1.7.43, Node 1.1.17, Core/WASM 1.1.11. Закреплены коммиты панели `e7b0696b52f68257a99c99bf6b2cb216c0d239a5`, ноды `4ea4b163e24a859545b298a1c8584d0e9e9ee048` и неизменённого ядра `e808cc052cea65c490e869d2d7bcf11fe0a6697f`. Тег установщика закреплён на `6dc928c7d4767fe9c8ee2d1f54d8ddeed4b2e5a8`.

[Проверки панели](https://github.com/lottman/Remnacust-panel/actions/runs/39790643312), [ноды](https://github.com/lottman/Remnacust-node/actions/runs/39790563087) и [установщика](https://github.com/lottman/Remnacust-installer/actions/runs/39791161653) прошли. Добавлены проверки RFC 7748 и обработки некорректного X25519-ключа, компиляции параметризованного SQL массового удаления и шифрования/обратного расшифрования INCY-ссылки. SQL-проверка использует настоящий компилятор Kysely и изолированный адаптер ответа, а не удаление пользователей рабочей БД. Встроенные справочники повторно сгенерированы по OpenAPI 1.1.7.43 и проверены.

[Сборка](https://github.com/lottman/Remnacust-installer/actions/runs/39792039649) подтвердила шесть нативных Docker-образов amd64/arm64, запуск панели с БД, метаданные образов и работу ноды с NET_ADMIN и без него. Сверены десять файлов выпуска, SHA-256 и закреплённые коммиты; подтверждены шесть анонимных манифестов GHCR, публичный Latest и скачивание installer.sh без учётных данных. Все стадии используют опубликованный Node.js 24.22.1.

Core/WASM и его каталог не менялись относительно 1.2.73, новая сборка ядра и повторный govulncheck в этом переносе не выполнялись. Собственные квоты, лимиты скорости и ключи устройств сохранены; новой миграции БД нет. Поддержка формата импорта INCY не означает проверки всех физических клиентов. Рабочий VPS не обновлялся.

## Публикация 1.2.77

Панель/страница подписки 1.1.7.44: нативный автовыбор во всех пяти форматах, удаление несохранённого Xray-пула с зависимостями, общий блок действий и мобильная/RTL-раскладка. [Геофайлы](GEOFILES.md): бинарная загрузка с ПК и защищённый импорт HTTPS, библиотека с повторным использованием, встроенные DAT-правила и нативная доставка rule sets/providers. Переводы и встроенное руководство синхронизированы на RU/EN/FA/ZH. Node/Core/WASM и официальная база не обновляются этим изменением. Критическая зависимость DOMPurify обновлена с 3.4.16 до официальной 3.4.17.

Резервная копия только БД не включает geofiles: при переносе нужен также постоянный каталог `backups/geofiles`. Нативные форматы проверяются генераторами и HTTP-тестами; проверка каждого физического клиентского приложения не заявляется. Выпуск опубликован после прохождения CI и проверки готовых образов.


Исходники: панель `783a095e1345e7f14f556cb6abec69aa5014b02a`, установщик и тег `f231a77405990c789ac2c681f03bd67d7378af8e`. [CI панели](https://github.com/lottman/Remnacust-panel/actions/runs/39843250052), [CI установщика](https://github.com/lottman/Remnacust-installer/actions/runs/39843276413) и [CI тега](https://github.com/lottman/Remnacust-installer/actions/runs/39843267544) прошли. [Сборка шести образов](https://github.com/lottman/Remnacust-installer/actions/runs/39843468850) прошла, включая новые проверки бинарной загрузки geofiles через действительную JWT-сессию, публичной выдачи, сохранения ссылок в PostgreSQL и запрета удаления используемого набора в готовых контейнерах панели.

Сверены десять файлов выпуска, SHA-256, закреплённые исходники, шесть анонимных манифестов GHCR и публичное скачивание установщика. Проверены типы, сборки, локали, документация, генераторы пяти форматов и HTTP-передача через страницу подписки. Шесть вариантов DAT DIRECT/REJECT/балансер приняты настоящим WASM ядра 1.1.11. На изолированном интерфейсе проверены создание и удаление несохранённого пула, общая библиотека, сохранение черновика, мобильные 390 px, четыре языка, RTL и светлая/тёмная темы. PC file picker в браузерной автоматизации не проверялся из-за ограничения доступа инструмента к локальным файлам; бинарный upload проверен реальными HTTP-запросами и в готовом контейнере. Производственные зависимости фронтенда: npm audit --omit=dev без известных уязвимостей на момент проверки. Полная семантика каждого клиентского приложения и всех физических устройств не заявляется. Рабочий VPS не обновлялся.


Проверки 1.2.79: [CI панели](https://github.com/lottman/Remnacust-panel/actions/runs/39851010853), [CI установщика](https://github.com/lottman/Remnacust-installer/actions/runs/39851094101), [CI тега](https://github.com/lottman/Remnacust-installer/actions/runs/39851086846), [шесть образов](https://github.com/lottman/Remnacust-installer/actions/runs/39851104365). Панель закреплена на `3c88be1755c5dbd5cab4db57465b92193f926e15`, установщик/тег — `4c0aa2ce0d22feeaeaf5f5ccf7d5b8b9c7ca281d`. Проверены десять файлов выпуска, SHA-256, runtime pins, шесть анонимных манифестов GHCR и публичный Latest. В готовых контейнерах панели проверены действительная JWT-авторизация, HTTP-загрузка и выдача geofiles, ссылки в PostgreSQL и защита используемого файла от удаления. Тег 1.2.78 сохранён без образов и GitHub Release из-за неполной служебной версии в упаковке; использовать 1.2.79. Рабочий VPS не обновлялся.
