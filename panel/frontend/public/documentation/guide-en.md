# Remnacust

## Where .env, Docker and data live

### Permanent working directories

Panel: /opt/remnacust/panel/.env and /opt/remnacust/panel/docker-compose.yml. Node: /opt/remnacust/node/.env and /opt/remnacust/node/docker-compose.yml. Standalone subscription page: /opt/remnacust/subscription-page/.env with docker-compose.yml beside it. Do not create another .env in /opt/remnacust itself. Each service has one working directory without a date suffix. Additional pages can use explicitly selected permanent directories. .env is hidden; use ls -la to list it.

### Edit and apply changes

For the panel, run cd /opt/remnacust/panel, then nano .env or nano docker-compose.yml. Save, validate with docker compose config --quiet, then apply with docker compose up -d --no-build --pull never. For a node or page, enter its directory first. docker compose restart does not reload environment variables; up -d recreates affected containers. Recreation may briefly interrupt connections. Do not arbitrarily replace APP_SECRET, SECRET_KEY or existing database credentials: they are tied to saved data and access.

### Older date-suffixed installations

Start with cat /opt/remnacust/FILES.txt to locate the active deployment and Compose file. Updates move owned legacy panel-<date>-<number> and node-<date>-<number> directories to permanent panel and node paths. Environment-file and bind-mount paths move with them; secrets, Docker volumes and stopped-service state are preserved. Failed verification rolls the move back. To relocate separately, run remnacust normalize-layout --component panel or --component node. Unused old directories go to backups/retired-layout. Paths used by another container and explicitly selected external deployments are not moved blindly; FILES.txt records their actual paths.

### Other files and data

backups/ holds backups and rollback history, logs/ operation logs, registry/ active deployment records, and control/ the local panel-update channel. These are not additional working panel copies. PostgreSQL, cache and backup data may live in Docker volumes. Moving the working directory does not create a new database or replace existing volumes. Root and service FILES.txt maps list the files actually in use. Data and saved secrets remain unchanged after relocation.

## Getting started

### Main sections

Users are accounts and their access settings. Nodes are connection servers. Profiles define Xray configuration, while hosts define the connection addresses shown in subscriptions. Internal squads connect users to permitted inbound connections. For your initial setup, follow “First working connection”.

### What determines access

A connection requires a working node, an active profile inbound, an available host and an internal squad permitting that inbound. User status, subscription expiry, traffic quota and device restrictions also apply. Host and tag limits are separate from the user’s overall quota.

### Checking changes

After saving, check the updated values in the detail view. If a connection still uses the previous settings, check node status and logs, then refresh the subscription in the client.

### Update progress and logs

Panel updates show eight stages, elapsed time and the last 24 events. Remaining time is estimated only when a previous operation supplies timing data; otherwise remaining stages are shown. Closing the tab does not cancel the update. The service pins a fresh installer release before checking and installing it; a newer verified panel may supersede an outdated notification target. Successful updates keep current, previous and container-used images while removing redundant component images. The panel does not receive the Docker socket.

## First working connection

### Setup order

1. [Create a profile](/dashboard/management/config-profiles) with a valid inbound and a unique tag.
2. [Connect a node](/dashboard/management/nodes), select the profile and activate the inbound.
3. [Create an internal squad](/dashboard/management/internal-squads) granting that inbound.
4. [Create a host](/dashboard/management/hosts) with its address and port, linked to the inbound.
5. [Create an active user](/dashboard/management/users), set expiry and add the squad.
6. Open the [user](/dashboard/management/users), copy their subscription URL and import it into a compatible client.

### If a host is missing

Check squad membership, inbound activation on the node, host visibility/status, squad restrictions on the host and account status. Then check the delivered format and User-Agent response rules. A host existing in the panel does not prove that a particular user can access it.

## Navigation, tables and selection

### Moving around

The sidebar expands categories. On a phone the menu button opens navigation, which closes after choosing a page. Quick launch finds sections; open entity resolves a known user, node, host or profile by identifier. Documentation links preserve the selected article or API operation in the URL.

### Tables and recipients

Use search, column filters, sorting, page size and column visibility. Row selection and table filtering are different concepts: review the recipient count before a bulk action. In limits, ALL targets all current entitled users of the scope, not just the visible page or search results.

## Home: metrics and health

### Metrics

Home shows transferred traffic, current bandwidth, online users and nodes, account status totals and activity statistics. Transferred volume and bandwidth are different quantities. Online now, online today/week and never online describe different time windows and should not be expected to match.

### Panel diagnostics

Open a status card for details. If data has not appeared, wait for loading or refresh. A spinning icon indicates that the request is still in progress.

## Creating and editing users

### Identity and contacts

The username identifies an account. Email, Telegram ID, description and tag help with searching and grouping. Internal squads determine connection access.

### Access and quota

Set status, expiry, subscription traffic quota, reset strategy, internal squads and optionally an external squad. A subscription quota of 0 is unlimited. Host and tag quotas remain independent. The field reference below uses the exact names and help text from the current form.

### Saving

Before saving, check squads and subscription expiry. Then verify the status and date in the detail view. A subscription ends at the specified time; the date indicator’s color does not change the expiry.

### Freeze a subscription

Choose Freeze in the user menu: ordinary access is paused and the remaining lifetime is retained. Two days remaining stay two days until activation. Resuming sets the new expiry from that remainder; repeating Freeze does not change it. Zero remaining time or an exhausted quota does not grant access. Extending adds to the remainder. Expired subscriptions cannot be frozen. A blue saved remainder replaces the date editor. Active expiry warnings turn yellow at three days and red on expiry. Freezing itself does not reset usage; scheduled traffic resets continue. The state survives restarts and export/import. Bulk freezes synchronize each user’s device access through the queue.

### Device subscription preview

Select an already registered device, format and User-Agent in the device card and generate a preview. It uses the real generator and response rules without changing the device or connection history or creating access keys in the database. A blocked device receives no working access. The host list shows candidates; the generator performs final protocol and pool filtering. Configuration containing keys is hidden by default and returned only on explicit request, up to 2 MiB. Treat it as private and keep it out of public logs.

### Fields and controls

- **Status**: ACTIVE means active, DISABLED disabled, EXPIRED expired and LIMITED overall quota exhausted. A working connection also requires a valid expiry date and host access.
- **Expiry date**: Subscription expiry date and time. Choose a future date for a valid subscription and use the time zone shown in the form.
- **Telegram ID**: Numeric user Telegram ID, distinct from a username or backup-delivery chat ID.
- **Email**: User contact/search field; it does not grant inbound access.
- **Description**: An administrator description of the record, such as service terms or a note about its settings.
- **Traffic limit**: Subscription quota in bytes; 0 means unlimited. The form displays units separately. Host/tag limits remain independent.
- **Traffic reset strategy**: Overall user quota reset strategy: no reset, day, week, calendar month or rolling month. Host and tag periods are configured in their own settings.
- **External squad**: External squad with its own subscription delivery settings. Select it when the user needs that group’s template or subscription page.
- **Expiry date**: The lifetime and access are paused. The saved remainder resumes on activation. The date cannot be edited while frozen.
- **Internal squads**: Internal squads granting the user access to selected inbounds. Multiple squads can be assigned.
- **Username**: Account name used to find and manage the user. It must be available when creating an account.

## User actions and details

### Status and resets

ACTIVE allows access when other checks pass. DISABLED turns off the account, EXPIRED indicates expiry and LIMITED an exhausted subscription quota. Enable, disable, reset traffic and revoke/rotate a subscription are separate operations. Resetting subscription usage must not be treated as resetting every host/tag quota; use Limits for those scopes.

### Card buttons

QR and connection keys help import the subscription. JSON shows data, metadata exposes extra properties, details show account information and nodes show placement/access. Other buttons open torrent restrictions, subscription request history, HWID devices and active connections. Tooltips and accessible button names identify actions; touch controls have larger hit areas.

### Link and deletion

Click the subscription field or copy button to copy its URL. The adjacent help opens on click and works on phones. The URL contains the user access secret: do not publish a real link in documentation. Deleting removes the account; disabling keeps it available for later reactivation.

## Bulk user operations

### Updating selected accounts

Select users, choose an action and check the recipient count before confirming. In bulk editing, set only the fields you want to change. Each user keeps their other values. For example, changing the expiration date does not also change squads or the traffic quota.

### Checking results

Squad, traffic, expiry, device and status changes affect each recipient. Review selection before deleting. Refresh after completion and inspect an individual account. A network failure does not prove that no operation ran: read the current state before retrying a mutation.

### Fields and controls

- **Status**: ACTIVE means active, DISABLED disabled, EXPIRED expired and LIMITED overall quota exhausted. A working connection also requires a valid expiry date and host access.
- **Expiry date**: Subscription expiry date and time. Choose a future date for a valid subscription and use the time zone shown in the form.
- **Telegram ID**: Numeric user Telegram ID, distinct from a username or backup-delivery chat ID.
- **Email**: User contact/search field; it does not grant inbound access.
- **Description**: An administrator description of the record, such as service terms or a note about its settings.
- **Traffic limit**: Subscription quota in bytes; 0 means unlimited. The form displays units separately. Host/tag limits remain independent.
- **Traffic reset strategy**: Overall user quota reset strategy: no reset, day, week, calendar month or rolling month. Host and tag periods are configured in their own settings.
- **External squad**: External squad with its own subscription delivery settings. Select it when the user needs that group’s template or subscription page.

## Importing and exporting users

### Import format

Upload an exported JSON file containing a users list with at most 20,000 records. “Restore squads by name” assigns users to existing internal squads with matching names; missing squads are not created. Turn it off to discard squad assignments from the file. The additional squad selected in the form is assigned to every imported user independently of this checkbox.

### What is transferred

Check the created, skipped and failed counts after import. An existing username or short identifier causes a record to be skipped; other errors appear in the import result. Test a subscription belonging to a newly created user. The export contains access credentials: keep the file private. It is not a database backup and does not transfer profiles, nodes, API tokens or all panel settings.

### Fields and controls

