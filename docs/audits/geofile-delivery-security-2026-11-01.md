# Geofile delivery review — 2026-11-01

Scope: automatic Xray geofile delivery, profile size calculation, subscription response URL generation, page-to-panel relay and editor guidance. This is a focused code/security regression review, not a penetration test of every deployment.

## Confirmed defects and fixes

- **High — underestimated mobile configuration size.** The supplied configuration was 427,628 bytes on the wire but 1,007,071 bytes after restoring StringList arrays and four-space formatting. Counting compact strings incorrectly kept large inline rules. Size accounting now includes that expansion, separately for each profile, for both Happ and INCY. The conservative 900,000-byte budget is a panel compatibility policy, not a claimed documented exact INCY limit. Large managed datasets use signed DAT bundles; custom rules are never silently discarded.
- **Medium — wrong public geofile authority behind a page/CDN.** The configured canonical domain could bypass the domain used to request the subscription. Links now obtain an HTTPS authority from the actual request Host. A separate subscription page relays its public authority using its configured API token. The panel verifies HS256, role, UUID, expiry, current token existence and current scope before accepting that relay. Removed/expired/restricted tokens cannot authorize a relayed authority.
- **UI correctness.** The JSON warning is shown only when the setting is confirmed false. No success/pending banners remain. Delivery guidance is shared rather than duplicated for every attachment, and the translated setting name is interpolated.

## Security boundaries checked

- Host normalization rejects credentials, paths, whitespace, control characters, IP/internal authorities, invalid ports and DNS labels. Forwarded, X-Forwarded-Host, Origin and Referer cannot replace the actual authority.
- An accepted public authority controls links in that request's private response only. It is not a server-side fetch target, filesystem path, authentication decision or shared cached template value. The reverse proxy must restrict its accepted virtual hosts and preserve the original Host. An application cannot infer an original CDN domain if the edge discards it.
- The page retains Host locally but strips client Authorization and relay headers. It uses its own configured token and fixed panel upstream, refuses redirect-based credential forwarding, and does not expose that token in responses.
- AsyncLocalStorage isolates concurrent origins. Bundle signatures, selections, namespaces, paths and content checksums are unchanged. Invalid relay evidence falls back to the actual valid Host or the configured public domain.
- Existing bounded imports, source URL/redirect validation, signed file selections, size caps, last-good file handling and refresh schedules remain active. No arbitrary remote source fetch is introduced by this change.
- HTTPS is used for public links even behind TLS-terminating proxies. Subscription/geofile routes must not be publicly cached by a CDN. Existing authentication, no-store controls and signed paths remain necessary; domain reflection is not an origin allowlist.

## Verification

Unit/regression coverage includes exact StringList size accounting, multiple individually small files becoming a large profile, per-profile rather than summed budgets, real signed JWT relay/revocation/scope tests, concurrent origins, stable signatures/checksums and page transport header filtering. A real Express/Axios page-to-panel HTTP test checks generated routing headers, JSON references, DAT and .sha256 through distinct CDN authorities without changing the authenticated upstream.

Native `xray.exe run -test` from the installed Happ and INCY packages accepts inline and remote-DAT generated profiles (four cases). No VPN, tunnel or system proxy is started. This verifies core parsing and DAT category compatibility, not physical iOS UI/runtime behavior. The customer configuration and credentials are not stored in this repository.

Release gates additionally run frontend/backend/page type checks, lint, regression tests and builds; four-language documentation checks; installer regression checks; CI source checks and Docker builds. Stable publication requires these gates and artifact verification. Browser checks cover JSON on/off/pending/error states, a single shared guide, reopening, four languages, narrow screens and theme variation.

## Deployment

Update both panel and subscription page to 1.1.7.73, then refresh subscriptions in clients. Existing installed configurations are not rewritten remotely. Preserve the request Host through CDN/reverse proxies, route geofile paths to the same page/panel service, and keep TLS valid. No new database migration, node release or Core release is required. Native client validation does not prove that every third-party CDN or physical iPhone is configured correctly.

Primary client references: https://docs.incy.cc/routing/ and https://docs.incy.cc/full-xray-config/.

Dependency audit: production subscription-page backend reports no advisories; panel backend reports two existing low-severity entries (deepmerge and its dependent nestjs-zod), no moderate/high/critical entries. The offered npm fix is a major dependency change and was not applied as an unrelated release migration. This is a residual dependency advisory, not a claim of zero vulnerabilities.
