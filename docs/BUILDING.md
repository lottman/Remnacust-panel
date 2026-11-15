# Сборка панели

Нужны Node.js 26.13.1, закреплённый в CI, и Docker Engine с Compose v2. Для локальной разработки используйте отдельную PostgreSQL и собственный `.env`; файл с рабочими секретами не добавляйте в Git.

В минимальном Ubuntu/Debian-окружении для запуска Node.js 26 нужны `libstdc++6` и `libatomic1`. Это зависимости среды сборки и тестов; при установке готовых образов Node.js на VPS не требуется.

Часть проверок сравнивает панель с агентом. Клонируйте `Remnacust-node` рядом с панелью либо задайте `REMNACUST_NODE_SOURCE` на его каталог `node`. Установите зависимости frontend командой `npm ci --prefix panel/frontend` из корня.

Backend:

```bash
cd panel/backend
npm ci
npm run migrate:generate
npm run typecheck
node --test tests/*.test.cjs
npm run build
```

Frontend, из корня checkout:

```bash
cd panel/frontend
npm ci
npm run docs:check
npm run i18n:check
npm run typecheck
NODE_PATH="$PWD/node_modules" node --test tests/*.test.cjs tests/*.test.mjs
npm run cb
```

`npm run docs:generate` пересоздаёт руководство и справочник из актуальных исходников. Frontend dev-сервер запускается через `npm run start:dev` и требует тестового backend.

Полный образ из корня: `docker build -f panel/Dockerfile -t remnacust-panel:local .`. Проверка запуска: `bash scripts/test-production-startup.sh remnacust-panel:local`. Она создаёт временные контейнеры и отдельную БД. Метка `:local` обозначает собственную сборку, а не опубликованный выпуск. Установка готовых образов описана в [README панели](../panel/README.md) ([English](../panel/README.en.md)).

В готовом выпуске окно «Информация о сборке» показывает ветку `main`, UTC-время сборки, номер запуска GitHub Actions и коммит из `Remnacust-panel`. Серверная часть и интерфейс находятся в одном репозитории, поэтому их SHA совпадают. Эти данные передаются в образ при сборке и проверяются перед публикацией. У локальной сборки без build args остаются `local` и `unknown`: дата запуска контейнера не подменяет дату сборки.

Страница подписки: `docker build -t remnacust-subscription-page:local subscription-page`. Для разработки выполните `npm ci` и `npm run typecheck` в `subscription-page/backend` и `subscription-page/frontend`, затем `NODE_ENV=production npm run cb` во frontend и `node --test tests/*.test.cjs` в backend. Настройка `.env`, API-токена и proxy: [инструкция страницы](../subscription-page/README.md) ([English](../subscription-page/README.en.md)).