- **Restore internal squads by name**: Restores internal squad membership by names from the file. Squads with those names must exist in the destination panel; missing squads are skipped.
- **Add everyone to an additional squad**: Additional internal squad for all users created by the import. It is added even when restoring squads from the file; leave empty to add no extra squad.

## HWID: devices, blocking and registration

### Limit and registration

HWID is enabled by default on a new installation; an upgrade preserves the saved switch. A compatible app sends its device identifier when requesting a subscription. An empty user limit uses the shared fallback limit, 0 allows any number of devices, and a positive number sets the maximum. With a limit of 3, a fourth new device cannot register. “Disallow new devices” separately stops registration while preserving access for existing allowed devices.

### Deletion versus blocking

Deleting a device removes its registration: the same app can register again if new devices are allowed. To prevent access, block it instead: the record remains and that device’s access is revoked. Unblocking removes the ban. “Delete all unblocked” clears allowed registrations while keeping blocked device records.

### Requirements

The application must send supported HWID headers. Removing a registration is not a permanent admission ban. Automation uses separate registration, blocking and unblocking scopes; listing devices does not grant blocking permission.

### Fields and controls

- **Description**: An administrator description of the record, such as service terms or a note about its settings.
- **Show generated configuration**: Contains private keys/links for this device. Do not share it publicly.
- **Deny new devices**: Existing devices continue working. Allowing registration keeps the device limit.

## Internal squads

### Purpose

A squad groups allowed inbounds and its users. Create it, choose inbounds and assign users. A user can join multiple internal squads. Changing inbounds changes granted access; a squad does not create nodes or hosts automatically.

### Management

The card opens members, inbound assignment, statistics and group actions. Exporting members transfers users rather than the entire squad infrastructure. Host squad restrictions may include or exclude a host, so membership alone does not guarantee every host appears in a subscription.

## External squads and subscription variants

### Purpose

An external squad supplies a subscription delivery variant for an assigned user, including templates, subscription page and supported overrides. It does not replace internal squads that authorize inbounds. Assign it only after reviewing the group settings.

### Overrides

Changing external squad templates or settings can change delivery for all members. Compare an individual subscription with global settings because external squad overrides can affect the result. Verify delivery after deleting or changing the assigned group.

## Adding and configuring a node

### Connection

A node is a server agent running our Xray. Create the record, set its management address/port, configure connection credentials and select a profile with active inbounds. The management port is separate from a host client port. Verify reachability from the panel server and correct connection parameters.

In card view, nodes can be dragged with a tag selected. Only visible nodes are reordered; other records keep their positions. Form actions stay at the bottom of the window while scrolling.

### Fields and accounting

Name, country, tags and provider describe infrastructure. The profile and inbound list determine active services. A node consumption multiplier changes user traffic accounting and is not a bandwidth cap. Traffic tracking, monthly threshold, reset day and node notifications concern server usage rather than an individual user quota.

### Installation and certificates

SSH installation requires root or passwordless sudo; an existing empty directory is allowed. Failures show the stage and detailed logs remain on the server. With a panel-IP restriction and HTTP-01, TCP 80 opens temporarily for certificate validation and closes afterwards; a failed process cannot keep it open longer than 15 minutes. Renewal uses the same rule. External and provider firewalls need their own configuration. Use DNS-01 or an existing certificate to keep port 80 closed.

### Diagnostics and safe operations

Diagnostics make a real mTLS request to the registered node and check Xray, user synchronization and port apply status. They do not verify the full client network path. Disabled nodes are not probed; manual probes are rate limited. Port edits are reviewed, then confirmed with a review hash and current revision: stale reviews are rejected. Success requires node ACK, not merely enqueueing. Errors allow restoring a previously applied revision without overwriting newer edits. Outages require three observations over at least 20 seconds; recovery requires two over 10 seconds. Never-connected installations do not generate outage alerts. Maintenance and operations suppress alerts; a manual 30-minute pause does not stop health checks. The install wizard uses the verified installer over SSH and confirms connectivity separately; existing directories are not overwritten. NET_ADMIN defaults off. When a main server IP is set, all incoming ports and ping accept only that source except SSH (22 and detected sshd ports). Rules cover Docker forwarding and IPv6, preserve outbound replies and never flush other firewall rules. This blocks external HTTP-01 renewals: use DNS-01 or externally managed certificates. Remove the guard with python3 /etc/remnacust-node-firewall/guard.py remove.

### Fields and controls

- **Limit**: Subscription quota in bytes; 0 means unlimited. The form displays units separately. Host/tag limits remain independent.
- **Reset day**: Day of the month for resetting the node’s monthly traffic counter. This setting applies to server accounting.
- **Notification %**: Notification percentage threshold for tracked node usage. It does not increase allowance.
- **Tags**: Object label array. Host tags also connect enabled policies; saving an empty array clears labels.
- **Note**: Administrator note about the object, not a routing/access configuration.
- **Country**: Country code used for display/grouping. The flag does not change server location.
- **Internal name**: Object display name. UUID remains a separate identifier.
- **Address**: Reachable IP/domain used by the client or panel in this form’s context; separate from the display name.
- **Node Port**: Port of the selected service. A host client port and node agent management port can differ.
- **Plugin**: Plugin configuration assigned to the user. Check that its executor is configured on the required nodes.
- **Integrations**: Assigned node integration configurations. Creating an integration and assigning it to a node are separate actions.
- **Proxy URL**: SOCKS proxy for panel control requests to this node, for example socks5://user:pass@proxy.example.com:1080. Leave empty for a direct connection. This does not proxy user traffic; keep embedded credentials private.

## Node actions

### Enable, restart and reset

Enable/disable controls the node state in the panel. Restart reapplies Xray operation and can interrupt connections. Resetting usage statistics does not delete users or upgrade the core. Deleting a node record does not terminate the provider server.

### Bulk update

Selecting multiple nodes shows the changed fields in confirmation. Before switching profiles, verify certificates, listen addresses and ports on each server. After applying, inspect health on every selected node rather than only the first row.

### Changing an active port

Each port-plan binding selects a port, profile and inbound. Compatible changes are applied through the core while preserving existing connections. A real port, transport or incompatible active-listener change requires a separate port and tag, or an explicit restart that may interrupt connections. A rejection does not trigger a hidden restart. The original technical error is shown verbatim. Updating the container or core binary may interrupt connections.

### Fields and controls

- **Country**: Country code used for display/grouping. The flag does not change server location.
- **Plugin**: Plugin configuration assigned to the user. Check that its executor is configured on the required nodes.
- **Integrations**: Assigned node integration configurations. Creating an integration and assigning it to a node are separate actions.
- **Tags**: Object label array. Host tags also connect enabled policies; saving an empty array clears labels.
- **Note**: Administrator note about the object, not a routing/access configuration.
- **Force**: Guarantees that all nodes fully restart Xray Core.
- **Graceful**: Sends a request to all nodes to restart Xray, but the request may go unfulfilled if the node hash matches the current one. This is the default option.
- **Force**: Ensures that the node completely restarts Xray Core. This is the recommended option.
- **Graceful**: Sends a request to this node to restart Xray, but the request may go unfulfilled if the node hash matches the current one.

## Node resources, health and logs

### State and resources

Open a node card to inspect connectivity, online users, CPU load, memory, networking and Xray information. Available metrics depend on the agent. A missing value does not mean zero load: check connectivity and refresh. Panel, node agent and Xray versions are listed separately under Documentation → Versions.

Host policies could not be applied. The new configuration was not sent to the node; a running Xray keeps its previous configuration. Check host isolation v2 support in the node and core. The panel will retry once support is restored. The configured limits remain enabled.

Update the node to Remnacust Node 1.1.1 with our Xray. This profile requires host isolation v2. Its limits and new connections will not work until the update. The running configuration is kept; after updating, the panel will apply the new one automatically.

### Logs

The health log helps locate connection failures, application errors and restarts. The Xray log shows core messages; its contents depend on logging settings. Compare message timestamps with profile changes.

### How node health is calculated

Disabled, disconnected or still connecting nodes show 0/100. Missing active profile/inbounds or fresh running-Xray confirmation also gives zero. Once these prerequisites hold, each of four signals contributes 25 points: configuration, connection, running core and normal resources. Missing metrics never inflate the result. Cached metrics of disconnected nodes are not presented as current. Unknown data, memory pressure and sustained CPU load are listed separately. Resource cache lasts 30 seconds and Xray uptime 16 seconds; expiry removes confirmation without proving a core crash.

## Node SSH terminal

### Server access

The terminal connects using separately configured SSH credentials. Its address and port may differ from the node agent. Commands run on the selected server as the SSH user; sudo depends on server permissions. Verify the target node before running commands.

### Access

The SSH terminal supports administrative server work. Closing a tab does not guarantee that commands stop. Check the result and status of a long-running operation before starting it again.

### Fields and controls

- **Internal name**: Object display name. UUID remains a separate identifier.
- **Country**: Country code used for display/grouping. The flag does not change server location.
- **Domain or IP**: Reachable IP/domain used by the client or panel in this form’s context; separate from the display name.
- **Node Port**: Port of the selected service. A host client port and node agent management port can differ.
- **Plugin**: Plugin configuration assigned to the user. Check that its executor is configured on the required nodes.
- **Tags**: Object label array. Host tags also connect enabled policies; saving an empty array clears labels.
- **Main server IP (optional)**: Only this IP can reach ports and ping; SSH remains public. Clients connect through the main server.
- **Default**: The node will use its default outbound route.
- **IP address**: Pick one of the node IPs or type any address
- **Interface**: Pick one of the node interfaces or type any name

## Node server optimization

### Optimization levels

none, safe, balanced and performance launch the bundled script through the SSH terminal. They change server OS settings rather than subscription limits. Recommendations use memory: below 2 GiB or at least 85% memory usage suggests safe; other servers suggest balanced.

### Verifying application

Check reads the actual server state. A chosen level can differ from the last verified level until the command and verification finish. If verification fails, do not assume success: inspect SSH output.

## Node core management

### Choosing an update

