[Русский](README.md) | [English](README.en.md)

# Remnacust Backend

Source version **1.1.7.100**. The panel API, background workers and scheduler. Use [prebuilt images](../README.en.md) for a normal deployment; this directory is for development.

## Install ready components

Download the latest stable installer and open its interactive menu:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/lottman/Remnacust-installer/main/bootstrap.sh) @ install
```

## Requirements

Node.js 26.13 LTS, isolated PostgreSQL and Valkey services, and a test `.env`. See the [panel guide](../README.en.md#server-and-ports) for server resources and private ports, and [database compatibility](../../docs/DATABASE-COMPATIBILITY.md) for database versions and migration considerations.

From this directory:

```bash
cp .env.sample .env
chmod 600 .env
npm ci
npm run migrate:generate
npm run build --prefix libs/contract
```

Before startup, fill `.env` with your own `APP_SECRET`, `DATABASE_URL`, Valkey settings, domains and metrics credentials. Do not deploy sample secrets. Set `APP_PORT=3003` for the frontend development example; the packaged backend defaults to 3000. Health/metrics default to private port 3001.

The source Compose uses a Unix socket for Valkey. For a TCP test instance, remove `REDIS_SOCKET` and set `REDIS_HOST`/`REDIS_PORT`. Never point development commands at a production database.

## Run and check

Apply migrations to the prepared test database, then run the processes in separate terminals:

```bash
npm run migrate:deploy
npm run dev
```

```bash
npm run dev:worker
```

```bash
npm run dev:scheduler
```

Run only one scheduler. In development mode, the bundler starts the corresponding process automatically.

```bash
npm run typecheck
node --test tests/*.test.cjs
npm run build
```

Install frontend dependencies for the complete test suite as well: `npm ci --prefix ../frontend`. Some integration tests need Linux, PostgreSQL/Valkey and a neighboring Node checkout. See [CI](../../.github/workflows/check.yml) for services and environment variables. Typechecking does not replace those integration checks.

## Contracts, files and diagnostics

`npm ci` applies the reviewed dependency patches in [patches](patches/README.md). After using `--ignore-scripts`, run `node scripts/apply-dependency-patches.cjs` manually. Generate OpenAPI on Linux with `npm run generate:openapi`; regenerate frontend documentation only after updating the backend specification.

Keep PEM files read by the panel inside `/var/lib/remnawave`. A certificate path that exists only on a node does not make the file available on the panel server. Preserve persistent files and the backup volume when recreating containers.

Installed configuration is `/opt/remnacust/panel/.env`. Recreate containers with `docker compose up -d --no-build --pull never` from the installation directory after changing it. Check `docker compose ps`, `docker compose logs --tail 100` and `/opt/remnacust/logs/installer-panel.log` for diagnostics.

A separate subscription page needs four token scopes: `system:metadata`, `subscriptions:subpage-config`, `subscription-page-configs:get`, `subscription-page-configs:list`. Use these scopes rather than an administrator token; see the [page guide](../../subscription-page/README.en.md).

[Docker builds](../../docs/BUILDING.md) · [API](../../docs/API.md) · [Backups](../../docs/BACKUPS.md) · [AGPL-3.0 license](LICENCE).
