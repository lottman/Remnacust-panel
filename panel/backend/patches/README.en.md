[Русский](README.md) · [English](README.en.md)

# Reviewed dependency patches

`npm ci` runs [apply-dependency-patches.cjs](../scripts/apply-dependency-patches.cjs) through `postinstall`. [manifest.json](manifest.json) records file paths, original/final SHA-256 and exact replacements. Every file is validated before writing; unexpected dependency contents stop installation. Repeated application is supported.

Patches target pinned `nestjs-zod`, `xray-typed` and `deepmerge` contents while retaining OpenAPI/configuration contracts and reviewed merging behavior. Editing installed files does not rewrite package versions or lockfile integrity.

## deepmerge 4.3.1

The local mitigation covers reviewed paths of [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). Result properties use `Object.defineProperty`, keeping `__proto__` as an own data property rather than invoking an inherited setter. Source, CommonJS and UMD paths are covered; arrays, symbols and custom merging retain their behavior.

[Regression checks](../tests/dependency-patches.test.cjs) cover these cases, nested structures, `merge.all`, normal schema merging, repeated patching and rejection of unreviewed contents. Version-based `npm audit` reports may still include the package: the local mitigation neither claims an upstream release nor hides the advisory.

## sirv — upcoming fix

Upcoming source includes a reviewed CJS/ESM patch from Remnawave 3.4.8 to keep hostile HTTP-path handling bounded. It is not part of published Remnacust 1.1.7.97 yet. Hash verification and idempotent application remain required.

## Updating dependencies

Review the new version, reassess each patch and regenerate the manifest with actual hashes. Do not disable SHA-256 checks to force installation. When using `npm ci --ignore-scripts`, run `node scripts/apply-dependency-patches.cjs` before using the backend.

Docker builds apply patches before compilation and copy verified runtime dependencies into the image. [Backend README](../README.en.md).
