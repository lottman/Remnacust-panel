[Русский](README.md) | [English](README.en.md)

# Remnacust Subscription Page

Страница подписки **1.1.7.101** показывает пользователю состояние и инструкции, а VPN-приложению передаёт конфигурацию с панели. Её можно установить отдельно, без переустановки панели.

Комплект 1.2.140 включает Panel/Page 1.1.7.101, Node 1.1.26 и Core/WASM 1.1.16. [Изменения выпуска](../docs/releases/1.1.7.101.md).

## Сервер и установка

Стабильный [Installer 1.2.140](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.140) использует готовые образы и поддерживает Ubuntu 22.04/24.04/26.04 LTS и Debian 12/13, Linux amd64/arm64.

Для отдельной страницы можно начать с **1 CPU и 1 GiB RAM**. Точный минимум памяти не измерен; это начальная рекомендация, не гарантия для любого числа подписчиков, одновременных загрузок и размеров конфигураций. Оставьте место под Docker-образ и журналы. Если рядом работает панель с БД, используйте [требования панели](../panel/README.md#сервер-и-порты).

Нужны домен, HTTPS proxy и доступ от страницы к API панели. Публичный HTTPS — TCP 443; TCP 80 нужен для HTTP/HTTP-01, если выбран этот способ. Порт приложения 3010 по умолчанию оставляйте на loopback или в приватной сети.

```bash
curl -fsSLo installer.sh https://github.com/lottman/Remnacust-installer/releases/latest/download/installer.sh
sudo bash installer.sh install-subscription-page
```

Команда скачивает последний стабильный установщик. В вопросе о версии нажмите Enter для Latest; `--version` нужен только для выбора конкретного выпуска.

Укажите адрес backend панели и ограниченный API-токен. Токен вводится скрыто; для автоматизации поддерживается `--panel-token-file /root/subscription-token` с правами `0600`. Не передавайте значение токена в командной строке.

## Минимальный API-токен

Создайте токен в настройках панели с четырьмя правами:

```text
system:metadata
subscriptions:subpage-config
subscription-page-configs:get
subscription-page-configs:list
```

Полный доступ к пользователям не нужен. При отдельно включённой совместимости Marzban может потребоваться дополнительное `users:by-username`. Адрес API и токен остаются серверными настройками, не частью публичной ссылки подписчика.

## `.env` и постоянные пути

Основная установка: `/opt/remnacust/subscription-page/.env` и `docker-compose.yml`. Дополнительные страницы получают отдельные ID, каталоги и loopback-порты. Фактические пути смотрите в `/opt/remnacust/FILES.txt`.

| Параметр | Назначение |
| --- | --- |
| `REMNAWAVE_PANEL_URL` | Backend API. В общей Docker-сети возможен `http://remnawave:3000`; для удалённой панели используйте HTTPS. |
| `REMNAWAVE_API_TOKEN` | Токен с указанными четырьмя правами. |
| `APP_PORT` | Порт приложения, по умолчанию 3010. |
| `CUSTOM_SUB_PREFIX` | Необязательный префикс без `/` в начале и конце; согласуйте его с proxy и публичным URL. |
| `TRUST_PROXY` | Только ваши реальные proxy/hops, не произвольные отправители заголовков. |
| `CADDY_AUTH_API_TOKEN` | Дополнительный серверный `X-Api-Key`, если его требует шлюз перед API. |

После изменения `.env` из каталога нужной страницы выполните `docker compose config --quiet` и `docker compose up -d --no-build --pull never`. `restart` не перечитывает окружение. При изменении порта согласуйте `APP_PORT`, port mapping Compose и upstream proxy; source-Compose по умолчанию закреплён на 3010.

## DNS, CDN и геофайлы

Для прямого домена задайте A/AAAA на ваш сервер; AAAA нужен только при работающем IPv6. Для CDN используйте DNS-назначение, выданное провайдером. В панели откройте **Подписка → Настройки → Страницы подписки → Домены подписок**, зарегистрируйте основной домен и нужные CDN.

Источник HTTPS, Host/SNI и сгенерированную пару заголовка запроса копируйте из карточки CDN в кабинет провайдера. Если CDN меняет Host, сохраните идентификацию домена через эти параметры или выданную панелью ссылку с ID домена. Не включайте принудительное общее кеширование подписок: proxy/CDN должны соблюдать `Cache-Control`. Иначе могут оставаться старые права, ключи и конфигурации.

Для маршрутизации и геофайлов Happ/INCY нужна **полная Xray JSON-подписка**: `/json` либо базовый URL с включённой JSON-выдачей. URI/base64-ссылок недостаточно. Геофайлы задаются в шаблоне панели; страница передаёт JSON, routing-заголовок и DAT/SHA-256 для поддерживаемых клиентов. После изменения шаблона обновите подписку в клиенте. Подробности: [геофайлы](../docs/GEOFILES.md).

## Управление и диагностика

```bash
sudo remnacust manage-subscription-page
sudo remnacust upgrade-subscription-page --page-id ID
```

Замените `ID` идентификатором страницы из меню управления. Обновление сохраняет подключение и настройки; остановленная страница должна оставаться остановленной. Перед обслуживанием сохраните её `.env`, Compose, TLS/proxy и токен в защищённой копии. Пользователи и подписки хранятся в панели: сохраняйте также [БД панели](../docs/BACKUPS.md).

```bash
cd /opt/remnacust/subscription-page
docker compose ps
docker compose logs --tail 100
sudo less /opt/remnacust/logs/installer-subscription-page.log
```

Для дополнительной страницы используйте её фактический каталог. Проверьте адрес API из контейнера, срок/права токена, HTTPS, prefix и `TRUST_PROXY`. 404 означает неизвестную подписку; 503 — временную недоступность или перегрузку. Публичная страница и API панели должны быть доступны независимо от того, открывается ли браузерный интерфейс администратора. Не отправляйте журналы без удаления секретов и персональных ссылок.

## Сборка из исходников

Для source-режима, из корня репозитория:

```bash
cp subscription-page/.env.sample subscription-page/.env
chmod 600 subscription-page/.env
```

Заполните этот `.env`, затем:

```bash
cd subscription-page
docker compose up -d --build
```

Обычный `docker-compose.yml` собирает исходники. `docker-compose-prod.yml` содержит upstream-образ Remnawave и не является рецептом установки готового Remnacust: для готовых образов используйте установщик.

Для разработки нужен Node.js 26.13 LTS. Из `subscription-page` выполните `npm ci --prefix backend`, `npm ci --prefix frontend`, затем `npm run typecheck --prefix backend` и `npm run typecheck --prefix frontend`. Dev-backend читает `.env` из своего рабочего каталога; корневой `.env` выше предназначен для Compose. [Полные проверки](../docs/BUILDING.md).

Сохраняются [AGPL-3.0 и авторство](../NOTICE.md) Remnawave Subscription Page.
