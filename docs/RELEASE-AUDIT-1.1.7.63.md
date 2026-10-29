# Release audit — 1.1.7.63 / installer 1.2.98

This release covers the unpublished node-tooltip and switch-motion fixes, recipient-proxy guidance, and installer component management and configuration archival. It does not claim a new full-site or production-node audit. The broader 1.1.7.61 audit remains historical context.

## Reviewed behavior

- Xray template generation adds the recipient as `proxy` only when `remnawave.addVirtualHostAsOutbound` is enabled. Disabling it retains eligible injected TLS hosts and the balancer. Public plaintext VLESS can be rejected by newer client cores. No transport protection is invented, no certificate check is bypassed, and existing template choices are preserved.
- Domain changes operate on registered deployments, snapshot original files and process state, validate Compose/proxy, recreate only affected services, and roll back on readiness or HTTPS failure. Database images, credentials, named volumes and unrelated services are preserved. The CLI now accepts certificate arguments for `change-domain` while retaining the prohibition during upgrades.
- Active UFW is restored after Certbot success, error or interruption. Independent transient recovery and a boot marker cover installer termination and reboot. UFW rules are not reset; inactive UFW remains inactive. These paths use mocks in automated checks; no live firewall or ACME provider was changed.
- Archival recognizes timestamped installer Compose files and `Caddyfile.before-first-vpn`. It preserves registered Compose sources, all-profile Compose references, raw extends/import references, proxy imports, bind mounts and stopped-container references. Symlinks, invalid source configuration and unsafe backup destinations fail closed. Archives are private, include SHA-256 and original modes, and are stored under `backups/<component>/`. Partial move failures preserve the originals; a concurrently created operator file is not overwritten. Cleanup is idempotent and does not recreate containers.
- Shared switch styling keeps RTL and reduced-motion behavior. Node tooltips use content width bounded by the viewport. The geofile interval uses Mantine Collapse with the panel motion preference.

## Local verification

- Frontend: 255 regression tests, TypeScript, full lint, production build, editor asset verification, documentation generation/checks and locale parity/usage checks passed. Lint retains 26 nonblocking warnings and no errors.
- Localization: 3279 matching keys in EN/RU/FA/ZH; 4418 static translation calls. The recipient explanation and generated documentation cover all four languages.
- Actual generator: seven host-injection tests passed, including the new plaintext-recipient case with the switch enabled and disabled, retaining both TLS pool members, routing and original template data.
- Installer suite: 294 Python tests plus shell/Node checks completed successfully. This includes component selection, required-input retry, TLS argument parsing, domain rollback, UFW recovery, archival failure paths, package/helper contract checks and preserved process states. The suite's existing environment-gated Docker cases are exercised separately or by Linux CI, not counted as local executions here.
- Real isolated Docker/PostgreSQL: canonical deployment migration, failed-readiness rollback, preserved credentials/data/volume, stopped services, archival of stale configs, preservation of mounted configs, and repeat cleanup without container replacement passed during this change. A separate real Caddy management integration also passed during implementation, including rollback, unchanged database container and preserved stopped worker.
- Browser checks during implementation verified 48 tooltip cases and 58 switch/geofile cases across locales, LTR/RTL, sizes, mobile/desktop and motion preferences. Those prior runs apply to the unchanged presentation source; they are not represented as a fresh physical iOS test. The new recipient description additionally passed 16 actual AutoselectPanel checks at 320/1280px across four locales and light/dark themes: bounded text, no document overflow, toggle state and preserved pool contents.

## Release gate and limitations

Publish stable Latest only after exact-commit panel/installer CI, native amd64/arm64 image checks, complete release assets, helper/version/source-pin consistency, SHA-256 verification and anonymous public image/download checks. Evidence links belong in the published release.

Node 1.1.19 and Core/WASM 1.1.11 retain their existing commits. No new database migration or dependency is introduced. The previously disclosed low deepmerge advisory is not claimed resolved by this release. Live ACME issuance, power-loss recovery on a VPS, production-node connectivity and Happ iOS execution remain unverified. No VPN tunnel or user's production server was started or modified for these checks.

The 1.2.97 candidate failed before image construction because a new CLI dispatch fixture invoked the privileged installer entry point on a non-root runner. The production root requirement was retained; cleanup dispatch is now a separate helper exercised with mocked dependencies. The fixture is explicitly rerun as an unprivileged Linux user. Candidate tags remain unchanged and were not published as stable. 1.2.98 is the corrected, separately tagged cohort.
