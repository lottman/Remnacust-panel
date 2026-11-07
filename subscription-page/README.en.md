[Русский](README.md) | [English](README.en.md)

# Remnacust Subscription Page

Subscription page **1.1.7.101** shows account information and instructions in a browser, and delivers panel-generated configuration to VPN clients. It can be installed separately without reinstalling the panel.

Bundle 1.2.139 includes Panel/Page 1.1.7.101, Node 1.1.26 and Core/WASM 1.1.16. [Release changes](../docs/releases/1.1.7.101.md).

## Server and installation

Stable [Installer 1.2.139](https://github.com/lottman/Remnacust-installer/releases/tag/v1.2.139) uses prebuilt images and supports Ubuntu 22.04/24.04/26.04 LTS and Debian 12/13, Linux amd64/arm64.

For a standalone page, **1 CPU core and 1 GiB RAM** is a reasonable starting point. The exact minimum memory has not been measured; this is an initial recommendation, not a guarantee for every subscriber count, concurrent download rate or configuration size. Allow space for the Docker image and logs. If the same server runs the panel and database, follow the [panel requirements](../panel/README.en.md#server-and-ports).

You need a domain, an HTTPS proxy and server-to-server access to the panel API. Public HTTPS uses TCP 443; TCP 80 is needed for HTTP/HTTP-01 if selected. Keep the default application port 3010 on loopback or a private network.

```bash
curl -fsSLo installer.sh https://github.com/lottman/Remnacust-installer/releases/latest/download/installer.sh
sudo bash installer.sh install-subscription-page
```

The command downloads the latest stable installer. Press Enter at the version prompt to select Latest; `--version` is only needed to pin a specific release.

Enter the panel backend URL and a restricted API token. Token input is hidden; automation can use `--panel-token-file /root/subscription-token` with mode `0600`. Do not pass the token value as a command-line argument.

## Minimum API token

Create a token in panel settings with these four scopes:

```text
system:metadata
subscriptions:subpage-config
subscription-page-configs:get
subscription-page-configs:list
```

Full user access is unnecessary. Separately enabled Marzban compatibility may require the additional `users:by-username` scope. The API URL and token are server settings, not part of a subscriber's public URL.

## `.env` and persistent paths

The primary installation uses `/opt/remnacust/subscription-page/.env` and `docker-compose.yml`. Additional pages have separate IDs, directories and loopback ports. Find actual paths in `/opt/remnacust/FILES.txt`.

| Setting | Purpose |
| --- | --- |
| `REMNAWAVE_PANEL_URL` | Backend API. On a shared Docker network, `http://remnawave:3000` can be used; use HTTPS for a remote panel. |
| `REMNAWAVE_API_TOKEN` | Token with the four scopes above. |
| `APP_PORT` | Application port; default 3010. |
| `CUSTOM_SUB_PREFIX` | Optional prefix without leading/trailing `/`; align it with the proxy and public URL. |
| `TRUST_PROXY` | Your actual proxy addresses/hops, not arbitrary header senders. |
| `CADDY_AUTH_API_TOKEN` | Additional server-side `X-Api-Key` if a gateway in front of the API requires it. |

After changing `.env`, run `docker compose config --quiet` and `docker compose up -d --no-build --pull never` from the page's directory. `restart` does not reload the environment. When changing ports, update `APP_PORT`, the Compose port mapping and proxy upstream together; the source Compose defaults to fixed port 3010.

## DNS, CDN and geofiles

For a direct domain, point A/AAAA records at your server; publish AAAA only with working IPv6. For a CDN, use the DNS target provided by the provider. In the panel, open **Subscription → Settings → Subscription pages → Subscription domains** and register the primary domain and any CDN domains.

Copy the HTTPS origin, Host/SNI and generated request header name/value from the CDN card to the provider's configuration. If the CDN rewrites Host, preserve domain identification with those settings or the panel-issued URL containing a domain ID. Disable forced shared caching of subscriptions: proxies/CDNs must respect `Cache-Control`, or stale permissions, keys and configuration may remain available.

Happ/INCY routing and geofiles require a **full Xray JSON subscription**: `/json`, or the base URL configured to return JSON. URI/base64 lists are insufficient. Configure geofiles in the panel template; the page relays JSON, routing headers and DAT/SHA-256 files for supported clients. Refresh the client subscription after template changes. See [geofiles](../docs/GEOFILES.md).

## Management and diagnostics

```bash
sudo remnacust manage-subscription-page
sudo remnacust upgrade-subscription-page --page-id ID
```

Replace `ID` with the page ID shown in the management menu. Updates preserve connection settings; a stopped page should remain stopped. Before maintenance, securely back up `.env`, Compose, TLS/proxy settings and the token. Users and subscriptions live in the panel, so also retain [panel database backups](../docs/BACKUPS.md).

```bash
cd /opt/remnacust/subscription-page
docker compose ps
docker compose logs --tail 100
sudo less /opt/remnacust/logs/installer-subscription-page.log
```

Use the actual directory for additional pages. Check API reachability from the container, token expiry/scopes, HTTPS, prefixes and `TRUST_PROXY`. A 404 means an unknown subscription; 503 indicates temporary unavailability or overload. Subscriber-facing routes and the panel API must work even when access to the administrator UI is restricted. Redact secrets and personal subscription links before sharing logs.

## Source builds

For a source deployment, from the repository root:

```bash
cp subscription-page/.env.sample subscription-page/.env
chmod 600 subscription-page/.env
```

Fill that `.env`, then:

```bash
cd subscription-page
docker compose up -d --build
```

The default `docker-compose.yml` builds source. `docker-compose-prod.yml` references the upstream Remnawave image and is not a prebuilt Remnacust deployment recipe; use the installer for prebuilt images.

Development needs Node.js 26.13 LTS. From `subscription-page`, run `npm ci --prefix backend`, `npm ci --prefix frontend`, then `npm run typecheck --prefix backend` and `npm run typecheck --prefix frontend`. The development backend reads `.env` from its working directory; the root `.env` above is for Compose. See [full checks](../docs/BUILDING.md).

Remnawave Subscription Page [AGPL-3.0 licensing and attribution](../NOTICE.md) are retained.
