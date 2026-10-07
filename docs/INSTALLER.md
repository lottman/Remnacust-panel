# Установка и обслуживание

Скрипт находится в [`installer/installer.sh`](https://github.com/lottman/Remnacust-installer/blob/main/installer/installer.sh); полное руководство, команды, параметры, миграция и восстановление — в [`installer/README.md`](https://github.com/lottman/Remnacust-installer/blob/main/installer/README.md).

Скачайте установщик из последнего стабильного выпуска:

```bash
curl --fail --show-error --location --proto '=https' --proto-redir '=https' \
  https://github.com/lottman/Remnacust-installer/releases/latest/download/installer.sh -o installer.sh
sudo bash installer.sh
```

Панель устанавливается через `install-panel`, нода с нашим Xray — через `install-node`. Обновление: `upgrade-panel` и `upgrade-node`. Enter в запросе версии выбирает `latest`; `--version 1.1.1` закрепляет выпуск. Все команды остаются видимыми в меню.

Переход с существующей Remnawave выполняется через `migrate-remnawave-panel` или `migrate-remnawave-node`. Установщик сохраняет проект Compose, инфраструктуру, секреты, сети и тома. Для панели требуется исходный `APP_SECRET`. Перед обновлением создаётся резервная копия; после миграций проверяется сохранность данных.

Перенос Marzban — `migrate-marzban-panel`: экспорт через API, предварительный отчёт (`--dry-run`), перенос ключей, сроков и статусов, проверка конфликтов. Это перенос пользователей в подготовленную панель; хосты, ноды и старые JWT-ссылки требуют настройки, описанной в руководстве.

Для выпуска публикуются `installer.sh`, `remnacust-source-vVERSION.tar.gz` и `SHA256SUMS`. Исходники и помощники берутся из проверенного архива этого выпуска. Скрипт не зависит от файлового менеджера.
