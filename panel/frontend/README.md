[Русский](README.md) | [English](README.en.md)

# Remnacust Frontend

Исходники интерфейса панели **1.1.7.101**. В готовой установке он уже включён в образ панели: отдельный Vite-сервер на VPS не требуется. [Установка, ресурсы и порты](../README.md).

## Локальная разработка

Нужны Node.js 26.13 LTS и отдельный тестовый backend. Из этого каталога:

```bash
cp .env.sample .env
npm ci
npm run start:dev
```

Интерфейс доступен на `http://127.0.0.1:3333`. В `.env` проверьте:

```dotenv
DOMAIN_BACKEND=http://127.0.0.1:3003
DOMAIN_OVERRIDE=1
NODE_ENV=development
```

Порт должен совпадать с `APP_PORT` тестового backend. Его CORS origin должен разрешать этот локальный интерфейс. Не помещайте API-токены и серверные секреты в frontend `.env`: настройки браузерной сборки доступны пользователю. Backend запускается по [своей инструкции](../backend/README.md).

## Проверки и сборка

```bash
npm run typecheck
npm run i18n:check
npm run docs:check
NODE_PATH="$PWD/node_modules" node --test tests/*.test.cjs tests/*.test.mjs scripts/*.test.cjs
npm run cb
```

Команда тестов приведена для Linux. Для полного production-образа используйте [Docker-сборку из корня репозитория](../../docs/BUILDING.md), а для обычного обновления — `sudo remnacust upgrade-panel` на сервере установки.

## Редактор и документация

Текущие исходники включают Core/WASM **1.1.16**, Xray v26.10.31. Проверка ресурсов редактора:

```bash
node verify-editor-assets.mjs
```

WASM, `wasm_exec.js` и схема должны обновляться согласованно из [Remnacust-core/editor](https://github.com/lottman/Remnacust-core/tree/main/editor), затем нужно пересобрать frontend. Браузерная проверка конфигурации не проверяет DNS, доступность сервера и реальное соединение клиента.

Источники руководства — [docs-tools](docs-tools), локализация — [public/locales](public/locales). При намеренном изменении документации запускайте `npm run docs:generate`, затем `npm run docs:check` и `npm run i18n:check`. API-справочник строится из backend OpenAPI; не редактируйте только его публичную копию.

## Диагностика

При ошибке dev-подключения проверьте адрес backend, его порт, CORS и журнал API. Для установленной панели проверьте `docker compose ps`, `docker compose logs --tail 100` из `/opt/remnacust/panel`, DNS и HTTPS proxy. Ошибку схемы/редактора проверяйте через `verify-editor-assets.mjs`; после обновления обновите страницу. Сохраняйте изменения редактора до обслуживания панели.

[Руководство RU](public/documentation/guide-ru.md) · [EN](public/documentation/guide-en.md) · [API](../../docs/API.md) · [Лицензия AGPL-3.0](LICENCE).
