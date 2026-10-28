# Release audit — 2026-10-28

Scope: panel API, workers, scheduler, frontend, subscription page and the pinned installer. Based on the operator's FINAL RELEASE AUDIT checklist. Generated contracts and dependencies are checked for consistency, not counted as manually reviewed application code.

## Work plan

- [x] Inventory repositories, entrypoints, API metadata, migrations and release pipelines.
- [x] Review authentication, scope boundaries, uploads/downloads, outbound requests, remote execution and secret handling.
- [x] Exercise user lifetime/status, device synchronization, template assignment, geofiles, quotas and failure recovery.
- [x] Run application regression tests and isolated PostgreSQL/network/installer checks.
- [x] Verify responsive UI, localization, documentation and builds.
- [x] Record findings, residual limitations and exact validation results.
- Release gate: new immutable tags, green CI, verified image architectures/assets, then stable Latest. Publication evidence belongs to the GitHub release rather than an amended tag.

## Architecture and coverage

| Area | Entry points / implementation | Access / relevant controls | Status |
| --- | --- | --- | --- |
| API bootstrap | `panel/backend/src/main.ts`, `app.module.ts` | bounded parsers, Helmet, proxy checks, guards | PARTIAL |
| Authentication and API tokens | `modules/auth`, `common/guards`, `common/middlewares` | roles, per-endpoint scopes, revocation and rate limits | PARTIAL |
| Users, devices and subscription clocks | `modules/users`, `modules/hwid-user-devices`, `_users` queues | administrator/API scopes; frozen lifetime and node credential reconciliation | PARTIAL |
| Hosts, profiles and subscriptions | `modules/hosts`, `modules/config-profiles`, `modules/subscription`, `modules/subscription-template` | access-filtered host injection, balancer assignments, private links | PARTIAL |
| Geofile library and public delivery | `modules/subscription-template/geofiles` | authenticated import, validated formats, bounded SSRF-safe downloads and capability links | PARTIAL |
| Nodes, SSH and update jobs | `modules/nodes`, `modules/node-ssh`, `modules/system` | administrator-only dangerous operations, job leases, structured diagnostics | PARTIAL |
| Limits, usage and recovery | host limits services, quota migrations and queue handlers | database invariants, receipts, idempotency and generation boundaries | PARTIAL |
| Backups | `modules/backups` | separate access verification, AES ZIP, bounded streaming, filename validation | PARTIAL |
| Frontend routes and editors | `panel/frontend/src/pages`, `features`, `widgets`, `shared` | server authorization remains authoritative; responsive state handling | PARTIAL |
| Subscription page | `subscription-page/backend`, `subscription-page/frontend` | subscription response filtering, frozen user display | PARTIAL |
| Installation and upgrade | sibling `Remnacust-installer` repository | pinned sources, digests, rollback, timed HTTP-01 firewall window | PARTIAL |

The detailed [coverage inventory](RELEASE-AUDIT-20261028-COVERAGE.json) lists every documented API operation, controller source and checked page. PARTIAL means source/policy coverage without exhaustive end-to-end execution.

The API inventory is the versioned `panel/backend/openapi.json`: operation access metadata and documentation coverage are checked by the source and documentation suites. A static inventory is not a claim that every endpoint was executed against production.

## Findings

### A01 — status update failures lost by bulk queue (high correctness / access revocation)

The update command ignored an unsuccessful service result, and the worker caught errors without failing its job. A repeated explicit status request could then skip device synchronization because the database already held that status. This could acknowledge an operation without confirming node-side access synchronization.

FIXED. Failures propagate, updates retry at most three times with exponential backoff, and explicit status requests synchronize access even if the stored status already matches. Regression tests cover service rejection, thrown exceptions, worker retry, database failures and repeated freeze after failed synchronization. Locations: `panel/backend/src/modules/users/commands/update-user-with-service/update-user-with-service.handler.ts:19`, `panel/backend/src/queue/_users/processors/modify-many-users.processor.ts:99`, `panel/backend/src/modules/users/users.service.ts` and `panel/backend/src/queue/_users/users-queues.service.ts`.

### A02 — low-severity transitive dependency advisory (review required)

RESIDUAL LOW. The dependency audit reports `deepmerge` via panel `nestjs-zod` and subscription-page build tooling. The reviewed advisory [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) lists no patched release as of this audit. Examined calls merge generated OpenAPI schemas, schema metadata and build configuration, rather than directly merging HTTP request objects. No exploitable request-to-merge path was reproduced. This is a reachability assessment, not removal of the dependency alert. No blind downgrade or incompatible framework change is applied. Audit counts: panel backend two low alerts (package and parent), subscription-page backend three low alerts (package and build parents), both frontends zero; no moderate/high/critical dependency alerts in these four lockfiles.

