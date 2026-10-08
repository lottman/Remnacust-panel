# Установка и обслуживание

Скрипт находится в [`installer/installer.sh`](https://github.com/lottman/Remnacust-installer/blob/main/installer/installer.sh); полное руководство, команды, параметры, миграция и восстановление — в [`installer/README.md`](https://github.com/lottman/Remnacust-installer/blob/main/installer/README.md).

Запуск меню из консоли сервера:

```bash
curl -fsSL --proto '=https' --proto-redir '=https' https://github.com/lottman/Remnacust-installer/releases/latest/download/installer.sh -o installer.sh && sudo bash installer.sh
```

[Скачать installer.sh](https://github.com/lottman/Remnacust-installer/releases/latest/download/installer.sh). Установка, обновление и миграция доступны только на Ubuntu 22.04 LTS, 24.04 LTS и 26.04 LTS (amd64/arm64). На другой ОС приложение и системные пакеты не меняются.

Панель устанавливается через `install-panel`, нода с нашим Xray — через `install-node`. Обновление: `upgrade-panel` и `upgrade-node`. Enter в запросе версии выбирает `latest`; `--version 1.2.21` закрепляет выпуск установщика с панелью 1.1.7.3, нодой 1.1.3 и ядром 1.1.2. Все команды остаются видимыми в меню.

Переход с существующей Remnawave выполняется через `migrate-remnawave-panel` или `migrate-remnawave-node`. Установщик сохраняет проект Compose, инфраструктуру, секреты, сети и тома. Для панели требуется исходный `APP_SECRET`. Перед обновлением создаётся резервная копия; после миграций проверяется сохранность данных.

Перенос Marzban — `migrate-marzban-panel`: экспорт через API, предварительный отчёт (`--dry-run`), перенос ключей, сроков и статусов, проверка конфликтов. Это перенос пользователей в подготовленную панель; хосты, ноды и старые JWT-ссылки требуют настройки, описанной в руководстве.

Для выпуска публикуются `installer.sh`, `remnacust-source-vVERSION.tar.gz` и `SHA256SUMS`. Исходники и помощники берутся из проверенного архива этого выпуска. Скрипт не зависит от файлового менеджера.

Установщик использует готовые образы GHCR с проверкой версии и архитектуры. Для новой панели HTTPS обслуживает Caddy в Docker, а не системный `nginx.service`. При обновлении или переносе существующей панели прежний Caddy/Nginx и его сертификаты сохраняются. Проверка контейнеров: `sudo remnacust status`.
