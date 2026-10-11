# Резервные копии

Команды ниже выполняются из `panel/backend` при установке из исходников. Для установки через `installer.sh` используйте её Compose-файл и имя проекта.


Скачайте копию базы и сохраните `.env`, TLS-сертификаты и настройки reverse proxy отдельно. ZIP из раздела резервных копий содержит зашифрованный `database.dump`, а не файлы всего сервера. Для открытия нужен пароль. Восстановление выполняется средствами PostgreSQL на сервере; кнопки восстановления в интерфейсе нет. Сначала проверьте восстановление в отдельной базе.

Новые копии содержат сжатый PostgreSQL dump и сохраняют пользователей, ключи доступа, блокировки устройств, лимиты, учёт трафика, конфигурации и историю миграций. Записи диагностического журнала `xera_node_health_logs` исключены: его таблица и настройки сохраняются, но после восстановления журнал пустой. Он не нужен для восстановления доступа и мог занимать большую часть архива. Размер остальных данных влияет на размер копии; фиксированный размер не гарантируется. Шифрование ZIP остаётся AES-256. PostgreSQL сжимает dump до шифрования, поэтому повторное сжатие зашифрованного файла не требуется.

Журнал нод по умолчанию хранится три дня. Очистка запускается при старте планировщика и каждые десять минут (`:00`, `:10`, `:20`, `:30`, `:40`, `:50`), удаляя записи старше срока хранения. Это не очистка только в полночь. Настройки частоты и хранения резервных копий независимы от срока хранения журнала; ранее созданные архивы автоматически не перепаковываются.

Для использования встроенных копий настройте пароль резервных копий; пустое `XERA_BACKUP_PASSWORD_ENC` в образце не включает автоматическое резервирование. Из `panel/backend` при запущенной панели выполните:

```bash
read -r -s -p 'Пароль копий (16–256 ASCII-символов без пробелов): ' REMNACUST_BACKUP_PASSWORD
printf '\n'
printf '%s' "$REMNACUST_BACKUP_PASSWORD" | docker compose -f docker-compose-prod.yml exec -T remnawave node -e '
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
let password = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => password += chunk);
process.stdin.on("end", () => {
  if (!/^[\x21-\x7e]{16,256}$/.test(password)) throw new Error("Invalid backup password");
  const directory = process.env.XERA_BACKUPS_DIR || path.join(process.cwd(), "backups");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(directory).isDirectory()) throw new Error("Invalid backup directory");
  fs.chmodSync(directory, 0o700);
  const filename = path.join(directory, ".backup-key");
  if (fs.existsSync(filename)) {
    const info = fs.lstatSync(filename);
    if (!info.isFile() || info.size !== 48) throw new Error("Invalid backup verification key");
    const existing = fs.readFileSync(filename);
    const derived = crypto.scryptSync(password, existing.subarray(0, 16), 32);
    if (!crypto.timingSafeEqual(derived, existing.subarray(16)))
      throw new Error("The existing backup password differs; the key was not replaced");
  } else {
    const salt = crypto.randomBytes(16);
    fs.writeFileSync(filename, Buffer.concat([salt, crypto.scryptSync(password, salt, 32)]),
      { flag: "wx", mode: 0o600 });
  }
  const key = crypto.createHmac("sha256", process.env.APP_SECRET).update("xera-keyring-v1").digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  console.log("XERA_BACKUP_PASSWORD_ENC=xera1:" + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64"));
});'
unset REMNACUST_BACKUP_PASSWORD
```

Команда создаёт закрытый проверочный файл `.backup-key`, который нужен для входа в раздел копий. При повторном запуске она проверяет прежний пароль и сохраняет существующий ключ. Другой пароль не заменяет его автоматически.

Замените строку `XERA_BACKUP_PASSWORD_ENC=` в `.env` полученной строкой и пересоздайте контейнер через `docker compose -f docker-compose-prod.yml up -d`. Оригинальный пароль храните отдельно: он нужен для входа в раздел и открытия архивов. Не меняйте `APP_SECRET` без переноса зашифрованных данных. Копии сохраняются в подключённом томе; его имя зависит от проекта Compose. Дополнительно скачивайте их на другое хранилище. Общие Telegram-уведомления задаются параметрами установки, а отправка копий — отдельно в их разделе.

Перед обновлением сохраните предыдущий образ и копию базы. Получите исходники нужной версии и повторите `docker compose -f docker-compose-prod.yml up -d --build` из `panel/backend`. Затем проверьте журналы, вход и подписку тестового пользователя. После изменения `.env` пересоздайте контейнер этой командой: обычный `restart` не перечитывает окружение. Не удаляйте том базы при обновлении. Откат образа после миграций может потребовать восстановления совместимой копии базы.


## Проверка скачанной копии

Текущий ZIP защищён паролем AES-256. Откройте его совместимым архиватором, например 7-Zip, в закрытом каталоге. Введите пароль по запросу архиватора: извлечённый `database.dump` уже расшифрован и готов для `pg_restore`. Не передавайте пароль в аргументах командной строки. Проверьте список объектов и восстановление в отдельной пустой базе:

```bash
chmod 600 database.dump
pg_restore --list database.dump
pg_restore --exit-on-error --no-owner --dbname=TEST_DATABASE_URL database.dump
```

`TEST_DATABASE_URL` замените адресом отдельной тестовой базы. Пароль PostgreSQL передавайте безопасным механизмом клиента, а не в адресе команды. Не восстанавливайте копию поверх рабочей базы для проверки. После проверки удалите ненужный расшифрованный файл.

Для старого формата `.dump.enc` используется отдельная утилита. Создайте файл пароля без перевода строки с правами 0600. Из корня репозитория:

```bash
node panel/backup-decrypt.mjs verify legacy.dump.enc password.txt
node panel/backup-decrypt.mjs decrypt legacy.dump.enc password.txt > database.plain.dump
chmod 600 database.plain.dump
```

Первая команда проверяет пароль и целостность. Вторая выводит расшифрованный PostgreSQL dump; направляйте его в закрытый файл и восстанавливайте в отдельной БД средствами PostgreSQL. Файлы пароля и dump содержат секреты, не добавляйте их в Git. После проверки удалите ненужную расшифрованную копию.
