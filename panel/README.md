[Русский](README.md) | [English](README.en.md)

# Remnacust Panel

Панель управления пользователями, нодами и подписками. Для установки на VPS используйте готовые образы через установщик; Node.js и Go на сервере не нужны.

| Стабильный компонент | Версия |
| --- | --- |
| [Panel и страница подписки](https://github.com/lottman/Remnacust-panel/releases/tag/v1.1.7.97) | 1.1.7.97 |
| [Installer / комплект](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.136) | 1.2.136 |
| [Node](https://github.com/lottman/Remnacust-node/releases/tag/v1.1.22) | 1.1.22 |
| [Core / WASM](https://github.com/lottman/Remnacust-core/releases/tag/v1.1.13) | 1.1.13 |

## Сервер и порты

Опубликованный установщик 1.2.136 поддерживает **Ubuntu 22.04/24.04/26.04 LTS**, Linux amd64/arm64. Поддержка Debian 12/13 есть в локальных исходниках, но ещё не опубликована в стабильном установщике.

Для небольшой панели ориентируйтесь на 2 CPU, 2 GiB RAM и 20 GiB диска; рекомендуются 4 CPU и 4 GiB RAM. Под базу, журналы и копии нужен дополнительный запас по мере роста нагрузки. Нужны root, домен, доступ к пакетным репозиториям и скачиванию образов.

| Порт | Назначение |
| --- | --- |
| TCP 443 | Публичный HTTPS панели и подписок через reverse proxy. |
| TCP 80 | HTTP/перенаправление и HTTP-01, если выбран этот способ получения сертификата. |
| TCP 3000 | Backend по умолчанию; только loopback или приватная Docker-сеть. |
| TCP 3001 | Health/metrics; не открывайте в интернет. |
| TCP 3010 | Отдельная страница подписки по умолчанию; только за proxy. |

Оставьте доступ к SSH на вашем порту. PostgreSQL и Valkey не должны быть публичными; внутренние порты сервисов не являются портами подключения VPN-клиентов к нодам.

## Установка готовых образов

```bash
curl -fsSL --proto '=https' --proto-redir '=https' https://github.com/lottman/Remnacust-installer/releases/download/v1.2.136/installer.sh -o installer.sh
sudo bash installer.sh install-panel --version 1.2.136
```

Укажите домен и HTTPS; сайт подписки установщик предлагает отдельно. После запуска создайте администратора. Основные команды:

```bash
sudo remnacust manage-panel
sudo remnacust upgrade-panel
```

Задайте A-запись домена на сервер; AAAA добавляйте только при работающем IPv6. HTTPS proxy должен направлять запросы к приватному backend. Для отдельного сайта используйте [инструкцию страницы подписки](../subscription-page/README.md).

## Окружение и постоянные файлы

Рабочая установка: `/opt/remnacust/panel/.env` и `/opt/remnacust/panel/docker-compose.yml`. Фактические пути, включая дополнительные экземпляры, смотрите в `/opt/remnacust/FILES.txt`.

| Параметр | Что сохранить или настроить |
| --- | --- |
| `APP_SECRET` | Исходный постоянный секрет панели. Не заменяйте при обновлении. |
| `DATABASE_URL`, реквизиты PostgreSQL | Согласованные параметры вашей базы, не значения из примера. |
| `PANEL_DOMAIN`, `FRONT_END_DOMAIN` | Домен панели и разрешённый origin интерфейса. |
| `SUB_PUBLIC_DOMAIN` | Публичный домен подписок, не приватный адрес API. |
| `METRICS_USER`, `METRICS_PASS` | Собственные реквизиты доступа к метрикам. |

Не публикуйте `.env`, ключи и токены. После изменения окружения пересоздайте контейнеры:

```bash
cd /opt/remnacust/panel
docker compose config --quiet
docker compose up -d --no-build --pull never
```

Обычный `restart` не перечитывает `.env`. Не удаляйте том PostgreSQL и том копий при обновлении.

## Первое подключение

1. Создайте профиль Xray с inbound и уникальным tag.
2. Добавьте ноду и установите агент с выданными панелью параметрами.
3. Назначьте профиль ноде и включите inbound.
4. Разрешите inbound во внутреннем скваде.
5. Создайте хост с внешним адресом и клиентским портом.
6. Добавьте активного пользователя в сквад и проверьте подписку в клиенте.

Для геофайлов Happ/INCY нужна полная Xray JSON-подписка: `/json` либо основной URL с настроенной выдачей JSON. Набор URI/base64-ссылок не переносит всю маршрутизацию. См. [геофайлы](../docs/GEOFILES.md) и [автовыбор](../docs/XRAY-AUTOSELECT.md).

## Обновление, копии и диагностика

Перед обновлением сохраните БД, `.env`, TLS и конфигурацию proxy; важные копии храните вне сервера. Встроенный ZIP защищён паролем и содержит PostgreSQL custom-format dump. Он не заменяет копию всех файлов установки. Сохраните пароль копий отдельно от `APP_SECRET`: [восстановление и проверки](../docs/BACKUPS.md).

```bash
cd /opt/remnacust/panel
docker compose ps
docker compose logs --tail 100
sudo less /opt/remnacust/logs/installer-panel.log
```

При недоступности интерфейса проверьте контейнеры, proxy, DNS и сертификат. При 503 подписки — здоровье backend, БД, Valkey и доступность ноды. Постановка задания в очередь ещё не подтверждает применение конфигурации: проверьте итоговый статус ноды. Перед передачей журналов удалите секреты и персональные ссылки.

## Разработка

Для source-сборки нужны Node.js 24, Docker Engine/Compose v2 и отдельная тестовая БД. Это другой режим, не обновление установленной панели из checkout.

[Backend](backend/README.md) · [Frontend](frontend/README.md) · [Сборка и проверки](../docs/BUILDING.md) · [API](../docs/API.md) · [Руководство](frontend/public/documentation/guide-ru.md).

Сохраняются [лицензии](../NOTICE.md) upstream-компонентов и AGPL-3.0.
