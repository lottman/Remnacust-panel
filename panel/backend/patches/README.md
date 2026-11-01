# Reviewed dependency patches

`npm ci` runs `scripts/apply-dependency-patches.cjs` through `postinstall`.
Each manifest entry pins the original and patched SHA-256 hashes. All files
are validated before writing; an unexpected dependency version stops installation.
Running the patcher again is safe. The panel Docker build applies these patches
before building and copies the patched backend dependencies into the runtime image.
If installing with `--ignore-scripts`, run the patcher explicitly before use.

## deepmerge 4.3.1

Local mitigation for [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
As of 2026-11-01 no upstream patched release is available. `nestjs-zod` uses this
production dependency to clone and merge OpenAPI schemas.

The original merge writes to `destination[key]`. When the target has an enumerable
own `__proto__` property, or the source is merged into a null-prototype target,
this can invoke the setter inherited by the new destination and change its
prototype. The patch uses `Object.defineProperty` for all three destination
writes so keys remain inert own data properties. It covers the CommonJS runtime,
UMD build and source entry, preserving existing array, symbol and custom-merge
behavior. Package versions and lockfile integrity are unchanged.

Regression checks in `tests/dependency-patches.test.cjs` reproduce the vulnerable
target/source paths, nested objects, arrays and `merge.all`, and cover normal
schema merges. The patcher test checks repeat application and rejection of
unreviewed dependency contents.

`npm audit` still reports the advisory by package version. This patch mitigates
the verified behavior; it does not suppress the advisory or claim an upstream
fix. Reassess and remove the patch when adopting an upstream fixed dependency.
