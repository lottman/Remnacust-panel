# OAuth and admin session migration

- Email-based OIDC allowlist login now requires the boolean claim `email_verified: true` for PocketID, Keycloak, and generic OAuth. Missing, false, string, and numeric values do not establish email ownership. Before deployment, verify that your provider verifies the address and includes this boolean in its ID token. An existing email-only mapping may need a provider-side claim mapper or email-verification setting.
- The explicit boolean `remnawaveAccess: true` remains an independent authorization grant, including when `email_verified` is absent or false. It still requires a nonempty email, as before. Only trusted provider administrators should control this grant; do not map an editable user attribute or grant it indiscriminately to avoid verification. No new panel configuration fields are required.
- GitHub login requires an email that is both primary and verified. A verified secondary address alone is insufficient.
- All OIDC providers require a nonempty string subject and issuer, the configured client ID in the audience, a future numeric expiry, and a valid numeric issued-at time preceding expiry. Issued-at times allow up to 60 seconds of forward clock skew; expired tokens are rejected. An audience array must contain the client ID; multiple audiences require `azp` equal to that client ID, and any present `azp` must match. PocketID issuer must match `https://{plainDomain}`, Keycloak `https://{keycloakDomain}/realms/{realm}`, and Telegram `https://oauth.telegram.org`. Check provider claim mappings and clock synchronization before deployment. These checks apply even to explicit access grants.
- Generic token URLs must use HTTPS and contain no embedded credentials or fragment. Configure the actual trusted HTTPS token endpoint directly, without redirecting it through an insecure endpoint. Existing HTTP-only integrations must enable HTTPS.
- Browser OAuth flows now save state in session storage before redirect and consume the matching provider state before exchanging the code. Complete login in the tab that initiated it, with session storage available. In-flight flows started before the frontend update must restart. Callback paths and API request/response formats are unchanged.
- Every admin login method now awaits a Redis active-session entry with the JWT lifetime before returning its token. Existing sessions without the new claims and active entry must log in again after deployment. Logout, eviction, or Redis data loss invalidates affected sessions. A Redis restart invalidates sessions if their active entries are lost. A failed active-session write returns no token. Plan Redis capacity/persistence accordingly; no JWT or session secret should appear in logs.
- Passkey registration and authentication now accept only the exact configured origin; the HTTPS RP-ID origin is no longer added implicitly. Ensure the configured origin matches the panel URL. Registration challenges are consumed atomically. Authentication counter updates compare the stored counter with the verified snapshot; failed or stale updates deny session issuance. Zero-counter authenticators remain supported, with challenge consumption preventing replay.

## ID-token trust boundary

The backend receives ID tokens from its configured token endpoint during authorization-code exchange; the callback accepts a code and state, not an ID token. Arctic's `decodeIdToken` decodes claims without verifying a signature. This alone does not demonstrate that arbitrary forged callback tokens can log in: OpenID Connect Core section 3.1.3.7 permits TLS server validation in place of signature validation for ID tokens obtained directly from the token endpoint. That exception depends on a trusted HTTPS endpoint and valid TLS verification. Generic token URLs are now required to use HTTPS.

This patch validates protocol claims before email ownership or provider-granted access and adds browser state checks. It does not add JWKS signature verification or nonce validation. Generic settings contain no explicit expected issuer: its `iss` must be a nonempty string, but cannot be compared with a configured issuer. This is a residual limitation, not full OIDC issuer validation. Issuer paths can legitimately differ from token-endpoint paths; the code never infers an issuer from the token URL. Adding an explicit trusted issuer setting is separate work. Reference: https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation

## Focused tests (no build)

From the backend directory:

```sh
node --test tests/oauth-security.test.cjs tests/auth-session-issuance.test.cjs tests/auth-security.test.cjs tests/passkey-counter-security.test.cjs
```

From the frontend directory:

```sh
node --test tests/oauth-security.test.cjs
```

Tests load source in memory and use synthetic provider responses, session storage, and Redis fixtures. They do not contact a live identity provider or Redis server and do not emit build artifacts.
