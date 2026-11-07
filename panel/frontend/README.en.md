[Русский](README.md) | [English](README.en.md)

# Remnacust Frontend

Source for the panel **1.1.7.100** UI. It is included in the prebuilt panel image; a VPS deployment does not need a separate Vite server. See [installation, resources and ports](../README.en.md).

## Local development

Use Node.js 26.13 LTS and an isolated test backend. From this directory:

```bash
cp .env.sample .env
npm ci
npm run start:dev
```

Open `http://127.0.0.1:3333`. Check these `.env` values:

```dotenv
DOMAIN_BACKEND=http://127.0.0.1:3003
DOMAIN_OVERRIDE=1
NODE_ENV=development
```

Match the port to the test backend's `APP_PORT`, and allow this local UI origin in backend CORS. Do not put API tokens or server secrets in the frontend `.env`: browser build settings are accessible to users. Start the backend using its [own guide](../backend/README.en.md).

## Checks and builds

```bash
npm run typecheck
npm run i18n:check
npm run docs:check
NODE_PATH="$PWD/node_modules" node --test tests/*.test.cjs tests/*.test.mjs scripts/*.test.cjs
npm run cb
```

The test command targets Linux. Use the [Docker build from the repository root](../../docs/BUILDING.md) for a complete production image. For a normal installed deployment, run `sudo remnacust upgrade-panel` on the server.

## Editor and documentation

The current source includes Core/WASM **1.1.16**, Xray v26.10.31. Check editor assets with:

```bash
node verify-editor-assets.mjs
```

Update WASM, `wasm_exec.js` and the schema together from [Remnacust-core/editor](https://github.com/lottman/Remnacust-core/tree/main/editor), then rebuild the frontend. Browser configuration validation does not test DNS, server reachability or an actual client connection.

Guide sources are in [docs-tools](docs-tools), translations in [public/locales](public/locales). When intentionally changing documentation, run `npm run docs:generate`, then `npm run docs:check` and `npm run i18n:check`. The API reference is built from backend OpenAPI; do not edit only its public copy.

## Diagnostics

For development connection errors, check the backend URL, port, CORS and API logs. For an installed panel, run `docker compose ps` and `docker compose logs --tail 100` from `/opt/remnacust/panel`, then check DNS and the HTTPS proxy. Use `verify-editor-assets.mjs` for editor/schema mismatches and reload the page after an update. Save editor changes before panel maintenance.

[English guide](public/documentation/guide-en.md) · [RU](public/documentation/guide-ru.md) · [API](../../docs/API.md) · [AGPL-3.0 license](LICENCE).
