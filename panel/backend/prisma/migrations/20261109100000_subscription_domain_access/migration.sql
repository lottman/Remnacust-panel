BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE subscription_domains
    ADD COLUMN access_mode VARCHAR(8) NOT NULL DEFAULT 'OPEN',
    ADD COLUMN redirect_domain_uuid UUID REFERENCES subscription_domains(uuid) ON DELETE NO ACTION ON UPDATE CASCADE NOT DEFERRABLE;
ALTER TABLE subscription_domains ADD CONSTRAINT subscription_domain_access_mode_check CHECK (
    (kind = 'CDN' AND access_mode = 'OPEN' AND redirect_domain_uuid IS NULL) OR
    (kind = 'PRIMARY' AND access_mode IN ('OPEN', 'CDN_ONLY', 'REDIRECT') AND
      ((access_mode = 'REDIRECT' AND redirect_domain_uuid IS NOT NULL) OR
       (access_mode <> 'REDIRECT' AND redirect_domain_uuid IS NULL)))
);
CREATE INDEX subscription_domains_redirect_domain_uuid_idx ON subscription_domains(redirect_domain_uuid);
COMMIT;
