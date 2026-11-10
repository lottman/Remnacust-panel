ALTER TABLE "subscription_settings"
DROP CONSTRAINT "geofiles_inline_rule_limit_range",
ADD CONSTRAINT "geofiles_inline_rule_limit_range" CHECK ("geofiles_inline_rule_limit" BETWEEN 1 AND 250000);
