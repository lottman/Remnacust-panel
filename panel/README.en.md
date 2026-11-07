[Русский](README.md) | [English](README.en.md)

# Remnacust Panel

Release **Panel/Page 1.1.7.99** belongs to Installer bundle **1.2.138**, with Node **1.1.24** and Core/WASM **1.1.15**. [Changes from 98 to 99](../docs/releases/1.1.7.99.md). Installed servers require a separate update.

Manage users, nodes and subscriptions. Use the installer and prebuilt images on a VPS; the server does not need Node.js or Go build tools.

| Stable component | Version |
| --- | --- |
| [Panel and subscription page](https://github.com/lottman/Remnacust-panel/releases/tag/v1.1.7.99) | 1.1.7.99 |
| [Installer / bundle](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.138) | 1.2.138 |
| [Node](https://github.com/lottman/Remnacust-node/releases/tag/v1.1.24) | 1.1.24 |
| [Core / WASM](https://github.com/lottman/Remnacust-core/releases/tag/v1.1.15) | 1.1.15 |

## Server and ports

Installer 1.2.138 supports **Ubuntu 22.04/24.04/26.04 LTS and Debian 12/13**, Linux amd64/arm64.

For a small panel, plan for 2 CPU cores, 2 GiB RAM and 20 GiB disk; 4 cores and 4 GiB RAM are recommended. Allow more space for database growth, logs and backups as load increases. Root access, a domain and access to package repositories and image downloads are required.

| Port | Purpose |
| --- | --- |
| TCP 443 | Public HTTPS for the panel and subscriptions through a reverse proxy. |
| TCP 80 | HTTP/redirects and HTTP-01 if this certificate method is selected. |
| TCP 3000 | Default backend port; loopback or a private Docker network only. |
| TCP 3001 | Health/metrics; keep it private. |
| TCP 3010 | Default standalone subscription page port; put it behind a proxy. |

Keep SSH reachable on your configured port. Do not expose PostgreSQL or Valkey publicly. These internal service ports are separate from node VPN inbound ports.

## Install prebuilt images

```bash
curl -fsSLo installer.sh https://github.com/lottman/Remnacust-installer/releases/latest/download/installer.sh
sudo bash installer.sh install-panel
```

The command downloads the latest stable installer. Press Enter at the version prompt to select Latest; `--version` is only needed to pin a specific release.

Select a domain and HTTPS; the installer offers the subscription page separately. Create an administrator after startup. Main commands:

```bash
sudo remnacust manage-panel
sudo remnacust upgrade-panel
```

Point the domain's A record at the server. Add AAAA only when IPv6 works. The HTTPS proxy must forward to the private backend. See the [subscription page guide](../subscription-page/README.en.md) for a separate site.

## Environment and persistent files

The installed configuration is `/opt/remnacust/panel/.env` and `/opt/remnacust/panel/docker-compose.yml`. Check `/opt/remnacust/FILES.txt` for actual paths and additional instances.

| Setting | What to configure or preserve |
| --- | --- |
| `APP_SECRET` | Preserve the original persistent panel secret across upgrades. |
| `DATABASE_URL`, PostgreSQL credentials | Use matching credentials for your database, not sample values. |
| `PANEL_DOMAIN`, `FRONT_END_DOMAIN` | Panel domain and allowed frontend origin. |
| `SUB_PUBLIC_DOMAIN` | Public subscription domain, not the private API address. |
| `METRICS_USER`, `METRICS_PASS` | Your own metrics credentials. |

Keep `.env`, keys and tokens private. Recreate containers after editing the environment:

```bash
cd /opt/remnacust/panel
docker compose config --quiet
docker compose up -d --no-build --pull never
```

`restart` does not reload `.env`. Preserve the PostgreSQL and backup volumes during upgrades.

## First connection

1. Create an Xray profile with an inbound and a unique tag.
2. Add a node and install its agent using the parameters issued by the panel.
3. Assign the profile and enable the inbound on the node.
4. Allow the inbound in an internal squad.
5. Create a host with the public address and client port.
6. Add an active user to the squad and test the subscription in a client.

Happ/INCY geofiles require a full Xray JSON subscription: `/json`, or the base URL configured to return JSON. URI/base64 lists cannot carry the complete routing configuration. See [geofiles](../docs/GEOFILES.md) and [autoselect](../docs/XRAY-AUTOSELECT.md).

## Updates, backups and diagnostics

Before upgrading, save the database, `.env`, TLS files and proxy configuration; keep important backups off the server. The built-in password-protected ZIP contains a PostgreSQL custom-format dump, not a backup of every installation file. Retain the backup password separately from `APP_SECRET`: [backup and restore guide](../docs/BACKUPS.md).

```bash
cd /opt/remnacust/panel
docker compose ps
docker compose logs --tail 100
sudo less /opt/remnacust/logs/installer-panel.log
```

For an unavailable UI, check containers, proxy, DNS and certificates. For subscription 503 responses, check the backend, database, Valkey and node availability. A queued task is not confirmation that configuration was applied; inspect the node's final status. Remove secrets and personal subscription links before sharing logs.

## Development

Source builds need Node.js 24, Docker Engine/Compose v2 and an isolated test database. This is separate from maintaining an installer-managed deployment.

[Backend](backend/README.en.md) · [Frontend](frontend/README.en.md) · [Build and checks](../docs/BUILDING.md) · [API](../docs/API.md) · [User guide](frontend/public/documentation/guide-en.md).

Upstream [licenses and attribution](../NOTICE.md), including AGPL-3.0, are retained.
