[Русский](README.md) | [English](README.en.md)

# Remnacust Backend

Версия исходников **1.1.7.100**. API, фоновые обработчики и scheduler панели. Для обычной установки используйте [готовые образы](../README.md); этот каталог предназначен для разработки.

## Установка готового комплекта

Скачать последний стабильный установщик и открыть его интерактивное меню:

```bash
curl -fsSLo installer.sh https://github.com/lottman/Remnacust-installer/releases/latest/download/installer.sh && sudo bash installer.sh
```

## Что требуется

Node.js 26.13 LTS, отдельные PostgreSQL и Valkey, тестовый `.env`. Требования к серверу и приватным портам: [инструкция панели](../README.md#сервер-и-порты). Версии и перенос базы описаны в [совместимости БД](../../docs/DATABASE-COMPATIBILITY.md).

Из этого каталога:

```bash
cp .env.sample .env
chmod 600 .env
npm ci
npm run migrate:generate
npm run build --prefix libs/contract
```

До запуска заполните `.env`: собственные `APP_SECRET`, `DATABASE_URL`, параметры Valkey, домены и реквизиты метрик. Примеры секретов не подходят для установки. Для frontend dev-примера задайте `APP_PORT=3003`; в готовом образе backend по умолчанию использует 3000. Health/metrics по умолчанию находятся на приватном 3001.

В source-Compose Valkey использует Unix socket. Если ваш тестовый Valkey доступен по TCP, уберите `REDIS_SOCKET` и задайте `REDIS_HOST`/`REDIS_PORT`. Не подставляйте рабочую БД в команды разработки.

## Запуск и проверки

На подготовленной тестовой базе примените миграции, затем запустите процессы в отдельных терминалах:

```bash
npm run migrate:deploy
npm run dev
```

```bash
npm run dev:worker
```

```bash
npm run dev:scheduler
```

Держите только один scheduler. Сборщик в dev-режиме сам запускает соответствующий процесс.

```bash
npm run typecheck
node --test tests/*.test.cjs
npm run build
```

Для полного набора тестов установите также frontend-зависимости: `npm ci --prefix ../frontend`. Часть интеграционных тестов требует Linux, PostgreSQL/Valkey и соседние исходники Node. Сервисы и переменные перечислены в [CI](../../.github/workflows/check.yml). Успешный typecheck не заменяет эти интеграционные проверки.

## Контракты, файлы и диагностика

`npm ci` применяет проверенные dependency patches из [patches](patches/README.md). После `--ignore-scripts` выполните `node scripts/apply-dependency-patches.cjs` вручную. Генерация OpenAPI на Linux: `npm run generate:openapi`; документацию frontend обновляйте только после обновления backend-спецификации.

PEM-файлы, которые читает панель, размещайте внутри `/var/lib/remnawave`; путь к сертификату только на ноде не означает наличие этого файла на сервере панели. Сохраняйте постоянные файлы и том копий при пересоздании контейнеров.

В установленной панели окружение находится в `/opt/remnacust/panel/.env`. После его изменения нужен `docker compose up -d --no-build --pull never` из каталога установки. Для диагностики используйте `docker compose ps`, `docker compose logs --tail 100` и `/opt/remnacust/logs/installer-panel.log`.

Для отдельной страницы достаточно четырёх прав токена: `system:metadata`, `subscriptions:subpage-config`, `subscription-page-configs:get`, `subscription-page-configs:list`. Не используйте токен администратора вместо этого набора; [настройка страницы](../../subscription-page/README.md).

[Сборка Docker](../../docs/BUILDING.md) · [API](../../docs/API.md) · [Копии](../../docs/BACKUPS.md) · [Лицензия AGPL-3.0](LICENCE).
