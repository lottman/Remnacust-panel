# Remnacust Panel

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

## Component versions

The bundle for this panel version. Components use separate version numbers; publishing a release does not update an installed server.

| Component | Bundle version |
| --- | --- |
| Panel and subscription website | [1.1.7.141](https://github.com/lottman/Remnacust-panel/releases/tag/v1.1.7.141) |
| Installer / Docker bundle | [1.2.178](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.178) |
| Node agent | [1.1.39](https://github.com/lottman/Remnacust-node/releases/tag/v1.1.39) |
| Core / editor validator | [1.1.22](https://github.com/lottman/Remnacust-core/releases/tag/v1.1.22), Xray v26.11.9 |

Use a matching bundle. Updating the panel does not automatically update remote Node, managed Core or the Linux kernel. Advanced limits depend on confirmed Node/Core capabilities, not just the displayed version. [Compatibility](docs/COMPATIBILITY.md).

Find the running panel version in Build information and Documentation → Versions. Check installed agent and running Core versions in each node card. The bundle table describes the distribution: a previously selected managed core can remain active after a node-image update.

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
| Installer 1.2.178 OS | Ubuntu 22.04 / 24.04 / 26.04 LTS and Debian 12 / 13; Linux amd64 or arm64 |
| Containers | Docker Engine with a current Docker Compose v2 plugin; legacy `docker-compose` v1 is unsupported |
| PostgreSQL | For a new installation, use a supported major version with current fixes; this repository's Compose files use 18.7. See [database compatibility](docs/DATABASE-COMPATIBILITY.md) for the validation scope |
| Prebuilt-image installation | Root, APT and GitHub/GHCR access, working DNS; no host Node.js or Go needed |
| Building from source | Node.js 26.13.1, pinned in CI; Go 1.27.4 separately for Core/editor |

A separate minimum Engine or Compose minor version has not been established: use current official repository packages. The bundle selects database/cache images; installing those services directly on the host is normally unnecessary.

PostgreSQL 14 reached its scheduled end of support on **November 12, 2026**. Panel upgrades preserve the existing database image and volume, so your running database can differ from a new installation. Never open an old data volume with another PostgreSQL major version; migrate separately. [Database compatibility](docs/DATABASE-COMPATIBILITY.md) · [PostgreSQL policy](https://www.postgresql.org/support/versioning/).

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

Node control addresses share one list: IPv4, IPv6 and hostnames, up to 65 unique entries including disabled ones. Order sets priority, and a switch permits panel control through an address. Saved entries can be reordered or disabled; add a new address to correct an old one. The card shows the current control address. A configured SOCKS5 proxy applies to every fallback address; proxy failure never triggers a direct bypass. The proxy column shows configuration rather than connection health. [Node operation](docs/NODE-COMPATIBILITY.md).

The compact list marks its first enabled address with a purple Panel badge. Node 1.1.39 supplies a complete assigned IPv4/IPv6 list on the first available API response, then at most once every 30 minutes, even when Core is not running. The interval survives panel restarts. Each complete successful scan adds new IPs and removes disappeared IPs previously discovered or confirmed by the node. Manual IPs never reported by the node and hostnames are retained; surviving rows keep their order and disabled state. Rescan IPs runs the same check immediately. Failed or incomplete responses retain the list. The node reports its operating-system interfaces: a provider-side detachment becomes visible after those interfaces change.

A host is marked DANGLING if its profile or inbound is missing, or the inbound no longer belongs to that profile. Select a valid pair and save the host; cloning requires a valid binding. A disabled host or an unavailable node alone does not invalidate its binding.

Geofiles have a master switch and a per-template setting. Standard datasets can use automatic refresh every 48 hours with a configurable interval; Update now checks the source without replacing an unchanged SHA-256. Standard categories remain available alongside custom ones. With the master switch enabled and full standard datasets available, a Happ subscription refresh restores standard files while preserving manual Routing/geodata. [Geofiles](docs/GEOFILES.md).

When every control address is off, the panel does not start or reconfigure the node through a hidden fallback. Concurrent changes to control settings are checked for conflicts: reload the form before saving again. Saved changes remain pending and are retried after a temporary delivery failure; check the resulting node state. Bulk profile and inbound assignments are saved together.

Adaptive Xera HTTP offers Balanced (balanced), Low latency (low-latency) and Unstable network (unstable-network). They adjust concurrency using measured HTTP responses, data transfer and request waiting. When adaptive is present, all three fields are required: mode, minStreams and maxStreams. Integer bounds range from 1 to 32, with the minimum no greater than the maximum; the panel form offers 4/32. Limits count simultaneously active HTTP requests separately for each direction, destination and generation of transport settings. They do not count TCP connections or users, or distribute CPU load.

Apply to JSON updates the draft; save the profile separately. For inbound client settings, then refresh the application subscription. Without adaptation, existing manual settings are preserved. Adjustment affects new requests only, without aborting or replaying requests already started. Clients need Remnacust Core 1.1.22 or later with Xera HTTP support. Profiles use measured feedback without AI training and cannot guarantee DPI invisibility or an advantage in any particular country.

Manual JSON and extra, existing auto/stream-auto transfer modes, ALPN, padding and quotas are preserved.

API management retains permission checks and administrator-only operation restrictions. Updates to the RU/EN/FA/ZH guide and security dependencies are prepared. [Panel/Page 1.1.7.135 changes](docs/releases/1.1.7.135.md).

Standard Remnawave nodes and pages retain basic operation within their protocols and APIs. Advanced host/device restrictions and autoselect accounting require compatible custom Node/Core. Network failures or unknown compatibility do not authorize dropping configured restrictions. [Node compatibility](docs/NODE-COMPATIBILITY.md).

## Subscriptions, geofiles and CDN

Template text remains editable while the host list is loading or unavailable. Tools that need hosts show their own loading or error state; failure to load the template itself requires retrying.

Pool members and the hosts displaying an autoselect are configured separately. Select pool members by hosts or tags. Membership refreshes with the subscription; the client strategy selects a server for a new connection. Strategies vary by application and format. [Autoselect](docs/XRAY-AUTOSELECT.md).

Distribute connections rotates new connections across available members without measuring CPU or spare bandwidth. Xray uses roundRobin with HTTP checks; Mihomo/Clash/Stash use load-balance with round-robin. sing-box explicitly uses urltest by HTTP response time and provides no round-robin distribution here. Existing connections keep their server.

In additional subscription settings, enable base-path JSON and the geofile master switch (off by default). Then enable GEO separately from the template menu (⋯); the adjacent icon shows its state. New templates default to off. Upload a geofile from your computer or HTTPS into the shared library. Small sets are embedded into JSON; large sets can be delivered as combined DAT files to supported Happ/INCY clients. Full routing requires a JSON subscription: enable JSON on the base path or use `/json`. URI/Base64 cannot carry the complete ruleset. Save the template, then refresh the subscription in the application. [Geofiles](docs/GEOFILES.md).

Configure the inline threshold under Geofiles: 1–250,000 addresses/conditions, default 20,000, evaluated separately for each final profile. Size and complexity safeguards may require DAT earlier. Manual Xray settings remain intact when automatic geofile delivery is disabled.

Edit library files directly; presets are saved as copies with a new name. Add individual addresses below them and choose DIRECT, blocking or an existing VPN route.

Domains are under **Subscription → Settings → Subscription pages**. The installer service synchronizes the primary domain with `SUB_PUBLIC_DOMAIN`. Each primary supports one CDN domain. User cards provide primary/CDN links and QR codes.

For VK/Yandex, copy the origin, Host/SNI and generated request-header pair from the CDN card. Disable shared subscription-response caching. Backend addresses and API tokens are server-side settings; do not put them into public links. [Domains and CDN](docs/SUBSCRIPTION-DOMAINS.md) · [API permissions](docs/API.md).

## Updates and troubleshooting

```bash
sudo remnacust upgrade-panel
sudo remnacust upgrade-node
sudo remnacust upgrade-subscription-page --page-id ID
```

Save configuration and an off-server backup before updating. Complete system-package maintenance that requires answers in an interactive SSH session; a component update from the panel can defer that stage and record a notice in its log. The server is not rebooted automatically.

CLI logs: `/opt/remnacust/logs/installer-panel.log`, `installer-node.log`, `installer-subscription-page.log`. The next action for that component replaces its log. Failures display the path. Panel updates also retain `panel-update-<ID>.log`; keep the log directory private.

Nodes can serve their last configuration without the panel while credentials, expiry and local quota credit remain valid. New credit and access changes require connectivity; unlimited offline operation is not guaranteed. Node CDN, DNS and proxy infrastructure must remain independent. [Autonomy](docs/NODE-AUTONOMY.md).

If a subscription temporarily fails to load, check logs, panel reachability, website-token permissions and CDN settings. Do not replace user credentials to fix a network failure. [Operations](docs/OPERATIONS.md).

## Documentation

- Guide: [RU](panel/frontend/public/documentation/guide-ru.md) · [EN](panel/frontend/public/documentation/guide-en.md) · [FA](panel/frontend/public/documentation/guide-fa.md) · [ZH](panel/frontend/public/documentation/guide-zh.md).
- [Limits and speed](docs/HOST-LIMITS.md) · [Compatibility](docs/COMPATIBILITY.md) · [Autoselect](docs/XRAY-AUTOSELECT.md).
- [Backups](docs/BACKUPS.md) · [User migration](docs/USER-MIGRATION.md) · [Node updates](docs/UPDATE-PROGRESS-AND-NODE-HEALTH.md).
- [Subscription website](subscription-page/README.en.md) · [Subscription proxy on a separate server](docs/SUBSCRIPTION-PROXY.en.md).

For contributors and integrators: [CONTRIBUTING.md](CONTRIBUTING.md), [building and checks](docs/BUILDING.md), [API and permissions](docs/API.md), [release history](docs/releases). Technical references and historical validation are separate from the administrator guide.

## License and support

AGPL-3.0 and Remnawave attribution are preserved. Core, editor and third-party licenses are listed in [NOTICE.md](NOTICE.md). [Remnawave](https://github.com/remnawave) · [Project support](https://t.me/lottman).