In node tasks, choose Install release and a verified build. The panel includes a current catalog for amd64 and arm64 and selects a build automatically. Refresh reloads the list. An empty or unavailable catalog shows an explanation and prevents installation; the bundled core remains a separate action. Update both the panel and nodes to use the default public catalog. Switching may temporarily interrupt connections.

### Operation result

Follow the task status and each node’s log. Where available, cancellation applies to a task still in progress. After completion, check the core version, node health and a test user connection. Host and tag limits and device revocation require a compatible core.

## Node plugins and shared lists

### Plugin configuration

The beta section stores plugin configurations, tags and node assignments. Create, clone, edit, delete, reorder and synchronize are distinct actions. The editor validates configuration and warns before leaving with unsaved changes. Saving is separate from executor operation.

### Shared lists

Shared lists let multiple configurations reference the same list. Synchronize after editing and check assigned nodes. Deleting or renaming a referenced list can affect several plugins.

### After core startup

The postStart section in plugin JSON runs enabled actions after Xray starts or restarts. To send a notification, enable postStart.enabled and postStart.webhook.enabled and set webhook.url. The node sends a POST containing service.core_started, a timestamp and its metadata. Delivery runs in the background with a five-second timeout; failures are logged without stopping Xray. Verify the destination before enabling it.

## Node statistics and metrics

### Usage history

Statistics show node usage across time ranges. Compare matching intervals. Instant bandwidth is not daily volume; resetting a monthly counter is not equivalent to deleting all historical records.

### Metrics

The metrics page compares node load and health. An unreachable node may not return fresh values. Dates and available history depend on stored data and retention settings; the interface cannot reconstruct missing records.

## Providers and infrastructure billing

### Server accounting

Create a provider and assign nodes. Set cost and payment date/period using the available fields. Cards and statistics summarize infrastructure spending. The provider badge is accounting metadata rather than server authentication.

### Dates and notifications

Payment dates help track renewal. Dates use UTC calendar days: more than 7 days is neutral, 2–7 days is yellow, tomorrow is orange, and today or overdue is red. Overdue totals are also red. Text distinguishes due today from overdue and shows the day count. Colors adapt to the theme, and statuses update at day changes and when returning to the tab. On phones, amounts and labels wrap, actions stay separate from long node names, and the last card can scroll clear of the bottom toolbar. Recording payment or editing a date in the panel does not transfer money to the provider. Check linked nodes and accounting history before deleting a provider.

### Fields and controls

- **Limit**: Subscription quota in bytes; 0 means unlimited. The form displays units separately. Host/tag limits remain independent.
- **Reset day**: Day of the month for resetting the node’s monthly traffic counter. This setting applies to server accounting.
- **Notification %**: Notification percentage threshold for tracked node usage. It does not increase allowance.
- **Tags**: Object label array. Host tags also connect enabled policies; saving an empty array clears labels.
- **Note**: Administrator note about the object, not a routing/access configuration.

## Configuration profiles

### Server profile

A profile contains the complete Xray configuration. Create it with uniquely tagged inbounds, outbounds, routing and DNS. Activate inbounds on nodes and grant them through squads. Hosts reference an inbound of that profile, so changing or removing its tag affects linked hosts.

### Save and clone

Cloning creates a separate profile for experiments; editing the original can affect every assigned node. Server validation is independent of editor validation. Check node health after applying and avoid static accounts in place of panel-managed accounts.

### X25519 password and private key

The generator shows two values: Private key for the server and Password (public key) for the REALITY client. For X25519, password and publicKey identify the same bytes, so no duplicate field is shown. Copy all contains privateKey and password. Do not distribute the private key to clients.

### Fields and controls

- **Profile relations**: Squads, inbounds, nodes and hosts

## Xray configuration editor

### Editing a configuration

Open a profile and edit its JSON. Press Ctrl+Space for suggestions, use the up and down arrows to select an option, Enter to insert it or Esc to close the list. The current option is highlighted. Search, formatting and full-screen mode are also available. Before saving, fix marked errors and run configuration validation.

### Generate a shortId

The Short ID tab in Tools generates 16 hex characters from 8 secure random bytes. Copy the value into shortIds in the server realitySettings and use the same value as shortId on the client. Generate creates a new value without changing the saved profile or starting rotation.

### Checks before applying

Save validates JSON first. A missing protocol, a typo in it or a structural error produces an explanation without changing the profile or its history. If the built-in Xray validator reports another error, the panel displays it and asks you to confirm saving. Confirmation does not bypass server-side structural checks. A saved invalid profile can be reopened and corrected.

### After saving

Database persistence and node application are separate steps. A queued message means a job was submitted; check node status and logs for its outcome. If queuing fails, the profile has still been saved and the panel shows a warning. Edits made while saving remain in the editor. Clone a profile first when preparing a separate variant.

### X25519 keys

The X25519 tab in Tools shows password, publicKey and privateKey with separate copy buttons. password and publicKey contain the same public key; the names are used by different versions and clients. Set the private key on the REALITY server and the public key in the field supported by the client. All values copies the three fields. Generating updates them together without changing the saved profile.

## Xera HTTP transport

### Origin and place in a connection