Ядро и редактор находятся в [Remnacust-core](https://github.com/lottman/Remnacust-core). После обновления WASM пересоберите панель. Порядок выпуска всех компонентов: [Remnacust-installer/docs/PUBLISHING.md](https://github.com/lottman/Remnacust-installer/blob/main/docs/PUBLISHING.md).

## Каталог проверенных сборок ядра

Панель поставляется с `panel/backend/src/modules/core-management/core-releases.json`: это закреплённые публичные бинарники для amd64 и arm64, их SHA-256 и коммит исходников. Открытие списка не требует запроса к GitHub. Перед выпуском нового ядра создайте его тег на проверенном коммите и запустите workflow `Publish verified core binaries` в Remnacust-core. После успешных нативных проверок опубликуйте его черновик, затем выполните из корня панели:

```bash
python3 panel/backend/scripts/sync-core-catalog.py --tag v1.1.16 --commit "${CORE_SOURCE_COMMIT:?set the verified Core 1.1.16 source commit}"
```

Скрипт сверяет тег с коммитом, контрольные суммы выпуска и реально скачанные файлы, включая ELF-архитектуру; только после этого записывает каталог. Добавьте JSON в коммит панели. Пакетировщик выпуска проверяет, что первая сборка каталога соответствует закреплённым версии и коммиту ядра в `component-sources.json`.

`REMNACUST_CORE_CATALOG_JSON`, если задана, полностью заменяет встроенный каталог; пустая строка или `[]` намеренно отключают список. Не добавляйте пустую переменную в стандартный Compose. Для публичных файлов нашего репозитория новая нода не требует `REMNACUST_CORE_ALLOWED_HOSTS`; при явном задании этой переменной сохраняется собственный список разрешённых хостов. SHA-256, архитектура, совместимость квот и проверка конфигурации остаются обязательными.


Изменения поведения сверяйте с [картой последних 45 изменений](DOCUMENTATION-SYNC.md). Перед проверкой справочника удалите временные `.audit-*` UI-fixtures и запустите `npm run docs:generate`. Текущие руководства должны различать скорость Mbps, объём GiB, пользовательскую область хоста и общий пул; исторические аудиты сохраняют свои версии и даты.

## Технические справочники и целевые проверки

Эта страница и [API](API.md) предназначены для разработчиков и интеграторов. Администраторские процедуры находятся в [руководстве](../panel/frontend/public/documentation/guide-ru.md), [обслуживании](OPERATIONS.md) и [сверке после восстановления](QUOTA-RECOVERY.md). Датированные аудиты фиксируют прежние результаты и не подтверждают повторное выполнение проверок для новой сборки.

Контракт управляющих адресов задаётся в [node-control-addresses.schema.ts](../panel/backend/libs/contract/models/node-control-addresses.schema.ts), совместимость прежних полей — в [node-control-addresses.ts](../panel/backend/src/modules/nodes/node-control-addresses.ts), выбор маршрута — в [node-control-route.ts](../panel/backend/src/common/axios/node-control-route.ts). Проверяйте нормализацию IPv6/имён, порядок, выключенные адреса, сохранение старых записей, конфликт ревизий и сохранение SOCKS для каждого резерва.

Для целевой проверки из `panel/backend`:

```bash
node --test tests/node-control-route.test.cjs tests/node-control-route-transport.test.cjs tests/node-route-registry.test.cjs tests/node-route-inventory.test.cjs
node --test tests/autoselect-load-balance.test.cjs tests/subscription-template-drafts.test.cjs tests/template-copy.test.cjs tests/quota-recovery-permissions.test.cjs
```

Сохранение шаблона проверяйте отдельно от получения его клиентом. Межпроцессная согласованность требует [проверки с отдельным Redis](../panel/backend/tests/subscription-template-cache-redis.integration.cjs), а история и восстановление квот — соответствующих `*.database.integration.cjs` с отдельной PostgreSQL. Переменные и порядок запуска берите из [CI](../.github/workflows/check.yml). Не направляйте эти проверки на рабочую базу.

Таблицы `xera_quota_*` используются как напрямую, так и функциями БД: отсутствие вызова модели или текущих строк не доказывает, что таблица не нужна. Изменение схемы требует миграции, проверки старых данных и сценариев восстановления. Конкретные контракты и административные ограничения описаны в [API](API.md).

Механизм скорости Core проверяется в `xray/app/dispatcher/host_policy_test.go` репозитория Remnacust-core:

```bash
go test ./app/dispatcher -run 'TestHostPolicy(SharesSpeedAcrossConnectionsAndDevices|V2TagUserSpeedIsIndependentPerHost|V2WholeHostSpeedAcrossUsersAndDirections|V2GroupSpeedAcrossHosts)$' -count=1
```

Эти проверки механизма не заменяют подтверждение доставки политики на установленную ноду и проверку клиентского трафика.

### Ручная конфигурация Xera HTTP

Примеры ниже предназначены для разработчиков и интеграторов. В операторском руководстве описываются выбор настроек, применение и ограничения. Контракт адаптации сверяется с [Core 564a9df4](https://github.com/lottman/Remnacust-core/commit/564a9df4), в частности [построителем конфигурации](https://github.com/lottman/Remnacust-core/blob/564a9df4/xray/infra/conf/transport_xera_http.go) и [проверкой границ](https://github.com/lottman/Remnacust-core/blob/564a9df4/xray/transport/internet/xerahttp/config.go).

Фрагмент существующего inbound или outbound; он не заменяет полный профиль, клиентов, порт и сертификаты:

```json
{
  "streamSettings": {
    "network": "xera-http",
    "security": "tls",
    "xeraHttpSettings": {
      "path": "/connect",
      "mode": "auto",
      "adaptive": {
        "mode": "balanced",
        "minStreams": 4,
        "maxStreams": 32
      }
    }
  }
}
```

Канонический путь — `streamSettings.xeraHttpSettings.adaptive`. При наличии объекта все три поля обязательны: `mode` принимает только `balanced`, `low-latency`, `unstable-network`; целые границы удовлетворяют `1 <= minStreams <= maxStreams <= 32`. Неизвестные поля и неверные типы отклоняются. Значения 4/32 предлагает форма, они не заменяют отсутствующие обязательные поля. Начальный бюджет 8 ограничивается выбранным диапазоном; минимум не создаёт запросов при простое.

Если профиль уже использует `xeraHttpSettings.extra`, адаптацию помещают в действующий `extra`: он определяет эффективные настройки транспорта. Форма сохраняет эту структуру и меняет три поля адаптации только по явному действию «Применить в JSON». Сохранение профиля и обновление клиентской подписки выполняются отдельно. Отсутствующий `adaptive` сохраняет прежнее поведение. Ручные `mode`, `xmux`, ALPN, padding и квоты не переписываются. Параметры inbound передаются клиентам связанных хостов; это не настройка серверного ограничения запросов.

Учитываются одновременно активные HTTP-запросы отдельно для направления, назначения и поколения конфигурации. Это не лимит физических TCP-сокетов, всех сессий устройства или CPU. Адаптация меняет допуск новых запросов, не прерывая и не повторяя начатые. Применение требует Remnacust Core 1.1.22 или новее у клиента; совместимость предыдущего Xera-пира проверяется отдельно от наличия поддержки адаптации. Панель и выбранный режим Core не доказывают версию ядра приложения.

При ручном переносе с XHTTP используйте копию: замените `streamSettings.network` на `xera-http`, перенесите совместимые параметры из `xhttpSettings` в `xeraHttpSettings` и удалите прежний блок из этой копии. Протокол, пользователя и TLS/REALITY сохраняйте, если их изменение не требуется отдельно. Поддержка XHTTP сама по себе не подтверждает поддержку Xera.

Серверные параметры `h2Params` и `finalmask.quicParams.maxIncomingStreams` настраиваются отдельно от адаптации клиента. Для HTTP/2 используются поля `MaxConcurrentStreams`, `MaxReadFrameSize` и другие поддерживаемые параметры; единица тайм-аутов — наносекунды. Значение `MaxReadFrameSize`, отсутствующее или равное 0, даёт 16384 байта; явное значение сохраняется, а внешний CDN объявляет собственный предел. Для Xera HTTP/3 неуказанный или нулевой `maxIncomingStreams` вычисляется как `2 × serverMaxSessions + 256` с эффективным значением сессий 4096 по умолчанию; это 8448 двунаправленных QUIC-потоков на соединение. Явный предел сохраняется, `-1` запрещает входящие двунаправленные потоки. Эти числа не являются границами `adaptive` и не гарантируют расход памяти или пропускную способность.

Контракт и совместимость `extra` проверяются в `xray/infra/conf/xera_adaptive_test.go`, обратная связь и жизненный цикл — в `xray/transport/internet/xerahttp/adaptive*_test.go` репозитория Core. В панели целевая проверка формы из `panel/frontend`: `node --test tests/xera-settings-control.test.cjs`. Она проверяет явное применение, сохранение ручных полей, границы и Undo; не подтверждает сетевой эффект. Полную проверку схем, WASM, двух пиров и трафика выполняйте на согласованном наборе Core/редактора перед выпуском.

API меняется до генерации справочника: сначала обновите backend OpenAPI, затем выполните `npm run docs:generate` и `npm run docs:check` во frontend. Исходники статей находятся в `docs-tools/`; исправление только `public/documentation/guide-*.md` не сохраняется при следующей генерации. Проверка справочника также отклоняет приватные рабочие пути и заметки об агенте или внутренней архитектуре в операторских статьях. Лицензии и происхождение компонентов сохраняются в [NOTICE](../NOTICE.md).
