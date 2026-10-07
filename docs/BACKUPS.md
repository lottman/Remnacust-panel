# Резервные копии

Команды ниже выполняются из `panel/backend` при установке из исходников. Для установки через `installer.sh` используйте её Compose-файл и имя проекта.


Скачайте копию базы и сохраните `.env`, TLS-сертификаты и настройки reverse proxy отдельно. ZIP из раздела резервных копий содержит зашифрованный `database.dump`, а не файлы всего сервера. Для открытия нужен пароль. Восстановление выполняется средствами PostgreSQL на сервере; кнопки восстановления в интерфейсе нет. Сначала проверьте восстановление в отдельной базе.

Для использования встроенных копий настройте пароль резервных копий; пустое `XERA_BACKUP_PASSWORD_ENC` в образце не включает автоматическое резервирование. Из `panel/backend` при запущенной панели выполните:

```bash
read -r -s -p 'Пароль копий (16–256 ASCII-символов без пробелов): ' REMNACUST_BACKUP_PASSWORD
printf '\n'
printf '%s' "$REMNACUST_BACKUP_PASSWORD" | docker compose -f docker-compose-prod.yml exec -T remnawave node -e '
const crypto = require("node:crypto");
let password = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => password += chunk);
process.stdin.on("end", () => {
  if (!/^[\x21-\x7e]{16,256}$/.test(password)) throw new Error("Invalid backup password");
  const key = crypto.createHmac("sha256", process.env.APP_SECRET).update("xera-keyring-v1").digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  console.log("XERA_BACKUP_PASSWORD_ENC=xera1:" + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64"));
});'
unset REMNACUST_BACKUP_PASSWORD
```

Замените строку `XERA_BACKUP_PASSWORD_ENC=` в `.env` полученной строкой и пересоздайте контейнер через `docker compose -f docker-compose-prod.yml up -d`. Оригинальный пароль храните отдельно: он нужен для входа в раздел и открытия архивов. Не меняйте `APP_SECRET` без переноса зашифрованных данных. Копии сохраняются в томе `remnacust-backups`; дополнительно скачивайте их на другое хранилище. Общие Telegram-уведомления задаются параметрами установки, а отправка копий — отдельно в их разделе.

Перед обновлением сохраните предыдущий образ и копию базы. Получите исходники нужной версии и повторите `docker compose -f docker-compose-prod.yml up -d --build` из `panel/backend`. Затем проверьте журналы, вход и подписку тестового пользователя. После изменения `.env` пересоздайте контейнер этой командой: обычный `restart` не перечитывает окружение. Не удаляйте том базы при обновлении. Откат образа после миграций может потребовать восстановления совместимой копии базы.

