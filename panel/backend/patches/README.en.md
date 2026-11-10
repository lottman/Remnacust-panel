[Русский](README.md) · [English](README.en.md)

# Reviewed dependency patches

`npm ci` runs [apply-dependency-patches.cjs](../scripts/apply-dependency-patches.cjs) through `postinstall`. [manifest.json](manifest.json) pins paths, original/final SHA-256 and exact replacements. Every file is validated before writing; unexpected contents stop installation. Repeated application is supported.

## Contents

- `xray-typed`: types for supported Remnacust protocols and transports.
- `sirv`: bounded HTTP-path handling in CommonJS and ESM.
- `@prisma/adapter-pg`: preserve the instant when reading PostgreSQL `timestamptz` and write unambiguous UTC values.

`nestjs-zod` is pinned to 5.6.0. It converts type unions for OpenAPI 3.0 natively and no longer depends on `deepmerge`. The former patches for both libraries have been removed. This removes the dependency affected by [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) instead of retaining a local mitigation inside it.

[Regression checks](../tests/dependency-patches.test.cjs) verify patch integrity, repeated application, rejection before writing when contents change, and input-processing safeguards. The [adapter check](../tests/zod-dto-compatibility.test.cjs) uses real Nest HTTP validation and OpenAPI generation.

## Updating

Reassess each patch when updating a dependency and regenerate the manifest using actual hashes. Do not disable SHA-256 checks to force installation. After `npm ci --ignore-scripts`, run `node scripts/apply-dependency-patches.cjs` before using the backend.

Docker builds apply patches before compilation and copy verified runtime dependencies into the image. [Backend README](../README.en.md).
