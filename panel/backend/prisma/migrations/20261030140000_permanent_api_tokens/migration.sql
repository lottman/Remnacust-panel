-- A null expiry is an explicitly selected permanent API token.
ALTER TABLE "api_tokens" ALTER COLUMN "expire_at" DROP NOT NULL;
