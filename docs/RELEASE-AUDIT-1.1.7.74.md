# Release verification: 1.1.7.74

The release audit used the operator's final-release checklist. This records executed checks and limits; it is not a claim that every screen, production node or physical phone was exercised.

## Coverage and findings

An independent reviewer inspected 64 distinct source, migration, configuration and test files around domains, API scopes, user URLs and freeze transitions. The main review also traced subscription-page transport, generated documentation, frontend form integration and release packaging. The generated catalog contains 244 HTTP operations, 216 token-accessible operations, 57 documentation articles, 234 documented controls and 52 template variables. Catalog enumeration is not runtime HTTP coverage of every operation.

Four confirmed findings were repaired: three P1 correctness defects and one P2 cache race. Hostname-only bootstrap rejected its normalized empty path; freezing could overwrite a concurrent renewal using stale data; the replacement SQL trigger discarded extensions during freeze; domain invalidation occurred before commit and allowed an old read to refill the cache. The fixes accept the normalized empty path, omit expiry from freeze writes, preserve explicit renewal writes in the trigger, and invalidate after commit with a cache generation check. Regression tests cover these cases. The frontend freeze action was aligned with the API's zero-remainder behavior, and stale operator documentation was corrected in all four languages.

Typechecking also found two frontend integration defects (possibly missing loaded user and a dynamic translation key). Both were fixed. The API test fixture now loads actual DTO constructors and checks all five additional domain operations without weakening role/scope checks. The user-management preset grants domain list/get, never domain mutation permissions.

## Executed verification

- Backend regression suite: 735 passed, zero failed, six environment-gated tests skipped in the local run. Changed-path tests were repeated after the findings were repaired.
- Frontend regression suite: 264 passed, zero failed. Backend, frontend and subscription-page TypeScript checks and production bundling were executed; exact-revision CI remains the release gate.
- Subscription-page backend: 19 tests passed; frontend: two passed. Real HTTP tests cover cancellation, noncacheable failures, complete DAT/checksum transfer, CDN origin relay, token isolation, redirect refusal and private-upstream filtering.
- Real isolated PostgreSQL: every migration applied to a fresh empty database; frozen lifetime, repeated freeze, zero remainder, quota, non-UTC timezone, extension after the replacement trigger and resume passed. The local Windows Prisma migration command could not use its schema engine; SQL was applied through the disposable PostgreSQL container. CI separately executes Prisma migrate deploy.
- Documentation generation/check: 57 articles, 244 operations, 52 variables, 234 controls. Locale checks: 3316 matching EN/RU/FA/ZH keys and 4467 static translation calls.
- npm production dependency audit: frontend and both subscription-page packages have no reported vulnerabilities. Backend retains the previously disclosed low-severity deepmerge advisory through nestjs-zod (two package entries for one advisory). No forced incompatible dependency downgrade was applied.

## Limits and release gate

No live production-node connectivity test, fresh full-site browser/mobile traversal, physical Happ/INCY iOS launch, live ACME issuance or production server upgrade was performed in this run. Existing automation covers GUI/code generation parity, limits, token roles, request validation, file imports and the relevant subscription paths; it cannot prove every deployment-specific CDN/firewall/client combination.

Use a separate public subscription hostname. Register CDN names before assigning them, configure DNS/TLS/proxy separately, and preserve Host at the page proxy. The domain registry does not provision infrastructure. Panel and subscription-page updates must be deployed together. Unknown authorities fall back to the configured public subscription domain; private panel upstream URLs are server-side settings.

Verdict: READY WITH RISKS for the verified scope only, conditional on exact-commit CI, native amd64/arm64 image/runtime checks, complete assets and checksums. Stable Latest must not be advanced before these gates pass. Node 1.1.19 and Core/WASM 1.1.11 remain pinned to existing released commits. Two new database migrations require a consistent backup before upgrade.
