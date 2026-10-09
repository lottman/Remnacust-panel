# Remnacust Panel

Панель управления пользователями, подписками и нодами Xray на основе Remnawave. Backend хранит данные в PostgreSQL, frontend предоставляет интерфейс и встроенное руководство. В этом репозитории также находится отдельная страница подписки.

**Версия 1.1.7.6** · **Основа: Remnawave 3.4.5** · [Установщик](https://github.com/lottman/Remnacust-installer) · [Telegram](https://t.me/lottman)

![Главная Remnacust](panel/assets/overview.png)

На снимке — демонстрационные данные: трафик, активность пользователей и ресурсы сервера.

## Что умеет панель

- Управлять сроками подписки, трафиком, сквадами и статусами пользователей.
- Регистрировать устройства по HWID, задавать лимиты и блокировать доступ.
- Задавать квоты и скорость для хостов и тегов, выдавать персональный безлимит.
- Создавать профили Xray, хосты, шаблоны подписок и правила ответа клиентам.
- Проверять конфигурацию, генерировать ключи и Short ID в редакторе.
- Показывать состояние нод, статистику, журналы и историю запросов подписки.
- Создавать зашифрованные резервные копии БД по расписанию.

В хостах доступны фильтры «Включённые», «Отключённые», «Видимые» и «Скрытые». Видимость не зависит от включённости: отключённый нескрытый хост попадает в «Видимые». Недоступная нода сама по себе не убирает разрешённый хост из подписки.

## Транспорт Xera HTTP

Xera HTTP — наш форк транспорта XHTTP (SplitHTTP) из Xray-core. Он передаёт соединения VLESS и других поддерживаемых протоколов через HTTP. В конфигурации укажите `network: "xera-http"` и настройки `xeraHttpSettings`. Для соединения нужны совместимые ядра на ноде и в клиенте. Настройки профиля, хоста, режимов и padding описаны в разделе «Документация → Профили → Xera HTTP» внутри панели. Xray JSON сохраняет эти настройки; форматы Singbox и Mihomo этот транспорт не поддерживают.

## Установка

Установщик работает только на Ubuntu 22.04 LTS, 24.04 LTS и 26.04 LTS, amd64/arm64. Для панели нужны минимум 2 CPU, 2 GiB RAM и 20 GiB диска; рекомендуются 4 CPU и 4 GiB RAM. Установщик скачивает готовый Docker-образ; компиляции на сервере нет. Подготовьте домен с DNS на сервер; для HTTPS нужны порты 80 и 443.

Скопируйте всю строку в консоль сервера:

```bash
curl -fsSL --proto '=https' --proto-redir '=https' https://github.com/lottman/Remnacust-installer/releases/latest/download/installer.sh -o installer.sh && sudo bash installer.sh install-panel
```

[Скачать installer.sh](https://github.com/lottman/Remnacust-installer/releases/latest/download/installer.sh). Скрипт спросит версию выпуска, домен, reverse proxy, способ получения сертификата и email ACME. Доступны автоматический HTTPS, Cloudflare/Gcore DNS и готовый сертификат с ключом. Enter выбирает `latest`; `--version 1.2.26` закрепляет выпуск с панелью 1.1.7.6, нодой 1.1.6 и ядром 1.1.4. Он проверяет готовый образ и запускает PostgreSQL, Valkey, панель и Caddy. При собственном reverse proxy используйте `--proxy existing`. Контейнеры прежней установки обнаруживаются до вопросов и скачивания; для них выбирайте `upgrade-panel`. Обновление и миграция сохраняют существующий Nginx/Caddy и его сертификаты. HWID включён по умолчанию. После запуска откройте домен панели и создайте администратора.

При новой установке скрипт также спросит пароль резервных копий. Enter создаёт случайный пароль. Он будет показан в конце установки и сохранён в защищённом файле `backup-password.txt` в каталоге панели; сохраните его отдельно для восстановления копий.

Обновление и перенос существующей установки:

```bash
sudo remnacust upgrade-panel
sudo bash installer.sh migrate-remnawave-panel --container remnawave
```

Перед обновлением сохраняются БД, Compose и окружение. Исходный `APP_SECRET` нужен для старых зашифрованных паролей. Команды восстановления и ограничения переноса описаны в [руководстве установщика](https://github.com/lottman/Remnacust-installer#readme).

## Сборка из исходников

```bash
git clone https://github.com/lottman/Remnacust-panel.git
cd Remnacust-panel
docker build -f panel/Dockerfile -t remnacust-panel:1.1.7.6 .
```

Это сборка образа. Для ручного запуска подготовьте окружение, БД и HTTPS по [README панели](panel/README.md). Исходники страницы подписки и её отдельная установка: [subscription-page/README.md](subscription-page/README.md).

## Документация

- [Руководство панели на русском](panel/frontend/public/documentation/guide-ru.md); версии [EN](panel/frontend/public/documentation/guide-en.md), [FA](panel/frontend/public/documentation/guide-fa.md), [ZH](panel/frontend/public/documentation/guide-zh.md).
- [API и права токенов](docs/API.md).
- [Совместимость нод](docs/NODE-COMPATIBILITY.md).
- [Резервные копии](docs/BACKUPS.md) и [восстановление старой базы](docs/DATABASE-COMPATIBILITY.md).
- [Сборка и разработка](docs/BUILDING.md).

Ссылки `/dashboard/...` в руководстве открывают разделы работающей панели. Для квот отдельных хостов, скорости и отзыва доступа устройств нужен [Remnacust Node](https://github.com/lottman/Remnacust-node) с [нашим ядром](https://github.com/lottman/Remnacust-core). Обычные профили поддерживают стандартные ноды согласно таблице совместимости.

## Лицензия

Backend, frontend и страница подписки сохраняют лицензии Remnawave AGPL-3.0. Исходное авторство и лицензии зависимостей перечислены в [NOTICE.md](NOTICE.md). Официальные материалы Remnawave: [remna.st](https://remna.st/) и [docs.rw](https://docs.rw/).
