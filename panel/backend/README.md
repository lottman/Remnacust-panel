# Remnacust Backend

**Версия 1.1.7.86**, основа Remnawave 3.4.7. NestJS API, фоновые обработчики и scheduler используют PostgreSQL, Valkey и общую контрактную библиотеку [libs/contract](libs/contract).

## Разработка

Нужен Node.js 24. Из этого каталога:

```bash
npm ci
npm run migrate:generate
npm run typecheck
node --test tests/*.test.cjs
npm run build
```

Для runtime подготовьте `.env` по [.env.sample](.env.sample) и отдельную тестовую БД. В скриптовой production-установке окружение находится в `/opt/remnacust/panel/.env`, а не в checkout. [Установка и метаданные образа](../README.md).

Часть интеграционных проверок требует Linux, PostgreSQL/Valkey и соседний checkout Node; точные сервисы и переменные перечислены в [Source checks](../../.github/workflows/check.yml). Не запускайте интеграционные сценарии на рабочей БД.

## Контракт и зависимости

На Linux `npm run generate:openapi` обновляет [openapi.json](openapi.json). После изменения контракта пересоздайте справочник frontend через `npm run docs:generate` в `panel/frontend` и выполните `npm run docs:check`. Сохранённый backend OpenAPI и публичная копия должны совпадать.

`npm ci` применяет только проверенные патчи зависимостей из [patches](patches/README.md). При установке с `--ignore-scripts` запустите `node scripts/apply-dependency-patches.cjs` отдельно.

## Текущие возможности

Поддерживаются FROZEN, персональные устройства, лимиты хостов/тегов, автосборка геоправил и DAT, домены подписок и отдельные права на обычные/CDN-ссылки. Ревизия профиля Happ/INCY стабильна при неизменившихся данных и хранится атомарно в Valkey/Redis. Ручной заголовок маршрутизации не перезаписывается автоматически.

[README проекта](../../README.md) · [API и права](../../docs/API.md) · [Сборка](../../docs/BUILDING.md) · [Лицензия AGPL-3.0](LICENCE).
