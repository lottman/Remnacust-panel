ALTER TABLE "subscription_settings"
ADD COLUMN "geofiles_inline_rule_limit" INTEGER NOT NULL DEFAULT 20000,
ADD CONSTRAINT "geofiles_inline_rule_limit_range" CHECK ("geofiles_inline_rule_limit" BETWEEN 1 AND 50000);