### A03 — tools JWT could outlive its parent claim by one second (low)

FIXED. Relative `expiresIn` used a clock read before the signer sampled its own clock. A boundary crossing could produce an `exp` exceeding the parent's by one second. Parent revocation/expiry checks already remained mandatory on each request. `panel/backend/src/common/middlewares/tools-auth.middleware.ts:176` now signs absolute `iat`/`exp` and bounds cookie lifetime to the same interval; expiration during redemption denies access. A deterministic delayed-signing test reproduces the prior drift.

### A04 — offset pagination could omit users during a bulk status update (medium correctness)

FIXED. Bulk ACTIVE/FROZEN enumeration now advances by a descending ID cursor rather than offset/count. Deleting previously enumerated users no longer shifts later records past the next page. A regression supplies changing counts while asserting every remaining ID is enqueued once. Ordinary paginated API callers retain the existing offset behavior.

### A05 — validation coverage gaps (low release reliability)

FIXED. Two older tests now load the real frozen-lifetime helper instead of failing module resolution. The new frozen database and generated remote-install scenarios are also registered in Linux CI. Windows Node 22 requires `--experimental-strip-types` for the two pre-existing tests importing TypeScript directly; the release workflow uses Node 24.

## Test records and release decision

## Validation results

- Final backend full regression: 697 tests, 691 passed, six platform/environment skips, zero failures. The cursor and failure-path regression suite also passed all 14 targeted tests. The release CI runs the final source tree again on Linux.
- Frontend: 247 tests passed. Subscription-page backend: 14 passed; subscription-page frontend: two passed.
- PostgreSQL: all migrations deployed successfully to a newly created disposable database. The exact new migration passed clock pause, repeated freeze, extension, resume, zero remaining lifetime, quota exhaustion and non-UTC timezone checks inside a rolled-back schema.
- Actual loopback API: create/freeze/repeat, inactive subscription response, export/import, extension and resume passed; synthetic users were deleted afterward.
- Installer: full `REMNACUST_TEST_REAL_COMPOSE=1` suite passed, including real Docker subscription-page migration/rollback, input validation and Compose layout. Package/source/image/build-metadata suites passed.
- Real isolated nftables network tests: four passed; no production rules were modified. Mocked initial certificate/renewal workflows and the real generated remote Bash script passed. No live certificate was issued.
- Browser: 33 distinct desktop routes and 11 mobile route checks at 320px all remained on their requested routes, with no page JavaScript errors or document horizontal overflow. Autoselect/geofiles editor tabs were also checked at 320px. These checks cover rendering/navigation and observed data loads, not every destructive operation or all interactive combinations.
- Snippet clipboard: actual Monaco copy button produced complete parseable JSON without documentation text. Ordinary schema hover remained available. The actual usage chart tooltip stayed beside the pointer.
- Documentation: 56 articles, 238 operations, 52 variables, 225 controls. Locale parity: 3238 keys in EN/RU/FA/ZH; 4397 static calls checked.
- Backend/frontend type checks and production builds passed; subscription-page frontend type check/build passed. Changed backend source lint passed. Final source and release packaging are also gated by CI.

Reproducible commands include `node --test tests/*.test.cjs` in the backend, `node --experimental-strip-types --test tests/*.test.cjs tests/*.test.mjs scripts/*.test.cjs` in the Windows frontend, `npm run typecheck`, `npm run docs:check`, `npm run i18n:check`, and the exact isolated checks in `.github/workflows/check.yml` and the installer's workflow.

## Limits and release decision

The local changes have no remaining reproduced critical/high release blocker in the reviewed paths. A02 remains a disclosed low-severity dependency alert without an upstream patched release. Authentication/scope tests, bounded SSRF-safe geofile downloads, HTML/SVG sanitation, verified installer downloads, backup streaming and migrations were examined alongside the changed behavior. This is not a claim of manual line-by-line review of every source file or a proof that no vulnerabilities exist.

The API matrix is the versioned OpenAPI document and its checked access metadata. The attached route/API coverage inventory distinguishes route smoke checks and metadata checks from full operation execution. Server-side authorization is never inferred from a hidden UI button.

BLOCKED: installation on the specifically reported VPS was not performed; no current server access was established for that host. Production panel/node connectivity, live ACME issuance and every version of Happ/INCY/other clients are not claimed as verified. No production users, payments, firewall or VPN connection were changed by the audit.

Release publication requires successful source checks and Docker workflow, both amd64/arm64 images, complete downloadable assets, SHA-256 verification and anonymous registry/download checks. Only then may the new panel and installer releases become stable Latest. Rolling back the frozen-lifetime migration requires a coordinated database backup; see the release notes.