Xera HTTP is a fork of the XHTTP (SplitHTTP) transport from Xray-core, developed in Remnacust Core. It carries connection data in HTTP requests and responses. The original XHTTP implementation is in [Xray-core](https://github.com/XTLS/Xray-core/tree/v26.9.30/transport/internet/splithttp); our fork is in [xerahttp](https://github.com/lottman/Remnacust-core/tree/main/xray/transport/internet/xerahttp).

In a profile, VLESS specifies the connection protocol and user, Xera HTTP specifies the transport, and TLS or REALITY protects the connection. Thus protocol: "vless", streamSettings.network: "xera-http" and streamSettings.security: "tls" can be used together. When switching to Xera, do not replace protocol with xera-http; change the transport and its options inside streamSettings. TLS, the user UUID and routing retain their separate roles.

### Changes in the fork

Xera is registered separately as network: "xera-http" with xeraHttpSettings. Standard XHTTP remains a separate transport. The fork includes stream-auto, customDownlinkPadding for data blocks, configuration validation and resource limits for sessions, upload queues, headers and blocks. Session identifiers use a cryptographic random generator and are checked for allowed characters and sufficient entropy.

Request padding xPaddingBytes and customDownlinkPadding serve different purposes: the latter pads transmitted data blocks and needs compatible processing on both ends. Shared XHTTP ancestry does not mean every XHTTP client understands these extensions. Speed and reliability depend on the network, mode, proxy and settings; the fork alone does not promise faster connections or guaranteed circumvention.

### Compatibility

Xera HTTP is an XHTTP fork in our Xray core. Both the node core and the client application core must support it. XHTTP support in a regular Xray build does not imply Xera support. Check that both builds accept network: "xera-http". Clone a working profile and test a separate host before changing it for all users.

### Profile configuration

Open JSON in a [profile](/dashboard/management/config-profiles) and set network: "xera-http" in the inbound streamSettings. Transport options belong in xeraHttpSettings. The example below is a streamSettings fragment, not a complete inbound: retain your tlsSettings, clients, port and other settings. TLS requires a valid certificate and a matching domain. For REALITY, use security: "reality" and your realitySettings.

```json
{
  "network": "xera-http",
  "security": "tls",
  "xeraHttpSettings": {
    "path": "/connect",
    "mode": "auto"
  }
}
```

### Node, host and subscription

Activate the inbound on a compatible node, permit it in an internal squad and link a [host](/dashboard/management/hosts). Set the public address, port and SNI on the host. Path and Host fields can override profile values for the client; they must match what the server or proxy accepts. Refresh a test user subscription. Xray JSON retains xeraHttpSettings; share links carry type=xera-http and xeraSettings. The client must understand this format. Sing-box, Clash and Mihomo generators skip these hosts because they do not support this transport.

### Modes and HTTP proxies

Start with mode: "auto". In our implementation it selects packet-up without REALITY; with REALITY it selects stream-one, or stream-up when separate downloadSettings are configured. A server using auto accepts supported client modes.

- packet-up: upload is split into finite HTTP requests; download uses a separate stream.
- stream-up: upload and download use separate long-running streaming requests.
- stream-one: upload and download share one bidirectional streaming request.
- stream-auto: for HTTP/2 with REALITY, selects stream-one or stream-up with downloadSettings; otherwise selects packet-up. HTTP/2 support at a CDN edge does not establish that the CDN forwards request bodies without buffering.

Upload in headers or cookies and GET require explicit packet-up. Match path, host and customized header options on both ends. The HTTP host and TLS SNI are distinct settings; specify Host through host, not headers.Host.

Behind an HTTP proxy, check the route, headers, request-body limits and timeouts. Streaming modes require forwarding request bodies before completion and unbuffered responses. REALITY needs the protected connection to reach the core; ordinary CDN TLS termination does not replace it. If the proxy cannot forward a mode, test packet-up on a separate host.

### Additional traffic padding

customDownlinkPadding adds random bytes to transmitted blocks and increases traffic usage. Start without it. When enabled, set matching header and token values on both sides: header must start with X- and contain 3–64 characters; token must contain 16–128 base64url characters. Avoid reserved proxy headers. bytes accepts 0–1024 and blockBytes 1024–16384; budgetPercent caps overhead (up to 100%), burstBytes is the initial allowance (up to 1 MiB), and uplink enables upload padding. These settings do not replace TLS/REALITY or guarantee that a connection bypasses blocking.

bytes and blockBytes accept a number or a "from-to" range. budgetPercent: 0 or an omitted field disables the percentage cap, not padding itself. Set budgetPercent from 1 to 100 to constrain overhead. burstBytes requires a nonzero budget; the initial allowance may yield a higher percentage on a short connection. token coordinates padding processing; it does not replace the user UUID, protocol password or TLS. Leave padding disabled for the first test.

With a nonzero budgetPercent and zero or omitted burstBytes, the core uses a 4096-byte initial allowance. The budget concerns padding bytes; HTTP headers, TLS and framing also consume traffic.

### Verify the result

Validate JSON in the editor and save the profile. Database persistence and application on a node are separate stages: check the queue, node status and logs. Download the subscription again and compare network, path, mode and SNI in the client configuration. “Unknown transport” means the selected core does not support Xera. If the host is missing, check squads, access, filters and subscription format. For unstable connections, return to auto without additional padding and change one option at a time.

To migrate from XHTTP, clone the profile and host and keep the working configuration. Change streamSettings.network from xhttp to xera-http in the intended inbound and move verified xhttpSettings options to xeraHttpSettings. Do not change protocol, UUID, port or TLS/REALITY without a separate reason. Do not retain both settings blocks in the same variant. Renaming alone cannot give a standard XHTTP core Xera support: check both cores and the configuration the client actually imported. Start with the previous path and host, mode: "auto" and no new extensions. Verify connection, upload, download, reconnection and node logs before switching other users. To revert, use the saved XHTTP profile and refresh the subscription.

For a parallel test, use a separate node or a free port. Two inbounds must not listen on the same address and port at the same time.

## Visual profile canvas

### Canvas and JSON

The canvas helps visualize a profile’s inbounds, outbounds and routes. Open the desired profile and compare edits with JSON. Applied JSON remains the core configuration: visual block placement alone does not determine rule order.

### Checking changes

Validate and save profile edits, then inspect assigned node health. Review complex parameters in the JSON editor when the canvas does not expose them; an absent visual block is not a reason to remove its JSON parameter.

## Snippets and profile synchronization

### Reusable configuration

A snippet stores a named configuration fragment. Create it, use it in profiles and edit it centrally. Saving the fragment and synchronizing its consumers are distinct steps; synchronization confirmation distributes the change.

### Deletion

The interface offers synchronization after deleting a snippet. Check affected profiles and nodes because references may need changes. Validate the resulting JSON before broad application, not only the isolated fragment.

### Fields and controls

- **Snippet name**: Object display name. UUID remains a separate identifier.

## Generating keys and passwords

### Key material

The generator creates supported key pairs and configuration parameters. Public keys can be delivered to clients; private keys must remain server-side. Formats for different protocols are not interchangeable. Preserve matching parts and check the key against the selected inbound.

### Shadowsocks-2022

Choose the key type matching the cipher in your Shadowsocks-2022 configuration. Use matching parameters on the server and client. Keys for different ciphers are not interchangeable.

## Hosts: addresses and client delivery

### Core parameters

Remark names a subscription connection. Address and port are the client endpoint; inbound supplies server parameters from a profile. SNI, Host, path, ALPN and security customize TLS/transport and must match the server. Host node assignment and node inbound activation are separate settings.

Above the list, choose Enabled, Disabled, Visible or Hidden. Visible includes hosts with isHidden = false, including disabled hosts. Enabled includes hosts with isDisabled = false, including hidden hosts. The filter combines with the selected tag in card and table views. In card view, drag hosts within a tag; other records keep their positions. Save, copy and delete actions remain available at the bottom of the form while scrolling.

### Visibility and actions

A hidden host is omitted from new subscription responses, but hiding alone does not revoke credentials already issued. Disabling a host controls access through node policy. Internal squads restrict who receives the host. Cloning creates another host record with the original settings; it does not create a server. After saving, wait for policy application and test a user’s subscription.

If the panel loses contact with a node, an authorized host remains in the subscription with the same connection details. Node health alone does not hide it. The connection may fail until the server recovers; once it recovers, a subscription refresh is not needed just to restore the host entry. Visibility, disabled status, squad restrictions, quotas and device blocks are checked separately.

### Bulk editing

Select hosts, choose the fields to update and check the recipients. Selecting the tags field and leaving it empty clears tags; leaving the field unselected preserves existing tags. Record order determines subscription order except where shuffling is enabled. After changing an inbound, visibility or squad, refresh the subscription in a client and check that the intended connection is present.

### Dynamic device bandwidth

The user speed in Mbps is a shared ceiling for all their connections on this host. Active device keys share it by bytes served: one device uses available capacity; when another sends traffic, capacity is redistributed. Idle devices reserve nothing. The device speed limit caps all connections of its private key, combining upload and download. With a 20 Mbps user ceiling and a 15 Mbps device ceiling, one active device gets up to 15 Mbps; two continuously demanding devices can share 20 Mbps, roughly 10 Mbps each. These are ceilings, not guaranteed network rates. A configured host or tag shared ceiling is divided first among users, then their devices; opening more flows does not increase the share. Without a configured shared ceiling the core does not know the physical channel capacity.

### One user’s speed

Under “For each user on this host”, set the quota in GiB and speed in Mbps. These are different limits: quota is a data allowance, speed is the transfer rate. All devices and connections of one user on this host share the speed, including upload and download. With 2 Mbps, two devices together get up to 2 Mbps; another user has a separate allowance. Another host uses its own setting. 0 disables only the host’s own cap; enabled tag restrictions remain. Shared speed for all host users and the accounting multiplier appear below.

### Bulk actions and country search

Enable, disable and delete return after the database commit; node policy delivery starts in the background and unavailable nodes are retried. A saved action does not mean a disconnected node already received it. Buttons show progress and the list updates after API acknowledgement. Cloning runs at most three requests at once; successful sources are deselected and failed sources remain for retry. Search flags by country name in RU/EN/FA/ZH or two-letter code independently of the UI language.

### Fields and controls

- **User traffic quota**: Combined user usage across all tagged hosts, including multipliers.
- **User speed limit**: The same cap for each user separately on each host. Their devices share the host cap; bandwidth is not pooled across hosts. 0 disables the tag’s per-user speed cap.
- **Device speed limit**: Each tag applies its device ceiling separately on this host. The strictest enabled limit applies.
- **Tag traffic multiplier**: For hosts using the tag multiplier. Recalculates the current period; subscription usage is unchanged.
- **Shared group speed**: One shared cap across all users and all tagged hosts.
- **Remark**: Connection name delivered in the subscription. Supported variables resolve when the response is generated.
- **Address**: Reachable IP/domain used by the client or panel in this form’s context; separate from the display name.
- **Port**: Port of the selected service. A host client port and node agent management port can differ.
- **Traffic limit per user**: Quota per user for this host or tag. The host form accepts GiB and stores bytes. Zero removes this quota.
- **Apply tag traffic quota**: Includes this host’s usage in the user’s shared tag quota. The host’s own quota still applies when disabled.
- **User speed limit**: Per-user host bandwidth shared by that user’s devices and connections. Measured in Mbps; zero removes this restriction.
- **Apply tag per-user speed**: Applies the tag’s per-user bandwidth limit to this host. Each participating host applies the limit separately.
- **Device speed limit**: Speed ceiling for one private device key on this host, in Mbps. All connections and both directions share it. Zero removes this cap; the user ceiling still applies. Requires compatible node and core.
- **Apply device speed limit from tags**: Apply tag device-key speed ceilings to this host independently of other inheritance switches.
- **Whole-host speed limit**: Total host or tag bandwidth shared by all users. A 100 Mbps limit is shared between concurrent connections.
- **Apply tag shared speed**: Includes the host in the tag’s total bandwidth limit, shared by participating connections.
- **Host traffic multiplier**: Usage multiplier: with a value of 2, transferring 1 GiB counts as 2 GiB. An empty host value inherits from tags.
- **Reset traffic every**: Number of days or months between usage resets for this quota. Select the unit beside the value. Zero disables automatic resets.
- **Automatic SNI and shortId regeneration**: SNI rotates through the pool, shortId is regenerated, nodes restart automatically
- **Available after subscription expires or is disabled**: Allows this host to be delivered for an expired or disabled subscription. Useful for a fallback connection; the host’s own restrictions are checked separately.
- **Unavailable during an active subscription**: Delivers the host only for inactive subscriptions. Enable “Always available” first; active subscriptions will not show this host.
- **Tags**: Object label array. Host tags also connect enabled policies; saving an empty array clears labels.
- **Internal Squads**: Squads granting user inbound access. On a host this is a separate squad include/exclude restriction.
- **Override SNI from address**: Uses the host address as SNI in client configuration. The address must suit the connection’s TLS/REALITY settings.
- **Keep SNI blank**: Keeps SNI empty in the generated client configuration instead of filling it automatically. Use when required by the transport configuration.
- **Hide host**: Hides the host from subscription output. Use host disabling or a traffic block to stop access using previously issued credentials.
- **Shuffle host**: Shuffles this host with other hosts that have the same option when generating a subscription.
- **Mapper**: Mapping/override configuration for the current template format. Inspect generated output after changes.
- **Mihomo X25519**: Compatible Mihomo REALITY key-scheme option; it does not rotate server keys automatically.

## Host overrides and rules

### TLS, transport and client

SNI specifies the TLS name; overrideSniFromAddress derives it from the address, and fingerprint configures client TLS. Host and path are transport fields. Certificate pinning, verifyPeerCertByName, Mihomo X25519 and IP version require compatible clients. Verify format support before transferring mux, sockopt, transport JSON overrides or serverDescription settings.

### Domain rules

OFF disables the additional filter. ALLOW_ONLY permits only listed destinations, while DENY blocks them. This is a host traffic policy rather than a User-Agent subscription delivery condition. Verify required DNS/service destinations and inbound isolation support.

### SNI and shortId rotation

Rotation uses the configured SNI pool and hourly interval; shortIds rotate when enabled. Form ranges are 1–8760 hours, 1–10 shortIds and length 4–16. Nodes apply updated settings and clients need a refreshed subscription. Do not enable rotation without a valid pool and compatible server configuration.

### Fields and controls

- **Traffic limit per user**: Quota per user for this host or tag. The host form accepts GiB and stores bytes. Zero removes this quota.
- **Apply tag traffic quota**: Includes this host’s usage in the user’s shared tag quota. The host’s own quota still applies when disabled.
- **User speed limit**: Per-user host bandwidth shared by that user’s devices and connections. Measured in Mbps; zero removes this restriction.
- **Apply tag per-user speed**: Applies the tag’s per-user bandwidth limit to this host. Each participating host applies the limit separately.
- **Device speed limit**: Speed ceiling for one private device key on this host, in Mbps. All connections and both directions share it. Zero removes this cap; the user ceiling still applies. Requires compatible node and core.
- **Apply device speed limit from tags**: Apply tag device-key speed ceilings to this host independently of other inheritance switches.
- **Whole-host speed limit**: Total host or tag bandwidth shared by all users. A 100 Mbps limit is shared between concurrent connections.
- **Apply tag shared speed**: Includes the host in the tag’s total bandwidth limit, shared by participating connections.
- **Host traffic multiplier**: Usage multiplier: with a value of 2, transferring 1 GiB counts as 2 GiB. An empty host value inherits from tags.
- **Reset traffic every**: Number of days or months between usage resets for this quota. Select the unit beside the value. Zero disables automatic resets.
- **Automatic SNI and shortId regeneration**: SNI rotates through the pool, shortId is regenerated, nodes restart automatically
- **Tags**: Object label array. Host tags also connect enabled policies; saving an empty array clears labels.
- **Internal Squads**: Squads granting user inbound access. On a host this is a separate squad include/exclude restriction.
- **Override SNI from address**: Uses the host address as SNI in client configuration. The address must suit the connection’s TLS/REALITY settings.
- **Keep SNI blank**: Keeps SNI empty in the generated client configuration instead of filling it automatically. Use when required by the transport configuration.
- **Hide host**: Hides the host from subscription output. Use host disabling or a traffic block to stop access using previously issued credentials.
- **Shuffle host**: Shuffles this host with other hosts that have the same option when generating a subscription.
- **Mapper**: Mapping/override configuration for the current template format. Inspect generated output after changes.
- **Mihomo X25519**: Compatible Mihomo REALITY key-scheme option; it does not rotate server keys automatically.

## Host tags and shared settings

### Tag and policy

A tag groups hosts but does not create a quota by itself: configure and save the tag settings. Each host independently opts into tag quota, per-user bandwidth and shared bandwidth. These switches are independent, and host-specific limits still apply alongside enabled tag limits.

### Bandwidth and multiplier

Tag quota combines a user’s usage across participating hosts. A tag per-user bandwidth cap applies independently on each participating host; shared tag bandwidth is shared across participating traffic. An explicit host multiplier controls accounting, while null selects tag inheritance; the host’s own quota then uses multiplier 1 as explained by the form.

### Persistent settings

Tag settings affect associated hosts with the corresponding quota, user-speed or shared-speed switch enabled. The device-speed inheritance switch is also independent. Check participating hosts and restrictions before saving. Open “Limits” for recipients and personal exceptions.

### Device speed from tags

A tag device ceiling applies independently on each host with “Apply device speed limit from tags” enabled. It is independent of tag quota, user speed and shared speed. The strictest applicable ceiling wins; 0 disables only the corresponding ceiling. Update node and core to support remnacust-device-speed-v1. An incompatible node cannot confirm the new limit. Across multiple bound nodes, the configured ceiling is conservatively divided so their sum cannot exceed it; spare capacity is not transferred between nodes. HWID enrolls a distinct private key. Copies of one key count as one device; applications without distinct keys cannot identify physical devices separately. Local rules remain active while the panel is unavailable.

### Speed by tag

A tag’s user speed sets the same cap separately on each participating host. Shared group speed is a separate pool for all participating traffic. Each host independently enables the tag quota, user speed and shared speed. When several restrictions apply, the stricter cap wins. 0 means no corresponding cap, not blocked traffic. Mbps already means megabits per second; 8 Mbps is approximately 1 MB/s before overhead.

### Fields and controls

- **User traffic quota**: Combined user usage across all tagged hosts, including multipliers.
- **User speed limit**: The same cap for each user separately on each host. Their devices share the host cap; bandwidth is not pooled across hosts. 0 disables the tag’s per-user speed cap.
- **Device speed limit**: Each tag applies its device ceiling separately on this host. The strictest enabled limit applies.
- **Tag traffic multiplier**: For hosts using the tag multiplier. Recalculates the current period; subscription usage is unchanged.
- **Shared group speed**: One shared cap across all users and all tagged hosts.
- **Traffic limit per user**: Quota per user for this host or tag. The host form accepts GiB and stores bytes. Zero removes this quota.
- **Apply tag traffic quota**: Includes this host’s usage in the user’s shared tag quota. The host’s own quota still applies when disabled.
- **User speed limit**: Per-user host bandwidth shared by that user’s devices and connections. Measured in Mbps; zero removes this restriction.
- **Apply tag per-user speed**: Applies the tag’s per-user bandwidth limit to this host. Each participating host applies the limit separately.
- **Device speed limit**: Speed ceiling for one private device key on this host, in Mbps. All connections and both directions share it. Zero removes this cap; the user ceiling still applies. Requires compatible node and core.
- **Apply device speed limit from tags**: Apply tag device-key speed ceilings to this host independently of other inheritance switches.
- **Whole-host speed limit**: Total host or tag bandwidth shared by all users. A 100 Mbps limit is shared between concurrent connections.
- **Apply tag shared speed**: Includes the host in the tag’s total bandwidth limit, shared by participating connections.
- **Host traffic multiplier**: Usage multiplier: with a value of 2, transferring 1 GiB counts as 2 GiB. An empty host value inherits from tags.
- **Reset traffic every**: Number of days or months between usage resets for this quota. Select the unit beside the value. Zero disables automatic resets.
- **Automatic SNI and shortId regeneration**: SNI rotates through the pool, shortId is regenerated, nodes restart automatically

## Subscription templates and editors

### Formats

Xray JSON, Mihomo, Stash, Singbox and Clash have separate templates. Choose a format/template and edit its structure. A client template is different from a server Xray profile. The generator inserts allowed hosts and user data; formats without protocol support may exclude incompatible hosts.

### Checking delivery

Create or select a template for the required format. When renaming it, choose a name not already used by another template of that format. If the name exists, the panel marks the field and explains the error while keeping your input. Before deleting a template, check subscription settings and external squads that use it. After editing, fetch a test user’s subscription and import it into the client: valid JSON or YAML does not verify a connection.

### Autoselect in code and UI

The Xray JSON Editing and Autoselect tabs share one draft. Editing an existing pool or balancer immediately updates its JSON. A new pool adds injectHosts, a balancer, routing and observation for leastPing or leastLoad. Other outbounds, rules and settings remain intact. The changes panel compares against the last save; on phones it appears below the form. Save publishes a valid draft; text with errors is saved on the server with warnings and remains available in history.

### Host pools and tags

selector.type supports uuids, exact tags, tagRegex, remarkRegex and sameTagAsRecipient. All support all/random/group; tag groups contain tags, other groups contain eligible host UUIDs. mode all injects all eligible sources, random selects at most selector.expected unique hosts, and group chooses one nonempty eligible group from selector.groups. Groups can be a named object or an array of arrays. Missing mode keeps legacy all; missing selectFrom selects hidden hosts. Access, visibility, limits and exclusions are checked before selection. Sampling occurs when a subscription is generated, not for each VPN connection. A profile with an explicit mode and no eligible sources is omitted.

### Assignment and balancing

In Where to use autoselect, choose a specific selection and its recipients. remnawave.assignments contains balancerTag, hosts and tags. Direct host assignment beats a tag match; an explicit template in the host card beats another template. Source pools remain limited by user access. Renaming or deleting a balancer updates its assignments. Legacy assignTo remains readable; choose its selection when editing. The card menu can duplicate any supported template format: settings, draft, tags and geofile references are preserved, while recipient assignments are cleared. Save remains available with code errors; invalid content stays a draft. Error paths identify the pool and reveal its field in code. The failed-probe fraction tolerance is between 0 and 1: 0.01 means 1%. Zero disables this check. A numeric value outside 0–1 is preserved in JSON; Xray clamps it internally when reading the configuration (for example, 2 becomes 1).

### History and recovery

Xray JSON, Singbox, Mihomo, Clash and Stash retain the last 30 saved versions. The database upgrade preserves existing code as the first version. History shows dates and a comparison with the current draft. Open in editor restores all code, including autoselect, balancers and assignments. Replacing an unsaved draft requires confirmation. Saving creates a new version, so a restore can itself be undone. An unsuccessful save changes neither code nor history.

### Autoselect in every editable format

Autoselect is available for Xray JSON, sing-box, Mihomo, Clash and Stash. sing-box uses urltest/selector; YAML clients use url-test/select/fallback/load-balance. Groups can filter UUIDs, tags or regex with all/random/group and source visibility. Access is checked before selection; an empty explicit pool never becomes DIRECT. Manual members remain intact. Group name and default route are separate controls. All tabs share a draft; an unsaved Xray test pool can be removed with its dependent balancer. Forms show Save and Discard draft; code tools appear only in Editing.

### Geofiles library

Ready-made datasets include published V2Fly and MetaCubeX GeoIP/GeoSite. Import uses the same HTTPS and content checks and never enables rules automatically. Use Click to upload for a local file. In Geofiles, upload from your computer or import a direct HTTPS URL, with a name and content format. Select a library item, attach it, select DAT categories and explicitly choose DIRECT, REJECT or a group. Multiple files and reuse across templates are supported. DAT becomes native rules on the server; sing-box JSON/SRS and Mihomo YAML/text use remote rule_set/rule-providers. Clash/Stash support YAML payload. Existing settings remain intact. Save the template and refresh the subscription to apply. File URLs are public: never upload secrets. Up to 32 files of 64 MiB, text up to 8 MiB; local addresses, archives and unrelated content are rejected. Preserve backups/geofiles when migrating: database-only backups exclude binary files. Historical versions may require reattachment after a file is deleted.

### Priority and backup servers

Priority: first available selects the first working server. For an exact order, choose Hosts and All selected hosts, then reorder them with the arrows. Multiple pool prefixes can also be reordered in the balancer. Tags and regex follow the main host list; random modes select a subset first. Failover and return to the primary follow health checks and affect new connections; existing connections are not migrated. Xray JSON is rendered as standard single-candidate leastPing balancers with a Loopback chain. Connections are blocked before the first successful probe and when every server is unavailable. An explicit fallbackTag is used last. Selecting priority in the GUI removes the generated fallback to the same pool and preserves custom fallbacks. Probe settings are preserved. Limits: 128 candidates per balancer and 256 per configuration. Routing scripts and conflicting broad selectors of other balancers are incompatible. Mihomo/Clash/Stash use native fallback in proxies order: explicit code members precede pool members. sing-box has no automatic strict priority mode in its configuration; selector is manual and URLTest uses latency. A full JSON/YAML subscription is required.

### Saving with warnings

Save remains available for invalid JSON/YAML, empty host selections and incomplete geofile actions. Text with errors is saved on the server as a draft and included in history; reopening restores the same text. Subscriptions keep the last working configuration. Fix the warnings and save again: valid content replaces the working version and clears the draft. Network and database failures are not reported as successful saves.

### Host selection and balancing in one card

Host sources and their strategy share one block. Pools using a shared balancer are grouped together; manual balancers remain visible. Deleting the block removes its sources, balancers and linked rules while retaining independent groups and manual outbounds. leastLoad.expected is the selected node count; tolerance is the allowed failed probe fraction from 0 to 1: 0.01 means 1%, and 2 does not mean two nodes. Xray clamps finite numeric values outside the range to 0–1; such templates apply with a warning while retaining the original number. New pools start with enabled hosts supported by the format, selected by UUID. With no eligible hosts, the setup remains a draft until sources are selected.

### When the app downloads geofiles

By default, GeoIP/GeoSite DAT is embedded in the full configuration as rules. The new switch downloads a converted rule set in supported apps; Xray JSON delivers a DAT bootstrap profile to Happ/INCY and inline rules to other clients. Native sing-box JSON/SRS and Mihomo/Clash/Stash YAML/text use the app format. A full JSON/YAML subscription is required; an individual VLESS link cannot carry routing. Client intervals and server auto downloads are configured separately, as explained below.

### Downloading geofiles to the client

New attachments have Download to client off: rules are embedded in the full subscription. Turn it on for a remote rule set. In either mode, choose DIRECT, REJECT (block), a configured group or proxy separately. Changing delivery preserves the action; new attachments default to DIRECT. The server converts DAT to sing-box JSON or Mihomo/Clash/Stash YAML. The client interval is 5 minutes–30 days, default one day, written as update_interval / interval. This is the app schedule; manual retries may bypass it. Embedded rules change after the subscription itself is updated. Legacy attachments without the field retain their behavior. For Xray JSON, Happ and INCY versions supporting subscription routing profiles receive signed DAT files and a routing header for the initial download. Files are bundled with isolated categories; actions remain in JSON. Other Xray clients receive inline rules. Manual routing or existing geosite/geoip settings are preserved. Oversized profiles or unavailable bundles fall back entirely to inline rules. The Happ interval controls a revision stamp on subscription refresh; the app controls actual downloads. INCY receives a separate geo interval in whole hours rounded up, minimum 1 hour; the local user override takes precedence. The shared profile uses the longest file interval. SHA-256 avoids re-downloading unchanged sets. Reconnect after updating. SRS remains a remote binary set; import its source JSON for inline delivery.

### Server auto downloads and update safety

Select a library file and configure its HTTPS source, automatic updates and server interval from 15 minutes to 30 days. Settings save immediately for every template using that file. URL imports retain their source; PC uploads need a source URL. Auto updates default to off. The scheduler checks once a minute; a persisted lease prevents concurrent duplicate downloads. Source failure, panel restart and manual retries do not reset the interval. Addresses, redirects, size, format and categories used by active templates are validated. Errors retain the last working copy; status and next check are shown in the library. Original hashed URLs remain immutable; Updatable links and signed URLs return the active version without immutable caching. Server and client schedules are separate, so changes need not reach clients immediately.

### Shared catalog and pool members

Ready-made datasets is one library for every template: PC uploads, URL imports and published sources. Import selects the entry without changing the template. Attach the file, choose categories and action, then save. Incompatible formats remain visible. Library deletion applies everywhere; detach files used by saved templates and save first. An unsaved attachment in the current editor is removed with the file. Pool members select connections; recipients of the entire template are separate optional settings below the code editor. The pool count excludes disabled hosts, duplicates and XRAY_JSON exclusions; user access and random selection can reduce the result. With legacy host naming, target the balancer rather than an unused prefix.

### If Happ does not download the file

V2Fly DAT is supported. A full JSON subscription with a routing header is required. For the regular subscription URL, enable “Serve JSON at base subscription” in subscription settings, or use a URL ending in /json. Response rules and external squads can override the format. Save the switch in the template actually used: a template selected in the host card takes priority. The editor shows the global JSON setting and opens settings in a new tab, keeping the draft. After saving, refresh the subscription in the app. Update the panel and a separately installed subscription page. In 1.1.7.51 compact category names reduce profile size; old signed URLs remain supported. Refresh the subscription and reconnect. If downloading does not start, check the Remnacust profile, x-remnacust-geofiles-delivery header and app logs. Incompatible settings or size limits trigger inline rules instead of a separate download.

### INCY geofile checks

INCY receives stable DAT URLs without query parameters. The signed file selection is in the path, so appending .sha256 to the complete URL returns the checksum for the same bundle. Unchanged files can be checked without downloading them again. routing-geo-update-interval uses hours. Update a separately deployed subscription page together with the panel. Turning downloads off replaces the old provider profile with empty geofile URLs and disables periodic checks; the JSON keeps the embedded rules. Previously issued URLs remain supported. Scheduling and network-error retries depend on the client version; the server does not start the tunnel. Official protocol: https://docs.incy.cc/routing/

### Pool membership after switching

Switching grouped selection to connection-time selection merges UUID and tag groups into values. Regex and recipient-tag selectors retain their UUID boundary in groups: the original filter and user access both apply. Edit these lists in the GUI or code; unrelated hosts are excluded. Switching a manual client group to automatic selection sets its probe URL and interval.

### Selection at connection time

Source pools and recipients are separate settings. Each remnawave.assignments entry binds a specific balancerTag to recipient hosts or tags. A direct host assignment takes precedence over a tag assignment. An explicit template in the host card remains highest priority; that template uses the balancer assigned to this recipient. DIRECT, REJECT and domain restrictions are preserved. all delivers every authorized source; the client strategy chooses a server for each new connection. random/group reduce membership when subscriptions refresh. Membership changes arrive on subscription refresh. A separate TCP entry for server changes is no longer created.

## Variables {{…}} in names and headers

### Substitution context

Variables are resolved when a subscription response is built for a particular user. Use supported names exactly: case and suffix matter. System values, dates, usage and quota describe response generation time, not continuously updating fields inside an already imported client file.

### Host and tag traffic

{{TRAFFICLOCATIONUSEDGB}}, {{TRAFFICLOCATIONUSEDMB}} and corresponding LIMIT/LEFT variants return numeric values without units. Add GB/MB yourself if desired. Without TEG the context is the current host. TEG variants use tag context and fall back to the host when no tag is assigned. RESETAT describes reset time rather than bytes. The exact supported variable catalog is listed below.

### Example

`DE · {{TRAFFICLOCATIONLEFTGBTEG}} GB` displays remaining tag-context quota. `{{TRAFFICLOCATIONUSEDMB}} MB` displays host usage. Subscription quota and location quota are distinct; choose the variable matching the desired counter.

## Global subscription settings

### Delivery and headers

Settings control response headers, subscription name/description, update interval, support links and default templates. Headers are delivered with a request and their presentation depends on the client. Custom remarks provide understandable entries for account states. External squads may override global delivery.

### HWID and actions

Global HWID rules and fallback values live here; user-specific settings remain on the account. Delivered actions/buttons require compatible clients and do not replace administrator authorization. Test responses for active, disabled, expired and quota-limited accounts.

### Remark order

Open Subscription settings → the remarks card. Use the up and down arrows to move notification reasons, save the settings, then refresh the subscription in the client. The default order is Subscription expired, Subscription disabled, New devices denied, and Device blocked (HWID). Only messages for applicable reasons are shown. Each reason’s text is edited separately in this card.

When combining subscription status and HWID is enabled, an expired or disabled subscription together with a blocked device produces both message groups in the chosen order. For example, expiry appears before the device block by default; moving HWID above expiry reverses them. With combining disabled, the subscription status message takes priority; an active subscription shows the device block message.

New devices denied is handled separately. If registration is denied for a new device and its subscription is also expired or disabled, the reason placed higher in the list is shown. Moving registration denial above expiry therefore shows the registration message. These two reasons are not combined. An already registered, allowed device keeps access when the other access conditions are met.

Traffic quota exhaustion, the maximum device count and missing HWID support have separate messages outside this list. Reordering changes subscription messages; restrictions and access checks still apply. Presentation depends on the client.

### Pages on this server

The Subscription pages tab manages registered instances on the panel server: start, stop, restart and independent update. Installer 1.2.93 and its local control service are required. CLI commands: install-subscription-page, upgrade-subscription-page --page-id ID, and manage-subscription-page; the list shows IDs. A local panel uses a separate restricted token and Docker network. A remote panel requires HTTPS and a subscription-page API token. Page ports bind to loopback; use a separate Caddy on free HTTPS ports or your existing proxy. Updates preserve settings and stopped state; failed readiness rolls Compose back. Private operation logs: /opt/remnacust/logs/page-<id>.log. Browser requests cannot supply arbitrary commands, paths or images.

### Fields and controls

- **Additional options**: Configure additional subscription options
- **Serve JSON at base subscription**: Selects JSON output for the base subscription URL. Check it in the application that will import that URL.
- **Randomize hosts**: Enables random host ordering in subscription output. The order can change on the next refresh.
- **Show custom remarks**: Shows configured subscription status messages, such as expiry or exhausted quota notices.
- **HWID settings**: Carefully review the documentation before enabling the HWID feature. Not all client applications support this feature.
- **Fallback device limit**: Device limit for users without an individual limit. For example, 3 allows up to three registered devices; 0 removes the count limit.
- **Max devices announce**: Device-count announcement sent to a compatible app with the subscription. An empty value leaves the announcement unset.
- **Response headers**: Headers that will be sent with the subscription content.

## Subscription response rules

### Conditions and order

Rules choose a subscription response from request conditions, such as the app name in the User-Agent header. Add a rule, set its conditions and response format or template, then enable it. Rule order affects response selection. The app list is built from positive conditions in enabled rules; an app missing from that list is not necessarily blocked.

### Responses and testing

Open the matching test and supply the same headers as the client. Check the selected rule and result: a configuration, rejection, HTTP 404/451 or closed connection. If the result is wrong, review rule order and condition operators, then test again. After saving, refresh the subscription in the app itself; a browser may receive a different response.

## Subscription pages

### Page configurations

A configuration defines subscription page presentation and content, including text, applications, instructions and supported options. Create variants and assign them using the supported user/external-squad settings. It is neither a server profile nor an independent traffic limit.

### Delivery

After saving, open a test user’s subscription page. Check the chosen variant, language, application links and mobile layout. The subscription link gives access to the user’s data; share it only with its owner.

### Fields and controls

- **Subpage editor**: Edit your subscription page configuration
- **Meta title**: Subscription page title used in browser tabs and shared link previews.
- **Meta description**: Short description of the subscription page used in link previews.
- **Brand title**: Name displayed on the subscription page. Check it in the chosen page configuration.
- **Logo URL**: Subscription page logo image URL. The user must be able to load the image without signing into the administration panel.
- **Support URL**: Support link on the subscription page. Enter the working address of the support service for your users.
- **Subscription info block design**: Display style for subscription details such as expiry, status and usage.
- **Installation guides design**: Display style for application installation instructions on the subscription page.
- **Icon key**: Only latin characters, no spaces
- **Full import**: Replace entire config with imported one
- **Import SVG library**: Merge {{0}} icons into your collection ({{1}} existing)
- **Import platforms**: Replaces platforms, locales, translations + merges SVG library
- **Import base translations**: Replace base translation and locales

## Limits: scopes and user table

### Displayed scopes

Select an individual host or a tag grouping hosts under a shared quota. The page shows scopes with a quota, speed restriction or block. Scopes without restrictions or a block are hidden.

### Columns

Compare usage, effective quota, remaining traffic, one-time bonus and access status in the table. A 100 GiB base quota plus a 20 GiB bonus provides 120 GiB; after 80 GiB of accounted usage, 40 GiB remains. Unlimited removes the personal quota in the selected scope, but usage is still counted. It does not override a traffic pause, subscription expiration or other user restrictions.

### Search and state

Search by username, identifier, email or Telegram ID. Use status, availability and squad filters, sorting and page size. “Traffic blocked: N of M recipients” refers to the selected recipient mode, not only visible rows.

### When the panel is unavailable

Compatible nodes use quota reserves allocated in advance. While the panel is unavailable, connections can use the remaining local reserve; a new reserve requires connectivity. Exhausting it does not grant unlimited access. A reset applies immediately to reachable nodes; others receive it when reconnecting. While an unreachable node spends its old reserve, total usage can temporarily exceed the new quota. Speed caps and other local rules remain active.

## Granting, resetting, blocking and unblocking

### Add traffic and reset usage

Adding traffic grants a one-time addition to an existing positive quota for the selected host or tag. Resetting restarts the current period’s usage counter while retaining historical statistics. It does not revoke a personal unlimited allowance.

### Blocking and unblocking

Blocking pauses traffic for the selected host or tag and recipients. Unblocking removes that pause. It does not extend a subscription, enable a disabled user or add traffic. A block affecting the entire scope and a personal user block apply together.

### Selecting recipients

For one user, select only their row. A bulk action can target selected users, all current recipients with access or members of a chosen squad. Search and pagination do not restrict “All” or “Squad” mode. Check the mode and recipient count before confirming. If the result is unclear, refresh the table before granting more traffic.

## Personal and bulk unlimited quota

### Grant and revoke

Grant unlimited saves a personal exemption for the selected host/tag. It persists until explicitly revoked, across restarts and period changes. Scope settings remain unchanged. Revoke unlimited restores the current base quota with existing bonus allowance. To grant it to one person, select only that user.

### Boundaries

Unlimited exempts only that scope’s quota. Pauses, bandwidth caps, expiry, status, HWID and other scopes still apply; usage remains recorded. Bulk grants target current recipients; future users and future squad members do not inherit them.

## Periods, multipliers and bandwidth

### Distinct restrictions

A user quota is data volume. Host per-user bandwidth caps one user, while shared bandwidth is a common cap. The multiplier changes charged volume rather than connection speed. Applicable restrictions operate together; unlimited status in one quota does not disable the others.

### Period reset

Host/tag reset intervals use days or months; 0 means no automatic reset. The quota window uses the saved configuration anchor date. Changing a multiplier recalculates current scope accounting under policy rules without changing ordinary subscription usage. Inspect current allowance, bonus and usage before changing a period.

### Fields and controls

- **Traffic limit per user**: Quota per user for this host or tag. The host form accepts GiB and stores bytes. Zero removes this quota.
- **Apply tag traffic quota**: Includes this host’s usage in the user’s shared tag quota. The host’s own quota still applies when disabled.
- **User speed limit**: Per-user host bandwidth shared by that user’s devices and connections. Measured in Mbps; zero removes this restriction.
- **Apply tag per-user speed**: Applies the tag’s per-user bandwidth limit to this host. Each participating host applies the limit separately.
- **Device speed limit**: Speed ceiling for one private device key on this host, in Mbps. All connections and both directions share it. Zero removes this cap; the user ceiling still applies. Requires compatible node and core.
- **Apply device speed limit from tags**: Apply tag device-key speed ceilings to this host independently of other inheritance switches.
- **Whole-host speed limit**: Total host or tag bandwidth shared by all users. A 100 Mbps limit is shared between concurrent connections.
- **Apply tag shared speed**: Includes the host in the tag’s total bandwidth limit, shared by participating connections.
- **Host traffic multiplier**: Usage multiplier: with a value of 2, transferring 1 GiB counts as 2 GiB. An empty host value inherits from tags.
- **Reset traffic every**: Number of days or months between usage resets for this quota. Select the unit beside the value. Zero disables automatic resets.
- **Automatic SNI and shortId regeneration**: SNI rotates through the pool, shortId is regenerated, nodes restart automatically

## HWID inspector

### Device overview

The inspector aggregates devices, applications and platforms, with distributions and user lists. It describes registered data; incompatible clients may supply no HWID. Search and filters locate entries; account-specific management is available in the user card.

### Interpretation

OS and application names come from client headers and are not guaranteed hardware identity. Missing device records do not prove there are no connections. Use the dedicated HWID blocking action and verify ownership.

## Subscription request history

### What is recorded

History shows subscription fetches, with user, time, address, client headers and outcome where recorded. These are configuration requests, not all internet traffic through the proxy. The user card opens account history; the global inspector helps compare requests and diagnose delivery.

### Empty history

Check whether the client fetched its subscription and whether SRH recording or retention is disabled. Client caching may reduce requests. A fetch record alone does not confirm successful proxy connection after import.

## Active connections and dropping sessions

### Collecting state

Choose a user or node and collect connections. Some operations create a job whose result is fetched afterward; the list is not an instantaneous snapshot of the entire infrastructure. Search supports username, ID, IP and node. The Recording tab accepts 1–10080 minutes and a 10–300 second interval. Recording continues on the server when the tab closes. JSON contains users, current subscription links, IPs, nodes and observation times; store it privately. Up to 20 recordings are retained for 3 days after completion. Recording stops with a warning at 20,000 user/node/IP combinations. Offline nodes and failed polls are reported separately. Short connections between polls may be missed. The available node count is shown before starting. The node list is reloaded before every scan; no separate refresh button is needed. Loading errors, empty lists and disconnected nodes have separate explanations. Start scan also retries loading after an error or an empty list. IP observation does not require NET_ADMIN. Update the node and wait for the panel to apply its configuration to enable observation. Personal device and host sessions are grouped by owner. A failed poll is not a successful empty response; partial results show failed polls and unknown Xray identities.

### Dropping connections

Drop connections closes current sessions for the selected target. It does not disable the account: an allowed client can reconnect. For persistent denial use account status, HWID blocking or the relevant quota scope pause. Collect another snapshot after dropping sessions.

### Node permissions

Reading active-connection IPs through Xray does not require NET_ADMIN. Additional Linux features on the node use it. Node installation and updates ask about it separately when it cannot be confirmed in the running container. An already effective capability is kept without another prompt. For automation, use --net-admin or --no-net-admin; a cap_add entry in an old Compose file alone does not prove the capability is effective.

## HTTP statistics

### Purpose

The page displays HTTP request statistics collected by the server, helping identify busy routes and errors. These are panel metrics rather than node usage or a list of user browsing destinations. Review filters and time range before comparing results.

### Missing or old data

Disabled collection or a server restart may leave no data or a short history. Refresh updates the display but cannot reconstruct statistics that were never collected.

## Torrent restrictions and reports

### Policy and reports

The feature requires the corresponding node mechanism/plugin and account settings. The user card switch sets policy; reports show recorded events. No reports do not prove there were no attempts if collection or the plugin is unavailable.

### Verification

Check plugin assignment, synchronization and the report range. Torrent restrictions are separate from disabling the entire account or deleting HWID registrations.

## User traffic paths

### Access relationships

Choose a user and host to inspect linked profiles, nodes, inbounds, outbounds and applicable rules. Filters highlight available, disabled, hidden or quota-limited hosts.

### Model limitations

The diagram is built from panel configuration rather than tracing each packet. Actual behavior depends on DNS, core routing, destination availability and node health. Use logs and active sessions to investigate a real failure.

## Backups

### Access and files

A fresh panel installation asks for a backup password; Enter generates one automatically. The installer shows it when installation finishes and saves it in `backup-password.txt` in the panel directory, accessible only to root. Keep a copy away from the server. Administrators unlock this section with that password. Click “Create ZIP backup” and wait for the file to appear. The encrypted archive contains a database dump and requires its password to open. Download it to separate storage. Sending transfers the selected file to Telegram, deleting removes it from the server, and “Lock access” locks the section again. The database backup excludes the server’s .env, certificates and node files. There is no restore button in the panel; restoration is performed by the server administrator. The ZIP uses AES. After extraction, database.dump is still a compressed PostgreSQL custom dump, without additional encryption. It is not readable in a text editor. Convert to SQL without restoring a database: `pg_restore --file=database.sql database.dump`. Use PostgreSQL tools of the same major version as pg_dump or newer.

### Automatic creation

Enable automatic backups, select a period from 1 to 168 hours and retention from 1 to 7 days, then save. Disabling automation stops new scheduled backups; older files continue to expire according to the retention setting.

### Telegram delivery

For automatic delivery, enable it and enter the bot token and chat or group ID. Save the settings and check that a backup arrives. If creation or delivery fails, read the panel’s error message; server configuration is handled by the installation administrator.

### Fields and controls

- **Backups**: Encrypted database backups
- **Backups**: Password-protected ZIP backups of the panel database. Scheduled copies can be sent to Telegram.
- **Legacy backups**: Convert to encrypted ZIP
- **Automation**: Periodic database dumps and Telegram delivery
- **Interval, hours**: Scheduled backup interval in hours: 1–168; used only when scheduling is enabled.
- **Keep backups, days (1–7)**: Backup retention in days: 1–7. Age-based cleanup runs even when scheduled creation is off.
- **Send to Telegram**: Enables scheduled backup delivery to separately configured Telegram, not general panel notifications.
- **Bot token**: Backup-delivery bot token, a secret distinct from the panel API token.
- **Chat/Group ID**: Backup recipient chat; the bot must have access.

## Login, terms and administrator sessions

### Sign-in methods

Settings support password, configured OAuth2 providers and passkeys. Enable only configured methods; changing a login button does not configure the provider automatically. Passkeys require a compatible browser/device. Administrator sessions and API tokens serve different purposes.

### Terms and sign-out

Until panel terms are accepted, navigation to other pages returns to Home. Sign-out ends the current administrator session; revoking an admin session does not disable every subscription user. Do not disable the only working sign-in method without another verified method.

### Fields and controls

- **Authentication methods**: Manage your authentication methods.
- **Frontend domain**: Passkey relying-party domain without https:// or a path, for example panel.example.com. Configure it together with origin.
- **Backend domain**: Full HTTPS panel origin for WebAuthn, for example https://panel.example.com. It must match the origin opened in the browser.

## API tokens and permissions

### Creating and editing

Create a separate token for each integration in settings. Specify a clear name, expiry and required permissions. Save after changing permissions. Deleting a token or reaching its expiry stops the integration’s access.

### Choosing permissions

Grant access only to the required sections and actions. Read access retrieves data; write access permits the allowed changes. Access to all operations does not unlock administrative actions unavailable to API tokens. Granting unlimited traffic requires the corresponding permission. Exact methods and permissions are listed in the separate API reference.

### Token handling

Share the token only with a trusted integration. If exposed, delete it and create a replacement. The token name helps identify which service uses the access. Access for individual customers is managed by the integration itself.

### Fields and controls

- **API tokens**: Manage your API access tokens for programmatic access.

## Language and appearance

### Interface preferences

Choose the panel language and a comfortable appearance: light or dark theme, accent color, font, density and navigation style. These settings change the interface presentation.

### Reducing motion

Enable “Reduce motion” if you prefer a calmer interface. The panel also respects the equivalent device setting.

### Updating from the panel

When a new version is available, the header version number uses the theme accent color. Click it to find Update below the support and GitHub buttons. For an older installation, run upgrade-panel with the new installer once to configure the update service.

Starting an update blocks all open panel sessions. The installer checks the release, backs up the database and updates the applications while preserving keys, volumes and Compose settings. Nodes and existing Nginx/Caddy are not updated. Closing the browser does not stop the operation. After the applications restart, the page reloads. If the update fails, read the message and check panel-update-<identifier>.log in the installer logs directory before retrying.

The update dialog shows the current stage out of eight, stage completion percentage, elapsed time and stages after the current one. The journal contains the 24 most recent step events and can be downloaded as JSON; full technical output remains in a private server file. Remaining time is estimated from a previous successful update, or remaining stages are shown when no history exists. During an API restart the dialog retains the last confirmed progress until reconnection; expected PANEL_UPDATING errors do not create notifications.

### Launcher and appearance reset

In theme settings, Launcher is grouped with the compact interface and reduced motion switches. It shows or hides the floating quick navigation window. Enable it, open quick link settings and choose the sections you need. Your selection and window position are saved in this browser.

Reset at the bottom restores the default theme, accent, font, density and motion setting. The launcher switch keeps its value; turn the window off separately when needed.

## Notifications

### Panel events

The server administrator configures general user, node and service notifications in the installation settings: enable delivery, set the bot token and choose chats for each event type. The panel has no separate form covering all these parameters. Automatic backup delivery is configured separately on the Backups page and can use a different bot.

### Checking delivery

After changing settings, verify that notifications arrive. If messages are missing, check the token, recipient and the bot’s access to the chat. Report delivery failures to the administrator with the event time and panel message.

## Troubleshooting

### Unable to save

Read the panel message and check required fields. Sign in again if your session has expired. Contact the administrator if access is denied. If the error persists, record its text, time and the action you were taking for support.

### Connection does not work

1. Check user status and subscription expiry.
2. Check the overall quota, host or tag limits and device restrictions.
3. Ensure the internal squad permits the required inbound.
4. Check node health, profile, host and logs.
5. Refresh the subscription in the client and retry the connection.
If a bulk operation’s result is unclear, check recipient state before repeating it.

## Variable formatting and units

### Arguments and Base64

Arguments follow a colon and use | separators: `{{NEXT_TRAFFIC_RESET_AT:format=DD.MM.YYYY HH:mm}}`, `{{STATUS:ACTIVE=Active|DISABLED=Disabled|EXPIRED=Expired|LIMITED=Limited}}`. RESET_STRATEGY accepts NO_RESET, DAY, WEEK, MONTH and MONTH_ROLLING labels. `rwEncodeBase64:` encodes the rendered string and adds `base64:`. An unknown variable remains literal text.

### Numbers, infinity and context

LOCATION MB/GB variants use base 1024, up to three decimal places and no unit; unlimited LIMIT/LEFT returns ∞. Ordinary TRAFFIC_USED_MB/GB and TOTAL_TRAFFIC_MB/GB include units. Without a current host, LOCATION headers can return a deduplicated semicolon-separated name: value list. Multiple tags can also produce a TEG list. LOCATION RESETAT dates use UTC.

### Time values

UNIX values are seconds, not milliseconds. Missing LAST_TRAFFIC_RESET_AT_UNIX/NEXT_TRAFFIC_RESET_AT_UNIX is 0; formatted variants are empty. DAYS_LEFT is clamped at zero. Ordinary TRAFFIC_LEFT for an unlimited subscription is 0 according to the counter rules, not ∞; it differs from LOCATION LEFT.

## Understanding online counts

### Connections and unique users

Online on nodes sums connections across nodes; one account connected to two nodes can appear twice. Online users counts unique accounts, so the cards may differ while the system is healthy. See the [Remnawave quick start](https://docs.rw/learn-en/quick-start/).

### Traffic comparison

The Today card compares its current measurement period against a previous period; node reports update the values. Zero on a new panel does not by itself prove a fault. Check the measurement time, period and a real client connection.

## Password, Passkey and OAuth2

### Password and session

Administrators sign in on the login page. After changing authentication, verify a working sign-in in another session and recovery access. The official [quick start](https://docs.rw/learn-en/quick-start/) describes a Rescue CLI for lost passwords; check container names for your installation.

### Passkey

A passkey is registered for an administrator device/browser and can be viewed or removed in Settings. Registration and login are separate operations; adding a key does not automatically disable another login method. WebAuthn requires the correct panel domain and HTTPS.

### OAuth2

Configure the Client ID, Client Secret and redirect URI with the selected provider. For Generic OAuth2, set the authorization and token endpoints, panel domain and exact issuer from the provider’s OpenID Connect configuration. The issuer can include a path; its trailing / matters too. The panel compares it with the ID token’s iss and rejects a response from another issuer. When upgrading an existing configuration, fill in this field before signing in through Generic OAuth2 again. Keep a working login method until you have tested the new one in a separate session. Administrator OAuth2 login and API tokens are configured separately.

## What happens when a subscription is opened

### One URL, different responses

A user opens the subscription link in a browser or adds it to an app. A browser may receive an instruction page while an app receives a configuration in the selected format. The panel considers request headers and response rules. If the app receives no connections, find its request in request history and check the response format, user status and HWID.

### Generation pipeline

A host defines a connection entry point and maps to one inbound. A template selects the configuration format, response rules choose delivery behavior, subscription settings add metadata, and an external squad can override templates and settings. Troubleshoot each stage separately.

## Client formats and templates

### Format families

Templates are separated by client family, including Mihomo, Xray JSON, sing-box and Base64 fallback. Select the template for the actual client; a server inbound does not guarantee that every client generator represents its transport. Check rendered JSON and generator support for new core features.

### External squads and response rules

An external squad can override a template for a group. Response rules select how subscription output is generated from request conditions. After edits, inspect one user’s request history and the actual client output. The [official overview](https://docs.rw/learn-en/quick-start/) separates templates and delivery rules.

## Support the project

### Addresses and networks

Open “Support the project” in the additional options menu. The page lists Gram on TON, Solana, TRC20 on TRON, Litecoin, Ethereum and Bitcoin addresses. Find the required network in the list and click Copy. Check the full address in your wallet before sending; the currency and network must match the selected network.

### How the page works

Copy places the address on the clipboard. The panel does not connect a wallet, sign or send a transfer, charge funds or create a subscription. The Telegram link opens contact with the project author for questions and suggestions.
