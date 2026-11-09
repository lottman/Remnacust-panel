# Remnacust Panel

Release **Panel/Page 1.1.7.105** belongs to Installer bundle **1.2.151**, with Node **1.1.27** and Core/WASM **1.1.17**. [Changes in this release](docs/releases/1.1.7.105.md). Installed servers require a separate update.


[Русский](README.md) · [English](README.en.md)

A Remnawave-based panel for managing VPN users, subscriptions, devices and Xray nodes. This repository contains the panel and a separate subscription website. The interface and built-in guide support RU/EN/FA/ZH.

[Installation](#installation) · [Requirements](#requirements) · [Documentation](#documentation) · [Releases](https://github.com/lottman/Remnacust-panel/releases)

## Where configuration lives

Our installer uses one permanent working directory per component:

| Component | Environment | Docker Compose |
| --- | --- | --- |
| Panel | `/opt/remnacust/panel/.env` | `/opt/remnacust/panel/docker-compose.yml` |
| Node | `/opt/remnacust/node/.env` | `/opt/remnacust/node/docker-compose.yml` |
| Subscription website | `/opt/remnacust/subscription-page/.env` | `/opt/remnacust/subscription-page/docker-compose.yml` |

Run `cat /opt/remnacust/FILES.txt` first: an explicitly selected external directory can differ. Use `ls -la` for hidden files. Do not create an empty replacement `.env` in `/opt/remnacust`.

```bash
cd /opt/remnacust/panel
ls -la
nano .env
docker compose config --quiet
docker compose up -d --no-build --pull never
```

`restart` does not reload `.env`; recreate the container after changing its environment. Keep the original `APP_SECRET`, node keys and database credentials. Backups live under `backups/`, logs under `logs/`.

## Stable versions

Matching bundle as of **November 7, 2026**. Components use separate version numbers.

| Component | Current stable release |
| --- | --- |
| Panel and subscription website | [1.1.7.105](https://github.com/lottman/Remnacust-panel/releases/tag/v1.1.7.105) |
| Installer / Docker bundle | [1.2.151](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.151) |
| Node agent | [1.1.27](https://github.com/lottman/Remnacust-node/releases/tag/v1.1.27) |
| Core / editor validator | [1.1.17](https://github.com/lottman/Remnacust-core/releases/tag/v1.1.17), Xray v26.11.9 |

Use a matching bundle. Updating the panel does not automatically update remote Node, managed Core or the Linux kernel. Advanced limits depend on confirmed Node/Core capabilities, not just the displayed version. [Compatibility](docs/COMPATIBILITY.md).

## Requirements

These resources are starting points, not user-capacity guarantees. Usage depends on connections, subscription refresh frequency, rules and statistics volume.

| Component | CPU | RAM | Storage |
| --- | --- | --- | --- |
| Panel with database and cache | Minimum 2 cores; 4 recommended | Minimum 2 GiB; 4 GiB recommended | At least 20 GiB, plus room for backups and images |
| Separate node | At least 1 core | At least 1 GiB, with headroom for Xray | Room for images, geofiles and logs |
| Separate subscription website | Initial allocation: 1 core | Initial allocation: 1 GiB; exact minimum not measured | Room for images and logs |

When sharing a server, leave headroom for all components. Panel/node requirements follow [Remnawave recommendations](https://docs.rw/install/requirements/); the website allocation is planning guidance.

| Software | Requirement |
| --- | --- |
| Installer 1.2.151 OS | Ubuntu 22.04 / 24.04 / 26.04 LTS and Debian 12 / 13; Linux amd64 or arm64 |
| Containers | Docker Engine with a current Docker Compose v2 plugin; legacy `docker-compose` v1 is unsupported |
| PostgreSQL | 14.24 / 15.19 / 16.15 / 17.11 / 18.6; 197 migrations, HWID and access boundaries |
| Prebuilt-image installation | Root, APT and GitHub/GHCR access, working DNS; no host Node.js or Go needed |
| Building from source | Node.js 26.13 LTS; Go 1.27.3 separately for Core/editor |

A separate minimum Engine or Compose minor version has not been established: use current official repository packages. The bundle selects database/cache images; installing those services directly on the host is normally unnecessary.

PostgreSQL 14 support ends on **November 12, 2026**. For new installations use a supported major version with current fixes. Never open an old data volume with another PostgreSQL major version; migrate separately. [Database compatibility](docs/DATABASE-COMPATIBILITY.md) · [PostgreSQL policy](https://www.postgresql.org/support/versioning/).

## Installation

Prepare the panel hostname and DNS records. Use a separate public subscription address. Allow the ports needed by your HTTPS proxy and preserve SSH access; database, cache and node API ports must not be generally accessible.

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/lottman/Remnacust-installer/main/Install.sh) @ install-panel
```

The command downloads the latest stable installer. Press Enter at the version prompt to select Latest; `--version` is only needed to pin a specific release.

The installer asks for the domain, HTTPS method and whether to install the subscription website. Create an administrator after startup. Use `--proxy existing` for your own reverse proxy. Installer prompts currently use Russian; command names are unchanged. [Installer guide](https://github.com/lottman/Remnacust-installer/blob/main/README.en.md).

Add a separate website later with `sudo remnacust install-subscription-page`. It connects to a local or remote panel using a restricted API token. [Website setup](subscription-page/README.en.md).

## Features

- Users, squads, expiry, traffic, import/export and bulk operations. `FROZEN` suspends access and preserves remaining lifetime; activation resumes the countdown.
- HWID and personal credentials, device counts and access revocation.
- Host/tag quotas in GiB and speeds in Mbps, including user/device limits on compatible Node/Core.
- Xray profiles, hosts, subscription templates, response rules and configuration history.
- Autoselect, geofile categories, DIRECT/REJECT and routes through configured groups.
- Node health, statistics, sessions, backups and API tokens with individual permissions.

Standard Remnawave nodes and pages retain basic operation within their protocols and APIs. Advanced host/device restrictions and autoselect accounting require compatible custom Node/Core. Network failures or unknown compatibility do not authorize dropping configured restrictions. [Node compatibility](docs/NODE-COMPATIBILITY.md).

## Subscriptions, geofiles and CDN

Pool members and the hosts displaying an autoselect are configured separately. Select pool members by hosts or tags. Membership refreshes with the subscription; the client strategy selects a server for a new connection. Strategies vary by application and format. [Autoselect](docs/XRAY-AUTOSELECT.md).

Upload a geofile from your computer or HTTPS into the shared library. Small sets are embedded into JSON; large sets can be delivered as combined DAT files to supported Happ/INCY clients. Full routing requires a JSON subscription: enable JSON on the base path or use `/json`. URI/Base64 cannot carry the complete ruleset. Save the template, then refresh the subscription in the application. [Geofiles](docs/GEOFILES.md).

Edit library files directly; presets are saved as copies with a new name. Add individual addresses below them and choose DIRECT, blocking or an existing VPN route.

Domains are under **Subscription → Settings → Subscription pages**. The installer service synchronizes the primary domain with `SUB_PUBLIC_DOMAIN`. Each primary supports up to three CDN domains. User cards provide primary/CDN links and QR codes.

For VK/Yandex, copy the origin, Host/SNI and generated request-header pair from the CDN card. Disable shared subscription-response caching. Backend addresses and API tokens are server-side settings; do not put them into public links. [Domains and CDN](docs/SUBSCRIPTION-DOMAINS.md) · [API permissions](docs/API.md).

## Updates and troubleshooting

```bash
sudo remnacust upgrade-panel
sudo remnacust upgrade-node
sudo remnacust upgrade-subscription-page --page-id ID
```

Configuration and backups are saved before updates. The script updates system packages; package configuration questions require SSH. Before retrying a panel-initiated update, complete required package maintenance over SSH. The server is not rebooted automatically.

CLI logs: `/opt/remnacust/logs/installer-panel.log`, `installer-node.log`, `installer-subscription-page.log`. The next action for that component replaces its log. Failures display the path. Panel updates also retain `panel-update-<ID>.log`; keep the log directory private.

Nodes can serve their last configuration without the panel while credentials, expiry and local quota credit remain valid. New credit and access changes require connectivity; unlimited offline operation is not guaranteed. Node CDN, DNS and proxy infrastructure must remain independent. [Autonomy](docs/NODE-AUTONOMY.md).

If a subscription temporarily fails to load, check logs, panel reachability, website-token permissions and CDN settings. Do not replace user credentials to fix a network failure. [Operations](docs/OPERATIONS.md).

## Documentation

- Guide: [RU](panel/frontend/public/documentation/guide-ru.md) · [EN](panel/frontend/public/documentation/guide-en.md) · [FA](panel/frontend/public/documentation/guide-fa.md) · [ZH](panel/frontend/public/documentation/guide-zh.md).
- [Limits and speed](docs/HOST-LIMITS.md) · [API](docs/API.md) · [Compatibility](docs/COMPATIBILITY.md).
- [Backups](docs/BACKUPS.md) · [User migration](docs/USER-MIGRATION.md) · [Node updates](docs/UPDATE-PROGRESS-AND-NODE-HEALTH.md).
- [Development/building](docs/BUILDING.md) · [Subscription website](subscription-page/README.en.md) · [Release history](docs/releases).

Release 1.1.7.105 fixes HWID subscription delivery without waiting for nodes, adds the global custom/default Xray selection and updates dependencies. Node 1.1.27 includes both cores. Installer 1.2.151 delivers the matching bundle. [Release changes](docs/releases/1.1.7.105.md). Updating the README does not replace installed software.

## License and support

AGPL-3.0 and Remnawave attribution are preserved. [NOTICE.md](NOTICE.md) · [Remnawave](https://github.com/remnawave) · [Project support](https://t.me/lottman).

[Subscription proxy on a separate server](docs/SUBSCRIPTION-PROXY.en.md) · [Русский](docs/SUBSCRIPTION-PROXY.md)
