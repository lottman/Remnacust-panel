# Сборка панели

Нужны Node.js 24 и Docker Engine с Compose v2. Для локальной разработки используйте отдельную PostgreSQL и собственный `.env`; файл с рабочими секретами не добавляйте в Git.

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

Полный образ из корня: `docker build -f panel/Dockerfile -t remnacust-panel:1.1.7.39 .`. Проверка запуска: `bash scripts/test-production-startup.sh remnacust-panel:1.1.7.39`. Она создаёт временные контейнеры и отдельную БД.

В готовом выпуске окно «Информация о сборке» показывает ветку `main`, UTC-время сборки, номер запуска GitHub Actions и коммит из `Remnacust-panel`. Серверная часть и интерфейс находятся в одном репозитории, поэтому их SHA совпадают. Эти данные передаются в образ при сборке и проверяются перед публикацией. У локальной сборки без build args остаются `local` и `unknown`: дата запуска контейнера не подменяет дату сборки.

Страница подписки: `docker build -t remnacust-subscription-page:1.1.7.39 subscription-page`. Для разработки выполните `npm ci` и `npm run typecheck` в `subscription-page/backend` и `subscription-page/frontend`, затем `NODE_ENV=production npm run cb` во frontend и `node --test tests/*.test.cjs` в backend.

Ядро и редактор находятся в [Remnacust-core](https://github.com/lottman/Remnacust-core). После обновления WASM пересоберите панель. Порядок выпуска всех компонентов: [Remnacust-installer/docs/PUBLISHING.md](https://github.com/lottman/Remnacust-installer/blob/main/docs/PUBLISHING.md).

## Каталог проверенных сборок ядра

Панель поставляется с `panel/backend/src/modules/core-management/core-releases.json`: это закреплённые публичные бинарники для amd64 и arm64, их SHA-256 и коммит исходников. Открытие списка не требует запроса к GitHub. Перед выпуском нового ядра создайте его тег на проверенном коммите и запустите workflow `Publish verified core binaries` в Remnacust-core. После успешных нативных проверок опубликуйте его черновик, затем выполните из корня панели:

```bash
python3 panel/backend/scripts/sync-core-catalog.py --tag v1.1.9 --commit 200471a6b102d2c0412dcefe71dfccaf2bd63bb2
```

Скрипт сверяет тег с коммитом, контрольные суммы выпуска и реально скачанные файлы, включая ELF-архитектуру; только после этого записывает каталог. Добавьте JSON в коммит панели. Пакетировщик выпуска проверяет, что первая сборка каталога соответствует закреплённым версии и коммиту ядра в `component-sources.json`.

`REMNACUST_CORE_CATALOG_JSON`, если задана, полностью заменяет встроенный каталог; пустая строка или `[]` намеренно отключают список. Не добавляйте пустую переменную в стандартный Compose. Для публичных файлов нашего репозитория новая нода не требует `REMNACUST_CORE_ALLOWED_HOSTS`; при явном задании этой переменной сохраняется собственный список разрешённых хостов. SHA-256, архитектура, совместимость квот и проверка конфигурации остаются обязательными.
