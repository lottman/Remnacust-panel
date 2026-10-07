--
UPDATE "subscription_settings"
SET "custom_response_headers" =
    (
        jsonb_build_object(
            'profile-title', 'rwEncodeBase64:' || "profile_title",
            'profile-update-interval', "profile_update_interval"::text,
            'support-url', "support_link"
        )
        || (CASE WHEN "happ_announce" IS NOT NULL
                 THEN jsonb_build_object('announce', 'rwEncodeBase64:' || "happ_announce")
                 ELSE '{}'::jsonb END)
        || (CASE WHEN "happ_routing" IS NOT NULL
                 THEN jsonb_build_object('routing', "happ_routing")
                 ELSE '{}'::jsonb END)
        || (CASE WHEN "is_profile_webpage_url_enabled"
                 THEN jsonb_build_object('profile-web-page-url', '{{SUBSCRIPTION_URL}}')
                 ELSE '{}'::jsonb END)
    )
    || COALESCE("custom_response_headers", '{}'::jsonb);

--
ALTER TABLE "subscription_settings" DROP COLUMN "happ_announce",
DROP COLUMN "happ_routing",
DROP COLUMN "is_profile_webpage_url_enabled",
DROP COLUMN "profile_title",
DROP COLUMN "profile_update_interval",
DROP COLUMN "support_link";

--
UPDATE "external_squads"
SET "response_headers_add" =
    (
        (CASE WHEN "subscription_settings"->>'profileTitle' IS NOT NULL
              THEN jsonb_build_object('profile-title', 'rwEncodeBase64:' || ("subscription_settings"->>'profileTitle'))
              ELSE '{}'::jsonb END)
        || (CASE WHEN "subscription_settings"->>'profileUpdateInterval' IS NOT NULL
                 THEN jsonb_build_object('profile-update-interval', "subscription_settings"->>'profileUpdateInterval')
                 ELSE '{}'::jsonb END)
        || (CASE WHEN "subscription_settings"->>'supportLink' IS NOT NULL
                 THEN jsonb_build_object('support-url', "subscription_settings"->>'supportLink')
                 ELSE '{}'::jsonb END)
        || (CASE WHEN "subscription_settings"->>'happAnnounce' IS NOT NULL
                 THEN jsonb_build_object('announce', 'rwEncodeBase64:' || ("subscription_settings"->>'happAnnounce'))
                 ELSE '{}'::jsonb END)
        || (CASE WHEN "subscription_settings"->>'happRouting' IS NOT NULL
                 THEN jsonb_build_object('routing', "subscription_settings"->>'happRouting')
                 ELSE '{}'::jsonb END)
        || (CASE WHEN ("subscription_settings"->>'isProfileWebpageUrlEnabled') = 'true'
                 THEN jsonb_build_object('profile-web-page-url', '{{SUBSCRIPTION_URL}}')
                 ELSE '{}'::jsonb END)
    )
    || "response_headers_add"
WHERE "subscription_settings" IS NOT NULL
  AND jsonb_typeof("subscription_settings") = 'object';

--
UPDATE "external_squads"
SET "subscription_settings" = NULLIF(
    "subscription_settings" - ARRAY[
        'profileTitle', 'profileUpdateInterval', 'supportLink',
        'happAnnounce', 'happRouting', 'isProfileWebpageUrlEnabled'
    ]::text[],
    '{}'::jsonb
)
WHERE "subscription_settings" IS NOT NULL
  AND jsonb_typeof("subscription_settings") = 'object';
