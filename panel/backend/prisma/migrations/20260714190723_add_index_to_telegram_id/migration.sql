-- CreateIndex
CREATE INDEX "users_telegram_id_idx" ON "users" ("telegram_id")
WHERE "telegram_id" IS NOT NULL;
