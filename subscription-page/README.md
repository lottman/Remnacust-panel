# Remnacust Subscription Page

**Версия 1.1.7.85**, основа Remnawave Subscription Page 8.0.1. В браузере показывает данные подписки и инструкции; VPN-приложению отдаёт выбранный формат конфигурации. Панель и сайт обновляются согласованным [комплектом 1.2.121](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.121).

## Установка

Страницу можно поставить отдельно, без переустановки панели:

```bash
curl -fsSL --proto '=https' --proto-redir '=https' https://github.com/lottman/Remnacust-installer/releases/latest/download/installer.sh -o installer.sh
sudo bash installer.sh install-subscription-page --version 1.2.121
```

Поддерживаются Ubuntu 22.04/24.04/26.04 LTS и Linux amd64/arm64. При `install-panel` скрипт отдельно спрашивает, нужен ли сайт подписки. Локальная панель подключается через Docker-сеть и ограниченный токен; удалённая — по HTTPS.

```bash
sudo remnacust install-subscription-page --panel-url https://panel.example.com
sudo remnacust manage-subscription-page
sudo remnacust upgrade-subscription-page --page-id ID
sudo remnacust configure-subscription-page --page-id ID --panel-url https://other-panel.example.com
sudo remnacust uninstall-subscription-page --page-id ID
```

Токен вводится скрыто либо читается из `--panel-token-file /root/subscription-token` с правами `0600`. Нужны права страницы: `system:metadata`, `subscriptions:subpage-config`, `subscription-page-configs:get`, `subscription-page-configs:list`. Полный доступ к пользователям не требуется.

## Файлы и параметры подключения

Рабочие файлы: `/opt/remnacust/subscription-page/.env` и `docker-compose.yml`. Дополнительные экземпляры имеют отдельные ID, постоянные каталоги и loopback-порты; активные пути записаны в `/opt/remnacust/FILES.txt`.

При ручной source-установке скопируйте [.env.sample](.env.sample) в `.env`, задайте права `600` и заполните:

| Переменная | Назначение |
| --- | --- |
| `REMNAWAVE_PANEL_URL` | Серверный адрес backend; в общей Docker-сети — например `http://remnawave:3000`, для удалённой панели — HTTPS. |
| `REMNAWAVE_API_TOKEN` | Ограниченный токен сайта подписки. |
| `APP_PORT` | Порт приложения, по умолчанию 3010. |
| `CUSTOM_SUB_PREFIX` | Необязательный префикс без начального и конечного `/`. |
| `TRUST_PROXY` | Только фактические доверенные reverse proxy / число hop. |
| `CADDY_AUTH_API_TOKEN` | Серверный `X-Api-Key`, если перед API установлен соответствующий шлюз. |

Адрес панели, API-токен и Docker-имя используются на сервере; не подставляйте их в публичную ссылку клиента. Внешний HTTPS proxy направляется на `127.0.0.1:3010` либо выбранный свободный порт. Не публикуйте порт приложения на всех интерфейсах вместо настройки proxy.

## Основной домен и CDN

В панели: **Подписка → Настройки → Страницы подписки → Домены подписок**. Основной домен синхронизируется с `SUB_PUBLIC_DOMAIN` через локальную службу установщика. На основной домен допускается до трёх CDN.

Для VK/Yandex скопируйте из карточки CDN источник HTTPS, Host/SNI и сгенерированные имя/значение заголовка запроса. Если CDN переписывает Host, используйте эту настройку или выданную панелью ссылку с ID домена. Ссылки и геофайлы тогда используют зарегистрированный публичный CDN-адрес. Ответы подписки должны проходить без принудительного общего кеширования. В карточке пользователя доступны отдельные обычные/CDN-ссылки.

## Геофайлы, Happ и INCY

Геофайлы настраиваются в шаблоне панели, а сайт передаёт конфигурацию, routing-заголовок, DAT и SHA-256. Небольшие наборы входят в JSON; большие — в объединённые DAT для поддерживаемых Happ/INCY. Нужна JSON-подписка: базовый путь с включённой выдачей JSON либо `/json`.

Проверяется размер отдельного профиля, а не сумма всех хостов. URL DAT для INCY стабильны; `.sha256` возвращает checksum того же файла, интервал задаётся в часах. Неизменившийся профиль Happ/INCY не получает новый `LastUpdated` при каждом запросе. Смена файла, режима или параметров обновляет профиль. Планирование загрузок и запуск соединения выполняет приложение; серверная проверка JSON не подтверждает работу системного туннеля iOS.

Сайт потоково передаёт DAT с отдельным пределом 64 MiB; лимит JSON не должен обрезать бинарный файл. Пользовательская авторизация не пересылается на произвольный внешний URL. [Форматы, ограничения и диагностика](../docs/GEOFILES.md).

## Обновление и перенос

`upgrade-subscription-page` сохраняет подключение к панели, публичный домен, порт и настройки; остановленная страница остаётся остановленной. При ошибке готовности предусмотрен откат конфигурации. В меню управления можно сменить backend и его токен независимо от публичного домена.

Перенос со старой страницы Remnawave предлагается отдельно. Страница уже на образе Remnacust не считается кандидатом на повторный перенос. Обновление панели не заменяет произвольно сторонний Nginx, CDN или отдельно размещённый сайт.

## Сборка и проверки

Из корня репозитория:

```bash
docker build -t remnacust-subscription-page:local subscription-page
```

Для исходного Compose в этом каталоге после заполнения `.env`: `docker compose up -d --build`. Образ сам собирает backend и frontend; checkout панели для сборки не нужен. Разработка требует Node.js 24; `npm ci` и `npm run typecheck` выполняются отдельно в `backend` и `frontend`.

Из корня на выделенном Docker-стенде:

```bash
bash subscription-page/tests/delivery.sh YOUR_PANEL_IMAGE YOUR_SUBPAGE_IMAGE
```

Сценарий создаёт собственный Compose-проект и тестовую БД; использует loopback-порты 43875/43876. Не запускайте его поверх рабочей установки.

## Диагностика

Проверьте доступ к API, права и срок токена, HTTPS, `TRUST_PROXY` и совпадение префикса proxy с `CUSTOM_SUB_PREFIX`. Неизвестная подписка отвечает 404, временная недоступность — 503 с возможностью повтора. Ошибки страницы локализованы на RU/EN/FA/ZH. После изменения `.env` пересоздайте контейнер, а после изменения шаблона обновите подписку в клиенте.

[Установщик](https://github.com/lottman/Remnacust-installer#readme) · [API](../docs/API.md) · [README проекта](../README.md). Сохраняются AGPL-3.0 и авторство [Remnawave Subscription Page](https://github.com/remnawave/subscription-page).
