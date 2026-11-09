BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE subscription_domains DROP CONSTRAINT subscription_domain_access_mode_check;
ALTER TABLE subscription_domains ADD CONSTRAINT subscription_domain_access_mode_check CHECK (
    (kind = 'CDN' AND access_mode IN ('OPEN', 'BLOCKED') AND redirect_domain_uuid IS NULL) OR
    (kind = 'PRIMARY' AND access_mode IN ('OPEN', 'CDN_ONLY', 'REDIRECT', 'BLOCKED') AND
      ((access_mode = 'REDIRECT' AND redirect_domain_uuid IS NOT NULL) OR
       (access_mode <> 'REDIRECT' AND redirect_domain_uuid IS NULL)))
);
COMMIT;
