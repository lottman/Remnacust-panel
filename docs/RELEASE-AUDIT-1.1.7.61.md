# Release audit — 1.1.7.61 / installer 1.2.96

The operator's FINAL RELEASE AUDIT checklist was applied to the current source, including the two previously unpublished UI commits. This record distinguishes executed checks from inventory and source review. Earlier release audits are historical evidence and are not counted as fresh executions.

## Plan and architecture

- [x] Inventory panel API, API/jobs/scheduler roles, PostgreSQL migrations, Valkey queues, frontend routes, subscription page and pinned installer sources.
- [x] Review authentication and scope boundaries, privileged operations, geofile upload/import/download, template assignment and draft persistence.
- [x] Execute regression tests and targeted HTTP/PostgreSQL and browser scenarios.
- [x] Check localization, generated documentation, types, lint and production builds.
- Publication gate: exact-commit Linux CI, amd64/arm64 image startup/metadata, complete assets and checksums, anonymous downloads, then stable Latest. CI and publication results are linked in the GitHub release.

The API bootstrap applies bounded JSON parsing, proxy checks, Helmet, explicit CORS and server guards. Administrative file imports use role checks, bounded HTTPS downloads, public-address DNS validation and address pinning on redirects. Templates and history live in PostgreSQL; geofile content uses the private library and capability download paths. Frontend visibility does not replace backend authorization. Node/core source pins remain unchanged; this release changes panel UI, guidance and release metadata.

## Coverage

| Area | Actual check | Depth |
| --- | --- | --- |
| Documented API | 238 operation inventory and checked access metadata | Static; not all business operations executed |
| Protected HTTP routes | 227 anonymous requests denied; 252 HTTP checks in total including scoped-token reads, cross-resource/write denial, scope changes and immediate revocation | Real loopback API and isolated PostgreSQL/Valkey |
| Templates/geofiles | Create hosts and templates, save two independent recipients using the GUI model, read back, preserve invalid draft and active config, copy without assignments, exact DAT SHA-256, reject in-use library deletion | Real HTTP and PostgreSQL, synthetic objects only |
| Editor interaction | Assign tag, rename the linked balancer, save/reload, enable/save DAT delivery, disable/save embedded rules, reload preserves disabled delivery | Actual browser UI and real loopback backend |
| Navigation/mobile | 33 distinct desktop routes and 11 mobile route checks at 320px; no wrong-route fallback, blank completed view, page exception or document horizontal overflow | Real application rendering/navigation; not exhaustive CRUD on every screen |
| Expiry transition | Freeze starts enabled and becomes disabled when the deadline passes without a click, navigation or unrelated render | Actual component and browser timer |
| Theme surfaces | Autoselect and geofiles at 320/1280px across all eight panel themes, including nested open/closed sections and keyboard toggles | 32 component-browser cases on the included UI source |
| Frozen lifetime | Pause, repeat, extension, resume, zero lifetime, quota, expired rejection and non-UTC session | Real PostgreSQL in a rolled-back test schema |
| Node/core | Existing source pins retained; node behavior and compatibility regressions are part of the panel test suite | No claim of a fresh production-node or VPN traffic test |

Source review concentrated on API bootstrap/guards, geofile controller/downloader/storage, template validation/save/copy, frontend draft and assignment models, the editor/save hooks, HTML/SVG sinks and the changed expiry components. This is targeted review of trust boundaries and changed paths, not a line-by-line examination of every file or every external client.

## Findings and fixes

### R60-01 — expiry UI relied on render-time clock reads (CONFIRMED, P2 Logic/UX, VERIFIED)

Trigger: leave a user's action menu open across the expiry instant. The freeze button compared the date with `Date.now()` only during render, so it could remain enabled until another update. Related frozen-time labels created a moving artificial expiry date. Full frontend lint also rejected those render-time clock reads. Backend expiry validation already rejected an invalid freeze; server protection was not removed or weakened.

Fix: `toggle-user-status-button.feature.tsx` owns a sampled clock and a cleaned-up, bounded deadline timer. The button updates at expiry. Frozen labels use `format-remaining-duration.util.ts` with fixed endpoints and the selected locale; the form, table and user card no longer construct a wall-clock expiry for a paused duration.

Verification: actual browser enabled-to-disabled deadline transition, deterministic four-locale remainder tests, full frontend regression, TypeScript, lint and production build. No localization keys or authorization behavior were removed.

### R60-02 — transitive deepmerge advisory (CONFIRMED dependency alert, P3, RESIDUAL)

The fresh audits report two low alerts in panel backend and three in subscription-page backend, counting the package and parent dependency paths; both frontend audits report zero. No moderate/high/critical alert is reported in these four lockfiles. [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) still lists no patched version. Reviewed paths concern generated OpenAPI/schema metadata and build configuration. No request-to-vulnerable-merge exploitation was reproduced. This is a reachability assessment, not elimination of the dependency alert. An incompatible downgrade was not used to hide it.

## Executed validation

- Backend regression: 700 tests, 694 passed, six platform/environment skips, zero failures. Full backend TypeScript and lint passed; production API/jobs/scheduler/CLI/seed build passed.
- Frontend: 255 tests including the new duration cases, TypeScript, editor asset verification, generated documentation checks and production build. Full lint passes after R60-01; existing nonblocking warnings in tooling/virtualization remain.
- Subscription page: backend 14 tests and frontend two tests passed; both type checks and production builds passed.
- Fresh disposable database: all migrations deployed. Authentication, protected HTTP operations and template/geofile workflows ran against that database. No production database or user was modified.
- Documentation: 57 articles, 238 API operations, 52 variables and 226 controls. EN/RU/FA/ZH each contain 3279 matching keys; 4418 static translation calls were checked. The workflow and freeze behavior are documented in the source generator and regenerated guides. UTF-8 OpenAPI content was compared with the original contract; only release version/title change.
- Applicable commands: `node --test tests/*.test.cjs` in backend; `node --test tests/*.test.cjs tests/*.test.mjs scripts/*.test.cjs` in frontend under Node 24; `tsc --noEmit`, `oxlint`, Rspack/Vite production builds, `docs-tools/check-documentation.mjs`, locale parity/usage checks and `tests/package-release.test.py`.

## Limits and release decision

READY WITH RISKS within the checked scope, conditional on the publication gate above. There is no remaining reproduced P0/P1 in the reviewed paths. R60-02 remains a disclosed low dependency alert.

The native Windows seed harness completed all seed steps but retained a socket afterward; closing stdin did not remove that harness limitation. It is not recorded as a successful process-exit check. Linux image startup with a fresh database and all three application roles is mandatory before publication. Windows is not a supported production target.

Production node connectivity, live ACME, every provider firewall, destructive recovery and every version of Happ/INCY were not exercised in this audit. No VPN tunnel was started. Browser mobile emulation is not a physical-device/Safari certification. Successful suites and this review do not prove the absence of all vulnerabilities. Final immutable revisions, CI, image startup and public-download evidence belong to the GitHub release rather than an amended tag.

The 1.2.95 candidate was rejected before image creation because its helper contract still named the previous installer version. No stable release or Latest was published for that candidate. In 1.2.96 the contract and entry digest are synchronized, source-bundle verification runs before tagging, and the Linux installer suite is rerun. The earlier tag is retained rather than overwritten.
