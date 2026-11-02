# Remnacust Frontend

**Версия 1.1.7.87**, основа Remnawave 3.4.7. React-интерфейс панели с темами, мобильной компоновкой, редактором конфигураций и документацией на RU/EN/FA/ZH.

## Разработка

Нужен Node.js 24 и отдельный тестовый backend. Из этого каталога:

```bash
npm ci
npm run typecheck
npm run i18n:check
npm run docs:check
npm run cb
```

Dev-сервер: `npm run start:dev`. Проверки интерфейса: `NODE_PATH="$PWD/node_modules" node --test tests/*.test.cjs tests/*.test.mjs scripts/*.test.cjs` на Linux. Конфигурация API и способы запуска описаны в [руководстве разработки](../../docs/BUILDING.md).

## Документация и локализация

Источники руководства находятся в [docs-tools](docs-tools), переводы интерфейса — в исходниках frontend. После изменения руководства выполните `npm run docs:generate`, затем `npm run docs:check` и `npm run i18n:check`. API-справочник генерируется из актуального `panel/backend/openapi.json`; версию спецификации нельзя менять только в публичной копии.

## Редактор Xray

`main.wasm`, `wasm_exec.js` и схема соответствуют Remnacust Core 1.1.12 / Xray v26.10.31. `node verify-editor-assets.mjs` проверяет согласованность ресурсов. Для обновления используйте сборщик из [Remnacust-core/editor](https://github.com/lottman/Remnacust-core/tree/main/editor), затем пересоберите frontend.

Проверка в браузере не проверяет DNS, доступность сервера и фактический запуск VPN-клиента. Автовыбор, геофайлы и JSON используют общий черновик; сохранение черновика с предупреждениями отличается от успешного применения рабочей конфигурации.

[README проекта](../../README.md) · [Установка панели](../README.md) · [Документация RU](public/documentation/guide-ru.md) · [Лицензия AGPL-3.0](LICENCE).
