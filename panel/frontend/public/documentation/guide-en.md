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

### A day without the panel

Autonomous policy does not stop merely because the panel is unreachable. A planned day requires an applied policy, persistent volumes, valid credentials and enough local credit for every user, host and tag limit. A user’s total remaining quota is distributed across nodes and is not the credit of each node. Subscription expiry, exhausted credit and quota-period boundaries still deny access. The panel must fund the next period after a reset; the current implementation does not fund it offline. CDN, DNS, proxy and node certificates must remain independent. Recreating a container requires persistent state directories. A core loaded through CUSTOM_CORE_URL also needs its source to be reachable. Blocks or freezes changed during the outage arrive after reconnection. A maintenance readiness check proves current state, not a guaranteed day of traffic.

### Maintenance logs

Installer logs are under /opt/remnacust/logs/: installer-panel.log, installer-node.log and installer-subscription-page.log. A failed operation shows its log path. The next action for the same component may replace its previous log, so save the file beforehand. Panel updates also retain panel-update-<ID>.log; SSH node maintenance retains node-maintenance.log on the node. Restrict log access. Before sharing logs with support, remove passwords, tokens, personal links and addresses. Complete package-maintenance prompts in an interactive SSH session; reboot the server separately when needed.

### Nodes while the panel is offline

A node with a confirmed autonomous policy continues serving saved keys without the panel, including XHTTP through a CDN pointing directly at the node. Access expiry, quotas, speeds and rules remain enforced locally. Exhausted credit or expiry still denies access. New users, renewals and blocks arrive after reconnection. Before stopping applications, the installer checks node autonomy. Unconfirmed readiness produces a warning and the update continues without an extra flag. Panel-dependent nodes may temporarily lose connectivity. Legacy policy without local reserves expires after 90 seconds; simply disabling that deadline is unsafe. Manual docker compose down bypasses the check and also stops a node or proxy in the same project.

### Update progress and logs

Panel updates show eight stages, elapsed time and the last 24 events. Remaining time is estimated only when a previous operation supplies timing data; otherwise remaining stages are shown. Closing the tab does not cancel the update. The service pins a fresh installer release before checking and installing it; a newer verified panel may supersede an outdated notification target. Successful updates keep current, previous and container-used images while removing redundant component images. The panel does not receive the Docker socket.

### Browser refresh after an update

After an update, open tabs check the panel version and reload once the current action finishes. Saved users, settings and templates remain on the server. An older tab may need a manual refresh.

Before maintenance, save editor text or a separate copy. If local draft recovery is available, open History → Unsaved draft and review the content before applying it. Recovery is never applied without your choice. Unsaved text is not a backup.

### Operating system and database

The installer supports Ubuntu 22.04/24.04/26.04 LTS and Debian 12/13 on amd64/arm64. Prebuilt-image installation needs Docker Engine and Compose v2; host Node.js and Go are unnecessary. Check the requirements of the installer release you select.

Panel upgrades preserve the existing database and volume. For new installations, choose a supported PostgreSQL major version with current fixes. PostgreSQL 14 reached its scheduled end of support on November 12, 2026. Changing the database major version requires a separate pg_upgrade or dump/restore verified on a copy. Do not open an old volume with an image of another major version.

### Template freshness

After saving a template, fetch a test user’s subscription and check it in the app. A profile already imported into an app needs its own subscription refresh. If an old configuration remains, check that the changes were applied, the intended template is selected and the client refreshed the subscription. A failed save keeps the last working version active. Do not clear the database or shared cache merely to refresh one subscription.

### Storage and subscription speed

The panel needs reliable storage with enough free space and read/write capacity. Network-backed block storage can be used when it provides durable reads and writes. Slow storage is especially noticeable after startup and when many subscriptions refresh together. Compare subscription response time, disk load, CPU and memory. If the slowdown persists, inspect the panel log. Do not clear the live database or disable durable writes to improve speed.

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

### Refreshing Home

The Home refresh button requests user statistics, traffic and panel status again. Wait for loading to finish before refreshing again. An unavailable metric does not mean zero. If data does not appear, check panel availability and the error log.

## Creating and editing users

### Identity and contacts

The username identifies an account. Email, Telegram ID, description and tag help with searching and grouping. Internal squads determine connection access.

### Access and quota

Set status, expiry, subscription traffic quota, reset strategy, internal squads and optionally an external squad. A subscription quota of 0 is unlimited. Host and tag quotas remain independent. The field reference below uses the exact names and help text from the current form.

### Saving

Before saving, check squads and subscription expiry. Then verify the status and date in the detail view. A subscription ends at the specified time; the date indicator’s color does not change the expiry.

### How expiry is checked

The panel checks subscription expiry automatically every 30 seconds. Overdue ACTIVE and LIMITED accounts become EXPIRED, then the access change is sent to nodes. No additional server schedule is required. Stopped panel services or a disconnected node can delay the state update. FROZEN preserves remaining lifetime; activation resumes the countdown from that remainder. Resetting traffic does not unfreeze the account.

### Freeze a subscription

Choose Freeze in the user menu, enter the new Automatic resume date and time, then Save. The status does not change before saving. The saved deadline becomes read-only and cannot be changed for that freeze. Frozen user indicators and dates are blue.

Freezing preserves the remaining subscription lifetime. With two days remaining and a resume date tomorrow, two days remain after resuming. A running panel checks scheduled resumes every five seconds. After a restart, overdue work catches up; expiry is based on the scheduled resume time, so panel downtime does not add time. Nodes apply access after receiving the update. Exhausted lifetime and quota continue to restrict access. Extending a frozen subscription adds lifetime without changing its resume deadline.

Bulk freezing uses the selected deadline while retaining saved deadlines of already frozen users. Legacy freezes without a deadline are not silently activated: open the user and assign a future date once. New frozen users created through the API or import also need a future frozenUntil with a UTC offset. Saving does not confirm immediate termination of connections on an unreachable node.

### Device subscription preview

Choose the format and User-Agent in an already registered device card, then generate a preview. It follows delivery rules without changing the device or connection history. A blocked device receives no working access. The host list shows candidates; the final selection depends on the format and pool. Configuration containing keys is hidden by default and available on explicit request, up to 2 MiB. Keep it private.

### Fields and controls

- **Status**: ACTIVE means active, DISABLED disabled, EXPIRED expired, LIMITED quota exhausted, and FROZEN pauses access while retaining the remaining subscription lifetime until resumption. Expired accounts freeze with zero remaining time; the expiry cannot be edited while frozen. Connecting requires valid lifetime, traffic and host access.
- **Expiry date**: Subscription expiry date and time. Choose a future date for a valid subscription and use the time zone shown in the form.
- **Telegram ID**: Numeric user Telegram ID, distinct from a username or backup-delivery chat ID.
- **Email**: User contact/search field; it does not grant inbound access.
- **Description**: An administrator description of the record, such as service terms or a note about its settings.
- **Traffic limit**: Subscription quota in bytes; 0 means unlimited. The form displays units separately. Host/tag limits remain independent.
- **Traffic reset strategy**: Overall user quota reset strategy: no reset, day, week, calendar month or rolling month. Host and tag periods are configured in their own settings.
- **External squad**: External squad with its own subscription delivery settings. Select it when the user needs that group’s template or subscription page.
- **Expiry date**: The lifetime and access are paused. The saved remainder resumes on activation. The date cannot be edited while frozen.
- **Internal squads**: Internal squads granting the user access to selected inbounds. Multiple squads can be assigned.
- **Subscription domain**: UUID of a registered primary or CDN domain. Empty uses the default domain.
- **Automatic resume**: The subscription resumes automatically at this time. The saved freeze deadline cannot be edited.
- **Automatic resume**: Choose a date and time. The freeze deadline cannot be edited after saving; the remaining subscription lifetime is preserved.
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

- **Status**: ACTIVE means active, DISABLED disabled, EXPIRED expired, LIMITED quota exhausted, and FROZEN pauses access while retaining the remaining subscription lifetime until resumption. Expired accounts freeze with zero remaining time; the expiry cannot be edited while frozen. Connecting requires valid lifetime, traffic and host access.
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

Deleting a device removes its registration: the same app can register again if new devices are allowed. To prevent access, block it instead: the record remains and that device’s access is revoked. Unblocking removes the ban. Remaining time uses day counts rather than rounded months; a partial remaining day counts as one day. Freezing pauses the remaining lifetime; repeating it does not add time. Activation resumes the saved remainder. The status and its application task are saved together. An unavailable node does not undo the saved status: application retries automatically, including after a panel restart. Saving does not confirm that all connections have stopped immediately. The frozen date is blue and cannot be edited. Expired dates are red; dates within three days are yellow. “Delete all unblocked” clears allowed registrations while keeping blocked device records. Blocking and unblocking are saved atomically with an application job. Nodes apply the change in the background and retry failures. A successful save does not confirm an immediate change to existing connections. Device subscription preview is collapsed by default. Clear cancels the request and removes its result; closing the section removes the preview.

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

On Hosts and Nodes, Ctrl+F, Cmd+F on macOS and F3 open panel search instead of browser find. Search works in card and table views and from ordinary form fields. Monaco keeps its own editor search. The override is removed when leaving these pages.

### IP addresses and rescanning

The compact IP list accepts IPv4, IPv6 and hostnames. The purple Panel badge marks the first enabled address, preferred for node management in list order. Each toggle permits the panel to use that address; arrows change priority. Saved manual addresses can be disabled or reordered. To correct one, add a new address and disable the old one: ordinary editing keeps saved rows.

With Node 1.1.38, assigned IPv4 and IPv6 addresses are discovered when the panel first receives successful node information. While the node is available, new IPs are then appended no more often than once every 30 minutes after the last successful scan. Existing addresses remain. The interval survives a panel restart.

Rescan IPs requests a fresh list immediately. It removes only disappeared IPs previously added by discovery. Manual IPs and hostnames, the order of surviving rows and their disabled state are preserved. Save address, port or proxy changes first. A failed scan keeps the existing list; update an older Node agent or continue adding addresses manually.

### The node is running but some hosts are blocked

When Xray is running but a complete shared policy cannot be confirmed because another node is unavailable, independent hosts can keep working. Dependent hosts remain closed: startup does not disable quotas or restrictions. The panel shows a distinct warning and does not rate the node as fully healthy.

Check dependent nodes and the warning details. The panel retries automatically and removes the block only after the complete policy is confirmed. Reloading the page or starting the node again does not cancel restrictions.

### Fields and accounting

Name, country, tags and provider describe infrastructure. The profile and inbound list determine active services. A node consumption multiplier changes user traffic accounting and is not a bandwidth cap. Traffic tracking, monthly threshold, reset day and node notifications concern server usage rather than an individual user quota.

### Paused start queue

If an administrator paused node starts, saved changes can wait for resumption. After maintenance, check the state and resume starts through the queue-management tool. Restarting the panel does not cancel an intentional pause. Ordinary bulk profile assignment does not require that pause; check the result on each node.

### Recovery after a core crash

After a confirmed crash of a compatible core, the agent restores the last private configuration without the panel. A working process is left running; unknown status or busy management defers the check. Administrative pause and quota checks remain enforced. Automatic attempts are limited to three recoveries per hour of the agent process. A further crash after that limit or a recovery error stops retries; check the log, correct the cause and explicitly start a new process. Hot application of settings does not reset the attempt budget. A corrupt journal is never cleared. Both Node and Core builds must include this fix; updating only the panel does not replace them.

### Confirming node commands

After starting, stopping or assigning a profile, check the node's final status. An accepted action does not confirm application. An unconfirmed stop remains an error and is retried; an administrator-disabled node is not automatically enabled after failure. Check connectivity and logs before repeating an action.

Updating the Node image preserves the previously selected managed core. Check the running version in node tasks, update Core separately when required, then refresh the subscription. An autoselect-limit warning clears after support and successful application are confirmed; a failed check does not remove restrictions.

### Xray settings

Xray settings selects one core flavor for the entire panel. The default is the custom Remnacust core. Stock Xray supports standard protocols and transports. Users, freezing, subscriptions, geofiles and client-side autoselect work in both modes. Host/device limits, separate autoselect recipient accounting, destination access rules, inactive-access hosts, port plans and Xera HTTP require the custom core. Stock mode disables their controls and effective policies without deleting saved settings.

Before switching to stock Xray, the panel checks active profiles, port plans and quota journals. Resolve the listed blockers; never delete accounting data or reserves merely to switch. Dual-core selection on a custom node requires an updated Node image; native Remnawave nodes retain baseline compatibility. Applying the change takes time; wait for the node results. Selection does not prove every node applied it: check node status.

Switching cores restarts the core and may interrupt connections. Save editor changes first. After a mode change, the editor checks options for the selected core. The global mode overrides the previous profile choice without rewriting the saved profile. Custom core version management is available only in custom mode.

### Installation and certificates

SSH installation requires root or passwordless sudo; an existing empty directory is allowed. Failures show the stage and detailed logs remain on the server. With a panel-IP restriction and HTTP-01, TCP 80 opens temporarily for certificate validation and closes afterwards; a failed process cannot keep it open longer than 15 minutes. Renewal uses the same rule. External and provider firewalls need their own configuration. Use DNS-01 or an existing certificate to keep port 80 closed.

### Diagnostics and safe operations

Diagnostics check the registered node's protected connection, Xray, user synchronization and port application. Test the full client VPN connection separately. Disabled nodes are not contacted; manual checks are rate limited.

Review port changes before confirming. If settings change between review and confirmation, obtain a new preview. Success requires the node to confirm application. On failure, a previously applied configuration can be restored after checking the current state. Outage and recovery notifications require repeated observations. Maintenance and a manual 30-minute notification pause do not stop health checks.

SSH installation requires root or passwordless sudo. Existing directories are not overwritten; connectivity is checked separately after installation. NET_ADMIN defaults off. A main-server IP restriction closes other incoming ports and ping except SSH. It also covers Docker but does not override provider rules. This is incompatible with public HTTP-01; use an appropriate certificate method. Remove only this restriction with python3 /etc/remnacust-node-firewall/guard.py remove.

A component update from the panel can defer package maintenance requiring interactive SSH and record a notice in the log. Complete it separately; --yes does not answer package-configuration prompts. There is no automatic reboot.

### MPTCP and Linux kernel security

Xray v26.10.31 disables MPTCP by default; explicit streamSettings.sockopt.tcpMptcp remains available. Restore earlier MPTCP behavior only after installing a patched Linux kernel and booting that kernel. A Docker image does not update the host kernel. CVE-2026-98432 affects IPv4 TCP: disabling MPTCP reduces attack surface but does not fix the kernel bug itself. Verify the exact distribution package against its security bulletin rather than relying only on uname -r. Inspect listeners with sudo ss -Mlnp. Do not enable MPTCP on an unverified kernel. Sources: https://github.com/XTLS/Xray-core/releases/tag/v26.10.31 and https://groups.google.com/g/golang-announce/c/PCoQcdxoScw/m/aD-MgXEvAAAJ.

### Fields and controls

- **Limit**: Subscription quota in bytes; 0 means unlimited. The form displays units separately. Host/tag limits remain independent.
- **Reset day**: Day of the month for resetting the node’s monthly traffic counter. This setting applies to server accounting.
- **Notification %**: Notification percentage threshold for tracked node usage. It does not increase allowance.
- **Tags**: Object label array. Host tags also connect enabled policies; saving an empty array clears labels.
- **Note**: Administrator note about the object, not a routing/access configuration.
- **Country**: Country code used for display/grouping. The flag does not change server location.
- **Internal name**: Object display name. UUID remains a separate identifier.
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

Compatible changes apply through the core without restarting its process. From Node 1.1.21, an ordinary profile update with the exact native port-or-transport rejection validates the configuration and automatically restarts Xray only. Failed startup restores the previous private checkpoint and working configuration. Connections may briefly drop. Timeouts, unknown replies and damaged checkpoints do not authorize automatic restart. Strict requireLiveApply and managed port plans retain their contract: such a rejection never becomes a hidden full restart. Updating the container or core binary can also interrupt connections.

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

Open a node card to check connectivity, online users, CPU, memory, networking and Xray state. Available metrics depend on the agent. A missing value does not mean zero load: check the observation time and refresh. Check the installed agent and running core versions on that node. Documentation → Versions describes the bundle and does not confirm that a remote node has already been updated.

Host policies could not be applied. The new configuration has not yet been sent to the node; a running Xray keeps its previous configuration. Check the node connection and policy application errors. The panel will retry when the connection is restored or the error is resolved. The configured limits remain enabled.

If the node card requires an update for host restrictions, update both the agent and running core to a compatible bundle. Updating the panel alone is insufficient. The previous configuration remains until support and successful application are confirmed; a connection error does not disable configured restrictions.

Open the unified IP addresses list in the node form. Add an IPv4 address, IPv6 address or hostname without a scheme, port or path; the separate API port applies to every address. The list holds up to 65 unique addresses, including disabled entries. Use the switch to allow panel control and the arrows to set priority. A saved address cannot be edited or deleted: disable an unwanted entry and add the correct one. A new unsaved row can be discarded. Disabling every address makes node control unavailable.

If the selected address becomes unavailable, the panel tries enabled addresses in list order. Disabled entries are not probed. Check the current control address, result and observation time in the node card. An open TCP port or ping reply alone does not confirm a working API connection. Enter only addresses of this same node. After upgrading, the previous primary and MANAGEMENT/RESERVE addresses are enabled; other known IPs remain saved but disabled. Enable them only after checking ownership and reachability. This switches the control channel; it does not move user VPN connections.

Proxy URL configures SOCKS5 only for panel-to-node control. The field is masked by default; the proxy table column indicates configuration, not connection health. Every fallback address uses the same proxy. If the proxy fails, the panel shows the error and does not bypass it with a direct connection. To use a direct connection, explicitly clear the proxy setting and save. Credentials are available only to administrators; exclude them from logs and support messages. Use a trusted proxy on a protected network: standard SOCKS5 authentication sends the proxy username and password without its own encryption.

For a running, connected node, yellow clock replaces the pulse icon three calendar days before the next payment. One day before, on the due date and when overdue, the clock is red. The date comes from the linked infrastructure billing record and uses UTC calendar days. Extending the billing date clears the warning. The clock never replaces disabled, connecting, disconnected, error or upgrade-required indicators. Without a billing date, the indicator stays unchanged.

### Logs

The health log helps locate connection failures, application errors and restarts. The Xray log shows core messages; its contents depend on logging settings. Compare message timestamps with profile changes.

### How node health is calculated

Disabled, disconnected or connecting nodes show 0/100. Missing active profile/inbounds or fresh running-Xray confirmation also gives zero. Once these prerequisites hold, each of four signals contributes 25 points: configuration, connection, running core and normal resources. Missing metrics do not count as success. Check the observation time: old data from an unavailable node does not establish its current state. Unknown values, memory pressure and sustained CPU load are shown separately.

## Node SSH terminal

### Server access

The terminal connects using separately configured SSH credentials. Its address and port may differ from the node agent. Commands run on the selected server as the SSH user; sudo depends on server permissions. Verify the target node before running commands.

### Access

The SSH terminal supports administrative server work. Closing a tab does not guarantee that commands stop. Check the result and status of a long-running operation before starting it again.

### Fields and controls

- **Internal name**: Object display name. UUID remains a separate identifier.
- **Country**: Country code used for display/grouping. The flag does not change server location.
- **Node Port**: Port of the selected service. A host client port and node agent management port can differ.
- **Proxy URL**: SOCKS proxy for panel control requests to this node, for example socks5://user:pass@proxy.example.com:1080. Leave empty for a direct connection. This does not proxy user traffic; keep embedded credentials private.
- **Plugin**: Plugin configuration assigned to the user. Check that its executor is configured on the required nodes.
- **Tags**: Object label array. Host tags also connect enabled policies; saving an empty array clears labels.
- **Main server IP (optional)**: Only this IP can reach ports and ping; SSH remains public. Clients connect through the main server.
- **Default**: The node will use its default outbound route.
- **IP address**: Choose a configured node IP or enter a literal IPv4 or IPv6 address. Hostnames are not supported.
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

### Recovering unsaved edits

In profile and subscription-template editors, open History → Unsaved draft. This contains the most recent local text, including incomplete JSON or YAML. Compare it with the saved version, choose Load into editor, then save normally. Nothing is applied automatically.

A successful save removes its temporary copy. Edits typed while that request is pending remain recoverable. A failed save does not delete the copy. Delete in this tab removes only the local draft.

Copies are separated by administrator and document. They are available only in this browser on this panel origin, for up to seven days and 8 MiB per document. Clearing site data removes them. Text is encrypted in IndexedDB; this does not protect an open administrator session. Storage restrictions or exceeded limits are shown as errors. Before a forced interface refresh, the interface waits for draft persistence. A browser crash can lose recent keystrokes that have not yet been written.

### Certificate files

If the panel needs to read a PEM file while preparing configuration, mount it read-only under /var/lib/remnawave and use that path. Reads outside this directory, including symlink escapes, are denied. Ordinary text files, FIFOs and PEM files over 128 KiB are rejected. This applies to files read by the panel; it does not relocate node certificates or configure node HTTPS automatically.

### X25519 password and private key

The generator shows two values: Private key for the server and Password (public key) for the REALITY client. For X25519, password and publicKey identify the same bytes, so no duplicate field is shown. Copy all contains privateKey and password. Do not distribute the private key to clients.

### Fields and controls

- **Profile relations**: Squads, inbounds, nodes and hosts

## Xray configuration editor

### Editing a configuration

Open a profile and edit its JSON. Press Ctrl+Space for suggestions, use the up and down arrows to select an option, Enter to insert it or Esc to close the list. The current option is highlighted. Search, formatting and full-screen mode are also available. Before saving, fix marked errors and run configuration validation.

API errors use the interface language; the bracketed code is for diagnostics. For A113, change the duplicate inbound tag: tags must be unique across all profiles. For A114, change the profile name. A tag repeated within the JSON is identified in the editor message. A generic save failure does not prove a name conflict: check the panel log. After a creation error, refresh the list before creating again. For node errors, open “Technical details” to view or copy the original diagnostic; remove secrets before posting it publicly.

### Generate a shortId

The Short ID tab in Tools generates 16 hex characters from 8 secure random bytes. Copy the value into shortIds in the server realitySettings and use the same value as shortId on the client. Generate creates a new value without changing the saved profile or starting rotation.

### Checks before applying

Save validates JSON first. A missing protocol, a typo in it or a structural error produces an explanation without changing the profile or its history. If the built-in Xray validator reports another error, the panel displays it and asks you to confirm saving. Confirmation does not bypass server-side structural checks. A saved invalid profile can be reopened and corrected.

### After saving

Database persistence and node application are separate steps. A queued message means a job was submitted; check node status and logs for its outcome. If queuing fails, the profile has still been saved and the panel shows a warning. Edits made while saving remain in the editor. Clone a profile first when preparing a separate variant.

### X25519 keys

The X25519 tab in Tools shows password, publicKey and privateKey with separate copy buttons. password and publicKey contain the same public key; the names are used by different versions and clients. Set the private key on the REALITY server and the public key in the field supported by the client. All values copies the three fields. Generating updates them together without changing the saved profile.

### Template editors

Mihomo and sing-box templates provide field completion and structural validation without requiring the browser to reach third-party websites. Individual settings depend on the client application’s core version; check the rendered profile in that application. Editor assistance does not confirm server availability or a successful VPN connection.

## Xera HTTP transport

### Origin and place in a connection

Xera HTTP is a transport based on Xray-core XHTTP (SplitHTTP), developed in Remnacust Core. It carries data through HTTP requests and responses and requires support in both the node core and the user application.

In a profile, VLESS defines the connection protocol and user, Xera HTTP the transport, and TLS or REALITY the connection protection. Credentials and routing rules are separate settings.

### Features and limits

Xera HTTP and standard XHTTP are separate transport choices. Xera offers HTTP transfer modes, optional data padding and adaptive limits on concurrent requests. XHTTP support in a regular client does not add Xera support.

HTTP request padding and additional data-block padding are separate settings. Both peers must support the extensions in use. Speed and stability depend on the network, selected mode and proxy; verify the result on your network.

### Compatibility

Xera HTTP requires compatible node and application cores. A regular Xray build supporting XHTTP may lack Xera support. Check the versions and capabilities of both peers. Clone a working profile and test a separate host before changing it for all users.

### Profile configuration

Open [profiles](/dashboard/management/config-profiles) and select a verified Xera HTTP profile for the installed core. Keep a working copy before making changes. TLS needs a valid certificate and matching domain; REALITY needs matching settings on both peers. The public address, port, path, Host and SNI must match the receiving server and proxy.

The Adaptive Xera HTTP panel edits an existing transport in the profile. Select the intended inbound or outbound. For an inbound, the form sets client options in subscriptions for linked hosts; server request limits are configured separately. For an outbound, the options apply to that outgoing transport. Opening the form leaves manual configuration unchanged.

### Node, host and subscription

Activate the inbound on a compatible node, permit it in an internal squad and link a [host](/dashboard/management/hosts). Set the public address, port and SNI. Path and Host can override profile values for the client and must match the server or proxy. Refresh a test user subscription and check the settings actually imported.

Use Xray JSON or a connection link supported by your Xera HTTP application. Standard clients without Xera are incompatible. Sing-box, Clash and Mihomo templates skip these hosts. Updating the panel alone does not add a transport to the client.

### Modes and HTTP proxies

Start with mode: "auto". In our implementation it selects packet-up without REALITY; with REALITY it selects stream-one, or stream-up when separate downloadSettings are configured. A server using auto accepts supported client modes.

- packet-up: upload is split into finite HTTP requests; download uses a separate stream.
- stream-up: upload and download use separate long-running streaming requests.
- stream-one: upload and download share one bidirectional streaming request.
- stream-auto: for HTTP/2 with REALITY, selects stream-one or stream-up with downloadSettings; otherwise selects packet-up. HTTP/2 support at a CDN edge does not establish that the CDN forwards request bodies without buffering.

Upload in headers or cookies and GET require explicit packet-up. Match path, host and customized header options on both ends. The HTTP host and TLS SNI are distinct settings; specify Host through host, not headers.Host.

Behind an HTTP proxy, check the route, headers, request-body limits and timeouts. Streaming modes require forwarding request bodies before completion and unbuffered responses. REALITY needs the protected connection to reach the core; ordinary CDN TLS termination does not replace it. If the proxy cannot forward a mode, test packet-up on a separate host.

stream-auto remains available: it selects a mode from HTTP/REALITY and downloadSettings; it does not measure DPI, latency or buffering, and does not change an open stream after a network error.

Core 1.1.21 defaults packet-up pacing to a sampled 20–40 ms interval with a 30 ms midpoint instead of a constant 30 ms. Explicit scMinPostsIntervalMs is preserved, including fixed intervals and disabled pacing. Streaming modes are not delayed by this setting. The range removes one fixed cadence; it does not hide connection volume, duration or workload.

### Additional traffic padding

customDownlinkPadding adds random bytes to transmitted blocks and increases traffic usage. Start without it. When enabled, set matching header and token values on both sides: header must start with X- and contain 3–64 characters; token must contain 16–128 base64url characters. Avoid reserved proxy headers. bytes accepts 0–1024 and blockBytes 1024–16384; budgetPercent caps overhead (up to 100%), burstBytes is the initial allowance (up to 1 MiB), and uplink enables upload padding. These settings do not replace TLS/REALITY or guarantee that a connection bypasses blocking.

bytes and blockBytes accept a number or a "from-to" range. budgetPercent: 0 or an omitted field disables the percentage cap, not padding itself. Set budgetPercent from 1 to 100 to constrain overhead. burstBytes requires a nonzero budget; the initial allowance may yield a higher percentage on a short connection. token coordinates padding processing; it does not replace the user UUID, protocol password or TLS. Leave padding disabled for the first test.

With a nonzero budgetPercent and zero or omitted burstBytes, the core uses a 4096-byte initial allowance. The budget concerns padding bytes; HTTP headers, TLS and framing also consume traffic.

### Verify the result

Validate the configuration in the editor and save the profile. After saving, check that the node accepted the settings and operates without errors. Refresh the application subscription and check transport, path, mode and SNI. “Unknown transport” means the selected core lacks Xera support. If a host is missing from the subscription, check squads, access, filters and format.

When moving from XHTTP, test a profile copy on a separate host first. Retain the working variant for rollback. Start without extra extensions, then check connection, download, upload and reconnection. Change one setting at a time. For parallel testing, use another node or a free port: two inbounds cannot listen on the same address and port at once.

### HTTP option compatibility

Check client and server core compatibility before updating. The obsolete xPaddingObfsMode, noGRPCHeader, noSSEHeader and repeat-x method are no longer accepted. Updating only one peer can break the connection. These format changes are independent of optional request adaptation.

Path, service headers, data placement and HTTP method settings must match on both peers. Unsupported or conflicting options are rejected during validation. HTTP/2 and HTTP/3 server limits are configured separately from client minStreams and maxStreams. They do not define a browser fingerprint or ensure compatibility with every CDN.

Additional data padding requires matching settings on both peers and provides no automatic fallback to unpadded operation. Browser Dialer does not support this extension. The padding token is visible to profile users and a TLS-terminating CDN; it does not replace user authorization.

### Camouflage limits and measurement

Encryption protects content, while the server address, connection duration, packet sizes and timing remain observable. Matching HTTP headers alone does not make a connection indistinguishable from a browser. Choose a mode for your network and CDN limits, then check connectivity, latency and traffic use in your actual client.

Xera does not add background browsing or switch protocols during a connection. REALITY can make its own HTTPS requests after an unauthenticated connection; those requests do not confirm successful VPN access.

### Client HTTP/2 wire profile

The fingerprint setting selects a supported client TLS profile. For supported Chrome profiles, Xera aligns part of its HTTP/2 behavior and generated User-Agent and Sec-CH-UA with that profile. Explicit headers remain unchanged; other profiles use standard HTTP/2 behavior.

This adds no encryption and does not guarantee browser indistinguishability. A TLS-terminating CDN can see the HTTP exchange. After changing fingerprint, check the connection and CDN compatibility. An invalid response or header error can close the connection; do not disable certificate verification to connect.

### Checking options in the editor

The node-profile and Xray-template editors check supported options and bounds. A valid configuration does not establish application support. Selecting custom Core mode in the panel does not verify client core versions.

Server h2Params and server resource limits remain on the node and are omitted from subscriptions. Shared transport options, adaptation and a separate download endpoint are retained for compatible clients. Manual extra settings remain available.

xmux.hKeepAlivePeriod is in seconds: 0 selects the default, -1 disables idle connection probes, and positive values cannot exceed 604800. HTTP headers are checked before startup; set Host through its separate field.

Explicit TLS minimum and maximum versions accept 1.0, 1.1, 1.2 or 1.3; the minimum cannot exceed the maximum. ECH and HTTP/3 require TLS 1.3. If the client or server cannot support the selected range, the connection is rejected. Changing TLS bounds can alter ClientHello; check compatibility after editing.

### Selecting a mode for the network

For direct TCP, use correctly configured REALITY and stream-auto. For a CDN terminating TLS, use TLS with packet-up or stream-auto: finite POSTs also work when uploads are buffered. Verify data delivery, not just successful establishment. REALITY cannot pass unchanged through ordinary CDN TLS termination.

HTTP/3 needs a separate TLS profile with alpn: ["h3"] and reachable UDP. If UDP is blocked, use a separately reachable TCP HTTP/2 profile; an open stream is not migrated automatically. QUIC Initial does not hide SNI without actual ECH negotiation. Measurements in [China](https://gfw.report/publications/usenixsecurity25/en/) and [Russia in March–April 2026](https://www.petsymposium.org/foci/2026/foci-2026-0010.pdf) establish that HTTP/3 alone does not prevent name-based filtering.

Test sustained upload and download, HTTPS inside the tunnel, idle recovery and reconnection. Padding cannot create a reachable route when an IP is blocked or a strict destination allowlist applies. Splitting HTTP requests also does not guarantee evasion of a whole-connection limit. Success on one network does not establish availability across providers.

### Browser Dialer and ECH acquisition

Browser Dialer uses a real browser with an open helper page. Keep the helper on loopback and open its configured address directly; reload the page after updating Core. Foreign websites cannot read its token or join its WebSocket. The page is not cached or allowed in frames. These controls do not protect against a process that already has local access.

Browser Dialer does not follow HTTP redirects, use cached tunnel responses or forward HTTP error pages as connection data. The helper cannot set another origin’s cookies: cookie placements and explicit Cookie headers fail early. Put session, sequence and padding metadata in paths, queries or headers, and data in bodies or headers. GET/HEAD bodies and Fetch-forbidden methods are rejected. Native clients retain cookie support; customDownlinkPadding is incompatible with Browser Dialer.

ECH hides the inner ClientHello only when negotiation succeeds; the IP, outer SNI and traffic characteristics remain observable. Verify ECH configuration acquisition separately: udp:// exposes the DNS query, while the chosen DoH must be reachable from the user’s network. Large HTTPS/ECH records are supported; truncated UDP answers retry over TCP at the same resolver. DoH replies are limited to 65535 bytes and checked before caching. DoH failure does not trigger plaintext DNS fallback; ECH failure does not authorize removing ECH or certificate verification.

### IPv6 and mixed networks

Verify IPv4 and IPv6 separately. The address field accepts an IPv6 literal such as 2001:db8::1; URLs and address:port pairs need brackets: [2001:db8::1]:443. This is a reserved documentation address. SNI must match the TLS/REALITY configuration. A separate downloadSettings endpoint can also use IPv6.

Core IPv6 support does not provision a host or Docker route or override operating-system restrictions. A reachable IPv6 address, route, listener and port are required. An AAAA record alone does not prove reachability. Select the appropriate IPv4/IPv6/all-addresses mode in autoselect and test the pool from the client network; a panel-side check does not replace a device check. IP family and exit country are different parameters: IPv6 neither establishes another country nor implies an absence of filtering.

### Adaptive Xera HTTP concurrency

In the profile editor, expand Adaptive Xera HTTP and select an existing transport. Choose Enable adaptation, then Balanced (balanced), Low latency (low-latency) or Unstable network (unstable-network). These are three congestion policies using measured HTTP responses, transfer progress and request waiting. Balanced is a starting point for testing; Low latency reacts more sensitively to rising delay, while Unstable network restores concurrency more cautiously after congestion.

When adaptation is enabled, streamSettings.xeraHttpSettings.adaptive requires explicit mode, minStreams and maxStreams. The minimum and maximum must be integers from 1 to 32, with the minimum no greater than the maximum. The form offers 4 and 32. The initial limit of 8 is clamped into that range. The minimum is an admission floor and creates no requests while idle.

Bounds apply to simultaneously active HTTP requests separately for each direction, destination and generation of transport settings. They do not specify physical TCP connection counts, users, sessions across all device apps or CPU load. Adjustment controls admission of new requests; requests already started are neither aborted nor replayed.

Choose Apply to JSON, then save the profile separately. For inbound client settings, refresh the application subscription. Opening the form or choosing values alone does not rewrite manual JSON. Without adaptive, previous behavior is preserved; manual settings and extra remain available.

The adaptation profile leaves the auto/stream-auto transfer mode, ALPN, padding and quota rules unchanged. Applying it requires Remnacust Core 1.1.22 or later in the client using the setting. Check the actual application core version; standard clients without Xera HTTP are incompatible.

The profiles use measured feedback without AI training. Check responsiveness, data transfer and stability on your network. They cannot guarantee DPI invisibility, blocked-address reachability, compatibility with every CDN or an advantage on networks in Russia or China.

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

On Hosts and Nodes, Ctrl+F, Cmd+F on macOS and F3 open panel search instead of browser find. Search works in card and table views and from ordinary form fields. Monaco keeps its own editor search. The override is removed when leaving these pages.

### Visibility and actions

A hidden host is omitted from new subscription responses, but hiding alone does not revoke credentials already issued. Disabling a host controls access through node policy. Internal squads restrict who receives the host. Cloning creates another host record with the original settings; it does not create a server. After saving, wait for policy application and test a user’s subscription.

If the panel loses contact with a node, an authorized host remains in the subscription with the same connection details. Node health alone does not hide it. The connection may fail until the server recovers; once it recovers, a subscription refresh is not needed just to restore the host entry. Visibility, disabled status, squad restrictions, quotas and device blocks are checked separately.

### Bulk editing

Select hosts, choose the fields to update and check the recipients. Selecting the tags field and leaving it empty clears tags; leaving the field unselected preserves existing tags. Record order determines subscription order except where shuffling is enabled. After changing an inbound, visibility or squad, refresh the subscription in a client and check that the intended connection is present.

### Restricted host latency

An HTTP check must reach an allowed website through the host itself. In Allow only mode, the form shows a copyable URL for the first allowed domain. For Happ with a real Provider ID, the panel selects a common allowed URL for all delivered visible hosts, preserving a suitable configured URL and HTTP method. Explicit TCP and ICMP choices are unchanged. When no shared domain exists or only IP/CIDR destinations are allowed, it falls back to TCP; TCP confirms server reachability, not VPN authorization. In INCY, choose HTTP/INCY ping and this URL in subscription settings: ordinary HTTP headers cannot set its probe URL; automatic configuration requires INCY’s own Premium API. Website permissions are not widened and the check never goes through DIRECT. The website must respond to the selected HTTP method; redirects to a denied domain remain blocked.

### Dynamic device bandwidth

The user speed in Mbps is a shared ceiling for all their connections on this host. Active device keys share it by bytes served: one device uses available capacity; when another sends traffic, capacity is redistributed. Idle devices reserve nothing. The device speed limit caps all connections of its private key, combining upload and download. With a 20 Mbps user ceiling and a 15 Mbps device ceiling, one active device gets up to 15 Mbps; two continuously demanding devices can share 20 Mbps, roughly 10 Mbps each. These are ceilings, not guaranteed network rates. A configured host or tag shared ceiling is divided first among users, then their devices; opening more flows does not increase the share. Without a configured shared ceiling the core does not know the physical channel capacity.

### One user’s speed

Under “For each user on this host”, set the quota in GiB and speed in Mbps. These are different limits: quota is a data allowance, speed is the transfer rate. All devices and connections of one user on this host share the speed, including upload and download. With 2 Mbps, two devices together get up to 2 Mbps; another user has a separate allowance. Another host uses its own setting. 0 disables only the host’s own cap; enabled tag restrictions remain. Shared speed for all host users and the accounting multiplier appear below.

### Bulk actions and country search

After enabling, disabling or deleting, check the saved host state. An unavailable node receives the change after reconnecting; saving does not confirm application on a disconnected server. The button shows progress, then the list refreshes. In bulk cloning, successful sources are deselected and failed sources remain for retry. Search countries by RU/EN/FA/ZH names or two-letter codes independently of the interface language.

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
- **Available while subscription access is inactive**: Allows this host for expired, disabled or frozen subscriptions and exhausted overall quotas. Squad permissions, device blocks and the host’s own limits still apply.
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

### Traffic accounting and quota batches

A shared tag quota counts usage on hosts where tag accounting is enabled. Assign the tag, enable the required restrictions, and check the Limits page. Values update after statistics arrive; receiving the same statistics again must not charge usage twice. An unavailable node can leave values behind until connectivity returns. Inspect node health and accounting logs instead of manually resetting database counters.

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

### Selection by total HTTP response time

Lowest response time (ping + TTFB) selects by an HTTP probe through each pool server. Xray uses leastPing with observatory or burstObservatory; Mihomo/Clash/Stash use url-test and sing-box uses urltest. The user app measures the route, not the panel. Timing includes connection setup, TLS for HTTPS and waiting for the HTTP response. It is not separate ICMP ping or a sum of two independently measured values.

For leastPing and leastLoad, the panel supplies a missing observer and enrolls those balancer selectors in HTTP checks, including hand-written JSON. Random and roundRobin need observations when a fallback outbound is configured; without a fallback no extra probes are added. Custom URLs, intervals and explicit HTTP methods are preserved. Defaults are https://www.gstatic.com/generate_204 and 30s; burstObservatory uses HEAD, a 5s timeout and sampling 2. HEAD does not download the response body; an explicit burstObservatory GET includes reading the body in its delay. Choose the same small response, preferably 204, reachable through the entire pool. Measuring from the panel cannot bypass a blocked probe site.

After initial measurements, the app refreshes results on its configured interval. New connections use the current selection without refreshing the subscription; existing streams do not move. Burst uses the sample mean; native url-test/urltest tolerance reduces frequent switching. Probe settings and supported values depend on the client core. Probe timeout and fallback configure failure behavior. Pool membership still respects user access and applicable quotas.

Least load, and round robin or random with a fallback outbound, require HTTP observations. The panel supplies missing probes while preserving the selected strategy and custom probe address. Plain round-robin/random without a fallback do not gain extra requests. An unreachable probe site can exclude an otherwise working server.

### Autoselect in code and UI

The Xray JSON Editing and Autoselect tabs share one draft. Editing an existing pool or balancer immediately updates its JSON. A new pool adds injectHosts, a balancer, routing and observation for leastPing or leastLoad. Adding a balancer for the same pool again does not create a second card. An unfinished balancer named after its pool is completed in place. Created and copied templates appear in the list immediately. Other outbounds, rules and settings remain intact. The changes panel compares against the last save; on phones it appears below the form. Save publishes a valid draft; text with errors is saved on the server with warnings and remains available in history.

Each pool has an independent host address family: Any address (any, the default), IPv4 or IPv6. Strict IPv4/IPv6 retains only hosts whose address field is an explicit IP literal; IPv6 may be bare or bracketed. Domains remain only in any: the panel does not resolve DNS or infer addresses from secondary node API IPs. Zone IDs are excluded from strict pools. This membership filter does not change the balancing strategy: address filtering precedes selection mode and the client strategy. To expose one server over both families, create separate hosts with IPv4 and IPv6 addresses and assign them to the corresponding pools. Separate hosts do not create a shared quota: shared limits use the existing user, autoselect recipient or tag settings within the supported host policy.

### Host pools and tags

selector.type supports uuids, exact tags, tagRegex, remarkRegex and sameTagAsRecipient. All support all/random/group; tag groups contain tags, other groups contain eligible host UUIDs. mode all injects all eligible sources, random selects at most selector.expected unique hosts, and group chooses one nonempty eligible group from selector.groups. Groups can be a named object or an array of arrays. Missing mode keeps legacy all; missing selectFrom selects hidden hosts. Access, visibility and exclusions are checked before selection. Recipient and source quotas are separate. Sampling occurs when a subscription is generated, not for each VPN connection. A profile with an explicit mode and no eligible sources is omitted.

### Assignment and balancing

In Where to use autoselect, choose a specific selection and its recipients. remnawave.assignments contains balancerTag and a recipient list. In the GUI, choose Hosts or Tags first; only that list is shown. Switching mode removes the other list from this assignment. Existing mixed assignments show a warning and change only after an explicit choice. Direct host assignment beats a tag match; an explicit template in the host card beats another template. One host can receive multiple autoselects, each as a separate profile. Repeated tag matches do not duplicate profiles. Quota and speed are configured on the recipient host. Autoselect does not debit pool members or inherit their speed limits. Multiple autoselects for one recipient share its allowance. Without recipient limits or enabled recipient tag limits, autoselect has no host-level ceiling. The account quota still applies. Source pools remain limited by user access. Renaming or deleting a balancer updates its assignments. Legacy assignTo remains readable; choose its selection when editing. The card menu can duplicate any supported template format: settings, draft, tags and geofile references are preserved, while recipient assignments are cleared. Save remains available with code errors; invalid content stays a draft. Error paths identify the pool and reveal its field in code. The failed-probe fraction tolerance is between 0 and 1: 0.01 means 1%. Zero disables this check. A numeric value outside 0–1 is preserved in JSON; Xray clamps it internally when reading the configuration (for example, 2 becomes 1). Rule references to outbounds and balancers are also checked on API saves. An unknown name is not replaced with DIRECT or another route: editor text is kept as a draft with the exact error path while the live template remains unchanged. Names derived from host remarks or tags are resolved when generating the subscription. If pool membership or visibility changes leave a route unresolved, its complete profile is omitted while other valid profiles remain available. Administrator device preview shows the reason. Use balancerTag for balancing; a numbered outboundTag requires that exact member to exist. If every profile is invalid, the response remains 503. Authorization, storage, size and compilation failures are not suppressed.

Assignment example: `remnawave.assignments = [{hosts: ["RECIPIENT_HOST_UUID"], balancerTag: "auto-eu"}]`. Here hosts identifies recipients of the generated autoselect, not its pool members. Pool servers are selected separately in remnawave.injectHosts; auto-eu must match routing.balancers[].tag. The GUI calls this Where to use autoselect; editing JSON manually is optional.

The host edit form shows Saved JSON assignment: an explicit host template, assignment by host UUID, assignment by tag, or no explicit assignment. The template name opens its editor and the balancer appears beside it. Viewing is read-only. Unsaved tags and user-specific response overrides do not replace this saved assignment. Assigned profiles omit unused balancers and provably unused pools with explicit prefixes. Site-specific routing, fallback outbounds and geofile targets are preserved. Dynamic remark/tag names and unproven complex dependencies are retained. Balancer tags must be unique within one JSON configuration; separate profiles may reuse them.

random and roundRobin do not require an observer without fallbackTag. With a fallback configured, Xray uses observations to exclude unavailable servers; the editor preserves these checks. observatory and burstObservatory are alternatives. The former uses an interval and enableConcurrency; burst distributes probes over time and retains a sampling window. sampling is not simply requests per tick: a cycle relates to interval × sampling and affects failure detection and recovery. Burst does not guarantee lower traffic or indistinguishability. Existing observer type, URL, method and intervals are not replaced automatically. Select the mode in probe settings and measure through the client.

### Autoselect limits

Quota and speed are configured on the recipient host. Autoselect does not debit pool members or inherit their speed limits. Multiple autoselects for one recipient share its allowance. Without recipient limits or enabled recipient tag limits, autoselect has no host-level ceiling. The account quota still applies. Xray JSON uses separate credentials for direct and autoselect connections. Direct access debits the member; autoselect debits only its recipient, with the recipient multiplier and enabled tag limits. User and device ceilings remain shared when switching members. Different recipients have independent limits. Access permissions, device bans, account status and destination restrictions still apply. Separate route accounting requires Node/Core with remnacust-routed-device-speed-v1; older components refuse routed policies. Update Node/Core before enabling it and refresh the subscription in the app. Old credentials retain their previous accounting; recorded history is not reassigned. If one host’s DENY overlaps a broader ALLOW_ONLY entry on the other, the overlapping allow entry is removed entirely.

### History and recovery

Xray JSON, Singbox, Mihomo, Clash and Stash retain the last 30 saved versions. The database upgrade preserves existing code as the first version. History shows dates and a comparison with the current draft. Open in editor restores all code, including autoselect, balancers and assignments. Replacing an unsaved draft requires confirmation. Saving creates a new version, so a restore can itself be undone. An unsuccessful save changes neither code nor history.

### Autoselect in every editable format

Autoselect is available for Xray JSON, sing-box, Mihomo, Clash and Stash. sing-box uses urltest/selector; YAML clients use url-test/select/fallback/load-balance. Groups can filter UUIDs, tags or regex with all/random/group and source visibility. Access is checked before selection; an empty explicit pool never becomes DIRECT. Manual members remain intact. Group name and default route are separate controls. All tabs share a draft; an unsaved Xray test pool can be removed with its dependent balancer. Forms show Save and Discard draft; code tools appear only in Editing.

### Geofiles library

Ready-made datasets include published V2Fly and MetaCubeX GeoIP/GeoSite. Import uses the same HTTPS and content checks and never enables rules automatically. Use Click to upload for a local file. In Geofiles, upload from your computer or import a direct HTTPS URL, with a name and content format. Select a library item, attach it, select DAT categories and explicitly choose DIRECT, REJECT or a group. Multiple files and reuse across templates are supported. DAT becomes native rules on the server; sing-box JSON/SRS and Mihomo YAML/text use remote rule_set/rule-providers. Clash/Stash support YAML payload. Existing settings remain intact. Save the template and refresh the subscription to apply. File URLs are public: never upload secrets. Up to 32 files of 64 MiB, text up to 8 MiB; local addresses, archives and unrelated content are rejected. Preserve backups/geofiles when migrating: database-only backups exclude binary files. Historical versions may require reattachment after a file is deleted.

### Priority and backup servers

Priority: first available selects the first working server. For an exact order, choose Hosts and All selected hosts, then reorder them with the arrows. Multiple pool prefixes can also be reordered in the balancer. Tags and regex follow the main host list; random modes select a subset first. Failover and return to the primary follow health checks and affect new connections; existing connections are not migrated. Connections are blocked before the first successful probe and when every server is unavailable. An explicit fallbackTag is used last. Selecting priority in the GUI removes the generated fallback to the same pool and preserves custom fallbacks. Probe settings are preserved. Limits: 128 candidates per balancer and 256 per configuration. Routing scripts and conflicting broad selectors of other balancers are incompatible. Mihomo/Clash/Stash use native fallback in proxies order: explicit code members precede pool members. sing-box has no automatic strict priority mode in its configuration; selector is manual and URLTest uses latency. A full JSON/YAML subscription is required.

Use Server order to open the ordering dialog. Arrows move members and long lists are paginated. Select explicit hosts and all selected hosts for precise per-server order. Round robin rotates new connections; it does not retain the first server until failure. Use Priority: first available for failover. Explicit round-robin order is retained in the subscription, with up to 128 members per balancer and 256 per configuration. Save the template and refresh the subscription after changing the order.

### When to add the recipient host as proxy

Also add the recipient host as proxy maps to remnawave.addVirtualHostAsOutbound. When enabled, the generator additionally builds a separate outbound tagged proxy from the recipient host’s address, port, transport and security settings. Autoselect does not require this switch; it does not enable TLS automatically. Leave it off for an Automatic placeholder representing a balancer. Real injectHosts pool members and the balancer remain in the configuration. Enable it only for a real additional connection supported by the client. A core may reject public VLESS without TLS/REALITY or VLESS encryption; Happ iOS proxy-based checks can report failed to build outbound config with tag proxy / vless without TLS. A successful ordinary test or another device does not validate this extra outbound. Disable the switch for a placeholder, or correct transport and security for a real host. Save the template and update the subscription in the app. The switch does not reconfigure servers or install certificates.

### Distribute connections

Choose Distribute connections to rotate new connections across available pool members. The client excludes servers that fail its HTTP check. This does not select by CPU, memory, user count or spare bandwidth. Existing long-lived connections keep their server, so equal numbers of new connections do not guarantee equal traffic volume.

Xray uses roundRobin with HTTP checks. Before initial probe results, availability is unknown and a member can still be selected. Traffic is blocked when probes show every member is unavailable and no custom fallback is configured. An explicit fallback outbound is preserved. Mihomo, Clash and Stash use load-balance with round-robin. sing-box has no round-robin distribution here: this choice explicitly uses urltest, selecting an available server by HTTP response time. Probe-site reachability affects selection. Save the template and refresh the subscription after changing strategy; the app then updates its probe results without downloading the subscription again.

### Temporary delivery errors

A failed user, device or host query does not mean the subscription was deleted. Configuration delivery returns a temporary error asking the client to retry after 30 seconds; a genuinely missing user still returns 404. A failed host query is not reported as a successful empty subscription. If there truly are no available hosts, extra template and quota queries are skipped. For repeated failures, check the log and database connectivity; do not replace a user’s keys to solve a network error.

### Output size and generation errors

A generated subscription is limited to 16 MiB. Sing-box, Mihomo, Stash and Clash group expansion is also bounded during generation with room for escaping and formatting; excessive fanout may be rejected before reaching the exact limit. Reduce the number of groups or their servers. Generation failures return HTTP 503 rather than an empty successful subscription. When the cache is unavailable, templates are read from the database.

### Saving with warnings

Save remains available for invalid JSON/YAML, empty host selections and incomplete geofile actions. Text with errors is saved on the server as a draft and included in history; reopening restores the same text. Subscriptions keep the last working configuration. Fix the warnings and save again: valid content replaces the working version and clears the draft. Network and database failures are not reported as successful saves.

### Host selection and balancing in one card

Host sources and their strategy share one block. Pools using a shared balancer are grouped together; manual balancers remain visible. Deleting the block removes its sources, balancers and linked rules while retaining independent groups and manual outbounds. leastLoad.expected is the selected node count; tolerance is the allowed failed probe fraction from 0 to 1: 0.01 means 1%, and 2 does not mean two nodes. Xray clamps finite numeric values outside the range to 0–1; such templates apply without a redundant warning while retaining the original number. Changing the strategy in the GUI removes the previous algorithm settings; reselecting leastLoad preserves its parameters. Host UUID hover shows localized parameters instead of technical JSON. New pools start with enabled hosts supported by the format, selected by UUID. With no eligible hosts, the setup remains a draft until sources are selected.

### Standard geofiles and Happ recovery

For automatic delivery, enable the geofile master switch and JSON at the base subscription URL, then enable geofiles for the required template. Full standard GeoSite and GeoIP datasets remain available alongside custom categories: ordinary names, including CATEGORY-RU, are retained, and custom categories receive separate names.

Set a 48-hour refresh interval and enable automatic updates for standard datasets. The interval can be changed per file. Update now checks the source immediately. If SHA-256 is unchanged, the active file is not replaced. After content changes, save the template if needed and refresh the subscription in the app.

If Happ cannot find a standard category after using custom files, refresh its subscription. With the geofile master switch enabled and full standard datasets available, the panel can restore the standard files, including after a panel restart. Explicit Routing settings and custom geodata retain priority. Manual geosite:, geoip: and ext: rules are preserved; restoring standard datasets does not require rewriting them.

### Public geofile path

Clients download geofiles over HTTPS from the subscription domain through /geofiles/. If the website uses a separate CUSTOM_SUB_PREFIX, root links and previously saved prefixed links remain supported together. Domain access rules apply to both addresses.

Forward GET and HEAD requests for /geofiles/* to the subscription website in your reverse proxy, even when other pages use a separate prefix. Check this route if downloads return 404. To verify delivery, download the DAT and its .sha256: the checksum must match the file. Refresh the subscription in the app after correcting the route.

### When the app downloads geofiles

The panel measures each profile including list expansion and client formatting. Small datasets are inline rules; Happ/INCY download large datasets as DAT. A JSON subscription is required: enable “Serve JSON at the base subscription path” or use /json. Save the template and refresh the subscription.

### Host previews in the editor

Hover over a host UUID in a JSON/YAML value to see its name, address, port, SNI, path, tags, state and profile assignment. Assignments, selector values and groups, host:UUID references and history comparisons are supported. Previews use the already loaded host list without requesting it on each hover. Deleted or unavailable hosts are not disclosed. Completion searches both UUID and name. Select and copy preview content; Escape closes it. Comments and property names are not references. To preserve responsiveness, hover parsing is limited to documents up to 2 MiB; long preview fields are shortened.

### Automatic geofile delivery and size

With JSON enabled on the base link, Throne 1.x from stable 1.2.0 receives full Xray JSON arrays through its User-Agent. If a beta build is reported, support starts at 1.2.0-beta.5. Older or unrecognized versions keep their previous format. Explicit /json and /v2ray-json choose a configuration even with a browser User-Agent. This does not grant Throne special Happ/INCY extensions or DAT delivery; normal compatible-client rules and budgets apply. Explicit format choices and access denials remain effective. There is no manual delivery switch. All selected geofiles are first converted to inline rules. INCY receives long comma-free lists in lossless Xray StringList form. The configured condition threshold (20,000 by default) applies independently to each final profile. Only an oversized profile switches to DAT; other profiles retain inline rules. An independent 900,000-byte safety budget after four-space formatting and StringList expansion may apply earlier. The former 90 KB switching threshold has been removed. This is a panel compatibility reserve, not a documented exact application limit. Host profiles are not added together for this comparison. A separate 16 MiB full-response transport limit remains. If a profile is too large, supported Happ/INCY receive bundled DAT with isolated category names. Inline compilation limits can also trigger downloads. Other Xray clients receive up to 50,000 inline conditions across files in one template without Happ/INCY headers; the configurable threshold applies only to automatic DAT delivery. Under Geofiles → Shared inline rule threshold, enter 1–250,000 addresses/conditions (default 20,000). This is shared by all templates and counts entries, not JSON lines. Save and refresh the subscription; templates do not need to be saved again. Independent size limits may switch delivery earlier. Compilation, template-size and full-response bounds remain; rules are never truncated. The app must support full JSON configuration import. Server-link subscriptions do not carry routing. v2rayTun uses its own routing format, not a Happ/INCY profile. With JSON at the base address enabled, v2rayTun receives the full configuration with these rules. Host exclusions and an explicit JSON opt-out in response rules still apply. Small sing-box/Mihomo/Clash/Stash datasets are inline and large ones remote; binary SRS is always remote. Legacy Clash also downloads native providers for compatibility. DIRECT, REJECT, groups and routing order are preserved. Manual routing/geodata are not overwritten: incompatible oversized output fails explicitly. Profile names use the subscription profile-title, including squad overrides, or the subscription domain as fallback; a stable short suffix isolates identical names. Legacy downloadToClient is accepted but no longer chooses delivery. Client intervals apply only to remote delivery; server refresh has a separate schedule.

### Geofiles: enabling and disabling

In Subscription settings → Additional options, enable JSON at the base path, then Remnacust geofile system. The master switch defaults to off, including after upgrading to this version. While off, template geofile icons and commands are hidden and API enabling is rejected. The library and saved assignments remain. Enable geofiles separately for each template using ⋯. Its icon shows the state; new templates default to off. The editor tab requires both the master and template switches. Turning the master off stops automatic rules and DAT delivery in every newly generated subscription format and pauses source schedules, retaining template preferences. Turn the master off before disabling base-path JSON. Disabling one template affects only that template. Explicit administrator-written geosite:, geoip:, ext:, geodata and routing headers remain unchanged in either state. A category reference does not download a file: configure manual source downloads and updates separately in a compatible app. Manual library operations remain available while the system is off. Refresh the subscription in the app after changing settings. In-flight requests may finish using earlier settings; previously issued signed URLs remain valid.

### Startup and concurrent requests

After panel startup, the first subscription using geofiles may take longer to prepare. When many requests arrive, allow preparation to finish and retry. A 503 response with Retry-After: 2 means waiting at least two seconds before the next attempt. The subscription page waits up to 30 seconds for the panel. For an access error, check permissions and the page connection to the panel.

### Removing a geofile from a template

Save the template and refresh the subscription in the app. If this subscription previously received our DAT files, disabling all custom files or returning all its profiles to inline rules replaces their sources with standard GeoIP/GeoSite from Loyalsoldier/v2ray-rules-dat, using the addresses documented by Happ and INCY. An empty URL alone does not restore a saved DAT. The panel keeps the previously issued profile name, advances its revision, clears only its additional rule lists and disables file trimming and scheduled downloads. The app must successfully download the standard files; reconnect the VPN afterwards. This does not restore the exact bundled files of a particular app version. Recovery remains incomplete if the download fails. Manual geosite:/geoip: rules in JSON remain unchanged. An explicit routing header or manual geodata section takes precedence: the panel does not replace those sources. A fresh subscription without managed-file history receives no download instruction. Recovery requires retained server history for that profile and device; if it is lost or the name changes, restore standard geofiles using the app. Standard sources never replace a managed DAT while any subscription profile still uses it. Removing one of several files of the same kind leaves only the remaining sources in the combined DAT; URLs and lists for a removed kind are cleared. Other app profiles and the library are preserved. Changed DAT content receives a new signed address; unchanged content keeps its address. Previously issued links and .sha256 checks remain valid.

### GeoIP for domain destinations

When geofiles generate GeoIP rules, the final Xray JSON uses IPOnDemand: DNS resolution occurs when an IP rule is reached. DIRECT, REJECT and GeoIP balancers can then match before the TCP/UDP catch-all. Inline rules and downloaded DAT use the same behavior. Earlier manual rules retain priority and the source template is not overwritten. Domain-only GeoSite and other client formats keep their DNS strategy. If resolution fails, subsequent routing rules apply.

### Automatic geofile delivery and size

With JSON enabled on the base link, Throne 1.x from stable 1.2.0 receives full Xray JSON arrays through its User-Agent. If a beta build is reported, support starts at 1.2.0-beta.5. Older or unrecognized versions keep their previous format. Explicit /json and /v2ray-json choose a configuration even with a browser User-Agent. This does not grant Throne special Happ/INCY extensions or DAT delivery; normal compatible-client rules and budgets apply. Explicit format choices and access denials remain effective. There is no manual delivery switch. All selected geofiles are first converted to inline rules. INCY receives long comma-free lists in lossless Xray StringList form. The configured condition threshold (20,000 by default) applies independently to each final profile. Only an oversized profile switches to DAT; other profiles retain inline rules. An independent 900,000-byte safety budget after four-space formatting and StringList expansion may apply earlier. The former 90 KB switching threshold has been removed. This is a panel compatibility reserve, not a documented exact application limit. Host profiles are not added together for this comparison. A separate 16 MiB full-response transport limit remains. If a profile is too large, supported Happ/INCY receive bundled DAT with isolated category names. Inline compilation limits can also trigger downloads. Other Xray clients receive up to 50,000 inline conditions across files in one template without Happ/INCY headers; the configurable threshold applies only to automatic DAT delivery. Under Geofiles → Shared inline rule threshold, enter 1–250,000 addresses/conditions (default 20,000). This is shared by all templates and counts entries, not JSON lines. Save and refresh the subscription; templates do not need to be saved again. Independent size limits may switch delivery earlier. Compilation, template-size and full-response bounds remain; rules are never truncated. The app must support full JSON configuration import. Server-link subscriptions do not carry routing. v2rayTun uses its own routing format, not a Happ/INCY profile. With JSON at the base address enabled, v2rayTun receives the full configuration with these rules. Host exclusions and an explicit JSON opt-out in response rules still apply. Small sing-box/Mihomo/Clash/Stash datasets are inline and large ones remote; binary SRS is always remote. Legacy Clash also downloads native providers for compatibility. DIRECT, REJECT, groups and routing order are preserved. Manual routing/geodata are not overwritten: incompatible oversized output fails explicitly. Profile names use the subscription profile-title, including squad overrides, or the subscription domain as fallback; a stable short suffix isolates identical names. Legacy downloadToClient is accepted but no longer chooses delivery. Client intervals apply only to remote delivery; server refresh has a separate schedule. Size accounting includes Xray StringList expansion back into arrays: a small HTTP response can still produce a large client configuration. The 900,000-byte budget applies separately to each Happ/INCY profile. Geofile links use the HTTPS authority of the current subscription request, including CDN. The CDN and reverse proxy must preserve the original Host; arbitrary Forwarded/X-Forwarded-Host are not trusted. A subscription page relays its authority using its current scoped API token; update both components. Only links in that response change, not the configured panel server, signatures or DAT/.sha256 paths. Do not publicly cache subscriptions or geofiles on the CDN.

### Server auto downloads and update safety

Select a library file and configure its HTTPS source, automatic updates and server interval from 15 minutes to 30 days. Settings save immediately for every template using that file. URL imports retain their source; PC uploads need a source URL. Auto updates default to off. The scheduler checks once a minute; a persisted lease prevents concurrent duplicate downloads. Source failure, panel restart and manual retries do not reset the interval. Addresses, redirects, size, format and categories used by active templates are validated. Errors retain the last working copy; status and next check are shown in the library. Original hashed URLs remain immutable; Updatable links and signed URLs return the active version without immutable caching. Server and client schedules are separate, so changes need not reach clients immediately. After a successful source update, newly generated subscriptions use the active file. Inline rules change when the subscription refreshes; downloaded DAT also needs to refresh in the app. An unrefreshed saved profile remains a snapshot. Manually uploaded files cannot follow third-party changes without a configured source and automatic updates. Expanding large lists into every profile increases size and does not update already imported rules.

Standard Loyalsoldier GeoIP and GeoSite sources are listed under Standard geofiles in additional settings. Opening the list does not download them. Update standard files downloads missing files from GitHub or refreshes existing imports; they appear in the ordinary library. Each downloaded file supports its own schedule from 15 minutes to 30 days, disabled by default. Scheduled checks run only while the master switch is on. Failed downloads retain the working copy. Previously managed subscriptions can recover standard DAT files through Base64 responses too. Automatic profiles disable repeated app-side DAT trimming so categories referenced by JSON are retained.

### Shared catalog and pool members

Ready-made datasets is one library for every template: PC uploads, URL imports and published sources. Import selects the entry without changing the template. Attach the file, choose categories and action, then save. Incompatible formats remain visible. Library deletion applies everywhere; detach files used by saved templates and save first. An unsaved attachment in the current editor is removed with the file. Pool members select connections; recipients of the entire template are separate optional settings below the code editor. The pool count excludes disabled hosts, duplicates and XRAY_JSON exclusions; user access and random selection can reduce the result. With legacy host naming, target the balancer rather than an unused prefix.

### Checking delivery in Happ and INCY

No download animation is expected for a small subscription: its rules are already in JSON. Large profiles require full JSON and client routing support. Use /json or enable “Serve JSON at base subscription path” in main subscription settings. This format setting saves immediately. Enable automatic geofiles separately through the template’s ⋯ menu; the Geofiles tab has no JSON toggle. Save the template actually assigned to the subscription, then refresh it. Routing profiles use the subscription title; a previously imported Remnacust name may remain as a separate entry that can be removed in the app. Check device preview and app logs to confirm delivery. Reconnect yourself if needed; the server never starts the tunnel.

### Refresh and file integrity

The subscription page transfers DAT separately from JSON: JSON has a 16 MiB limit and DAT a 64 MiB limit. Interrupted downloads are not successful. EOF or a missing category can indicate an incomplete or stale local file. Use compatible panel and separate subscription-page versions, then refresh the application subscription. Compare DAT with its .sha256. After bulk host changes, review the result and node status: saving settings and applying them on the server are separate stages.

### Editing library files

Open Geofiles, choose a file in the shared library and select Edit file. The same action appears on an attached file. A preset requires a new name: saving creates an independent copy and replaces the source only in the current template draft. Save the template to apply that replacement. Other templates retain the original. Editing an ordinary uploaded file saves immediately and affects every template using it.

For DAT, select a category and browse or search paginated records. Edit domains, IPs and domain record types, remove records or add new ones. Attributes and other categories are preserved. Save or discard edits before changing categories. Text JSON/YAML sets can be edited in full up to 8 MiB; SRS and larger text files require a same-format replacement up to 64 MiB.

Manual editing disables automatic source refresh to preserve the changes. Concurrent administrator edits or refreshes cause a conflict rather than overwriting a newer revision: close and reopen the editor. A category used by a saved template cannot be removed without reconfiguring that template.

### Additional addresses and routes

The Geofiles tab contains the Additional addresses section. Import accepts an Xray JSON rule, an array or comma-separated fragments, including a final comma. Choose one action for every address or retain the routes from the rules. Import creates separate rules in the current template; unsupported conditions reject the whole block rather than being silently dropped. Enter one domain, IP or CIDR per line and choose DIRECT, REJECT or an existing VPN/autoselect route. example.com includes subdomains; full:example.com is an exact match. keyword: and regexp: are also available. Domain and IP matches become independent rules rather than requiring both. Rules precede geofiles and the catch-all, making them useful exceptions.

These are rules in the current template: save it and refresh the app subscription. They do not change the shared library file. A block accepts at most 20,000 addresses and 2 MiB of text; upload larger lists as files. Complex manual rules with extra conditions remain in the code editor. For VPN, choose an existing working outbound or group: DIRECT or REJECT does not create a VPN server.

Additional addresses and import are available only on the Geofiles tab. Paste one address per line, a JSON array of strings, or comma-separated quoted strings, including a fragment without brackets. Use Import for actual routing-rule objects. In Xray JSON, Via host routes selected addresses or file categories through a particular host. The host must be available to that user; its own credentials, restrictions and quotas apply. Selecting it grants no additional access and never falls back to DIRECT when unavailable. Other formats use their existing groups and routes. The empty changes panel disappears after saving. When switching to DAT, legacy geosite/geoip references in other profiles use a selected file category only when the match is unique; the original rule action and order remain intact. Unknown or ambiguous categories and custom geodata are never substituted.

### Category reference checks

Automatic DAT delivery checks GeoIP/GeoSite references in arrays and comma-separated StringLists, including DNS rules. A manual category is mapped only to a unique attached source; missing or ambiguous categories stop delivery instead of creating a broken configuration. Array elements, including regexps containing commas, are never split. When selection storage fills up, a small selection is included in the signed URL; selections exceeding the safe URL budget retain compatible full-DAT delivery. Disabled automation leaves manual rules unchanged.

### Subscription refresh and personal links

If a client still shows an old error after a panel release, verify that the subscription itself refreshed: when HTTPS on its old domain fails, the app keeps its saved configuration. Retain the old domain and certificate while migrating links; changing the panel address does not migrate installed subscriptions. Update a separately installed subscription page together with the panel. Personal /device/ links are bound to the subscription and HWID; the panel checks their signature, device block and user access on every request. Keep these links private. INCY receives long inline lists in lossless Xray string form; the size budget includes JSON formatting. Delivery is chosen automatically using each profile’s size.

### Selection and geofile editor workflow

Each selection has one expandable card containing its servers, strategy and subscription host assignments. Assignments belong to a specific balancer name; renaming preserves the link. A legacy assignment with one possible selection appears inside it; ambiguous assignments require an explicit target. Opening the page does not rewrite code. Tabs scroll with the page; saving stays at the bottom. For geofiles, choose the library, computer or URL. Uploads immediately store the file in the shared library; a compatible file attaches to the current draft in one action. Set categories, action and the client interval in its card, then save the template; delivery is selected automatically. Detaching a file does not delete it from the library. Shared file settings and server refresh are in the expandable library section.

### INCY geofile checks

INCY receives stable DAT URLs without query parameters. The signed file selection is in the path, so appending .sha256 to the complete URL returns the checksum for the same bundle. Unchanged files can be checked without downloading them again. Happ/INCY profile LastUpdated stays stable across unchanged subscription requests; a profile, file or delivery-mode change advances it. State is device-scoped and survives panel restarts. routing-geo-update-interval uses hours. Update a separately deployed subscription page together with the panel. Automatic inline delivery sends empty geofile URLs and disables periodic checks; the JSON keeps the rules. Previously issued URLs remain supported. Scheduling and network-error retries depend on the client version; the server does not start the tunnel. Official protocol: https://docs.incy.cc/routing/

### Pool membership after switching

Switching grouped selection to connection-time selection merges UUID and tag groups into values. Regex and recipient-tag selectors retain their UUID boundary in groups: the original filter and user access both apply. Edit these lists in the GUI or code; unrelated hosts are excluded. Switching a manual client group to automatic selection sets its probe URL and interval.

### Selection at connection time

Source pools and recipients are separate settings. Each remnawave.assignments entry binds a specific balancerTag to recipient hosts or tags. A direct host assignment takes precedence over a tag assignment. An explicit template in the host card remains highest priority; that template uses the balancer assigned to this recipient. DIRECT, REJECT and domain restrictions are preserved. all delivers every authorized source; the client strategy chooses a server for each new connection. random/group reduce membership when subscriptions refresh. Membership changes arrive on subscription refresh. A separate TCP entry for server changes is no longer created.

### Geofile thresholds and categories

The configurable inline threshold is 1–250,000 conditions, default 20,000, independently for each final host profile. An independent 900,000-byte budget includes formatting and StringList expansion. Exceeding either limit switches only that profile to DAT containing selected categories; smaller profiles stay inline. GeoSite and GeoIP are separate downloads; rule actions and order remain intact. Host profiles are never summed. Plain DIRECT/REJECT actions are not duplicated as direct/block; existing plain outbounds are reused without replacing custom outbound settings. Links are signed and earlier links remain supported. Preserve the entire backups/geofiles directory, including category selections, when migrating. Subscription and DAT URLs do not require a running VPN and use the public domain or configured CDN; HTTP 502, DNS and certificate failures require checking the external proxy and running subscription page. Download failure never becomes an empty successful dataset.

### Opening a template

The selected template text opens independently of the host list. While hosts are loading, you can continue editing text; host selection and host hints become available after loading. A failed host-list request does not replace the template with an empty document. Retry loading the list before changing a pool. If the template itself fails to load, retry from the error page instead of creating an empty replacement just to open the editor.

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

Open Subscription settings → the remarks card. Use the up and down arrows to move notification reasons, save the settings, then refresh the subscription in the client. The default order is Subscription expired, Subscription disabled, Subscription frozen, New devices denied, and Device blocked (HWID). Only messages for applicable reasons are shown. Each reason’s text is edited separately in this card.

When combining subscription status and HWID is enabled, an expired or disabled subscription together with a blocked device produces both message groups in the chosen order. For example, expiry appears before the device block by default; moving HWID above expiry reverses them. With combining disabled, the subscription status message takes priority; an active subscription shows the device block message.

New devices denied is handled separately. If registration is denied for a new device and its subscription is also expired or disabled, the reason placed higher in the list is shown. Moving registration denial above expiry therefore shows the registration message. These two reasons are not combined. An already registered, allowed device keeps access when the other access conditions are met.

Traffic quota exhaustion, the maximum device count and missing HWID support have separate messages outside this list. Reordering changes subscription messages; restrictions and access checks still apply. Presentation depends on the client.

### Remarks before an active subscription expires

Open remarks in subscription settings and add a pre-expiry rule. Set the number of days, enable the rule, and choose all users or specific internal and external squads. Membership in any selected squad is sufficient. A rule applies only to ACTIVE subscriptions that have not expired and have no more than the configured number of days remaining. If several rules match, the smallest day threshold wins; equal thresholds use list order. Renewal recalculates eligibility on the next request. Frozen, disabled, expired and limited subscriptions keep their existing state messages. Device blocks and registration restrictions retain priority.

Add text rows or HTTPS link actions. A standalone {HOSTS} row inserts the connections available to this user at that position. It is allowed once; the hosts switch inserts or removes it. Hosts still pass normal squad, quota, access and output-format checks. The marker grants no additional permissions. Without {HOSTS}, the client receives remarks only; choose this deliberately because normal connections will not be delivered. Arbitrary proxy JSON is not supported in these rules. Preview shows sample content rather than real user connections. Save changes and refresh the subscription in the client; text and action presentation depends on the application.

An external squad can replace the entire global remarks configuration, including these rules. Enable inheritance to use the complete global configuration. Selecting that external squad in a global rule does not override its own replacement. Failed saves retain the draft for retry; reset restores saved values.

### Message length and client compatibility

Keep remarks concise. After variable substitution, long text may be shortened and some additional rows omitted to fit client limits. Pre-expiry rules retain {HOSTS}, when configured, and at least one notice. Message and connection order matches between the response body and subscription presentation. A global action that cannot fit alongside the messages may be omitted entirely; its URL is never truncated. Check the resulting response and its display in the intended application.

### First start of a mixed node fleet

On first connection, wait for capability checks and profile application. Native Remnawave and custom nodes can coexist, but extensions depend on the core actually running. Nodes sharing an inbound use a compatible mode; independent compatible inbounds retain extensions. Unknown capabilities keep the previous configuration and schedule another check. An unavailable node delays only related connections. Network errors do not remove configured restrictions.

### Access lifetime and devices

Access deadlines are stored in UTC; account for the interface timezone when selecting a date and time. Changing the server timezone does not extend a subscription. If a device is blocked or registered again after the list is opened, a stale bulk deletion preserves it. Refresh the list and check the selected devices before retrying.

### Subscription performance and compatibility

Subscription delivery does not wait for node acknowledgements. Profiles appearing in an app do not prove that a server has applied them: check node health and configuration status. Use compatible panel and subscription-page versions. A confirmed native Remnawave node receives a baseline configuration: new host restrictions, destination rules and inactive-user exceptions are disabled on its inbounds. A custom node sharing such an inbound uses the same compatible baseline credentials; isolated compatible inbounds retain extensions. Older custom cores without autoselect recipient accounting use ordinary pool-server credentials and limits. Upgrade Node/Core and refresh the client subscription for separate recipient accounting. The panel displays compatibility mode. An unknown node or network failure alone never disables restrictions. Existing quota reserves and financial fences are not erased by a downgrade. Older subscription pages remain compatible. This mode needs no new .env variables.

### Technical update log

Download journal in the panel update dialog and subscription page operations downloads real technical output rather than a status JSON. Only a panel administrator can download it for the current job ID; API tokens cannot. Passwords and tokens are removed from the downloaded copy. Large files return the last 1 MiB with a truncation notice; the complete private file remains on the server until the next operation for that component. If the panel is temporarily unreachable, retry after reconnection or open the displayed server path. Requires panel 1.1.7.91 and installer service 1.2.129. remnacust-panel-update.service starts the local API at boot and only starts updates on an administrator request.

### Inactive access and freezing

Hosts enabled for inactive subscription access are available for EXPIRED, DISABLED, FROZEN and LIMITED, and for an ACTIVE account whose time has expired. The additional option hides them while the subscription is active. Squad permissions, device blocks and host-specific limits still apply. Configure the FROZEN block and its position in remark order under custom remarks. {{FREE_HOST}} inserts permitted hosts at that line; it cannot bypass an HWID block or grant access. Add that host’s inbound to the user’s internal squad. For a shared inbound, restrict other hosts through their squad access settings to avoid granting extra connections. Device preview warns when only notifications remain after resolving credentials. External squads may override wording and order. Older settings gain default frozen wording without replacing saved messages. Inactive JSON uses standalone connections without shared or assigned templates, balancers or geofiles; host restrictions still apply. Domains, IPs and networks become separate rules. HWID denial shows the saved device-limit or unsupported-device warning instead of only subscription status. Happ and INCY on the same PC use different HWIDs and occupy separate device slots.

### Multiple subscription links

Each primary domain can have only one CDN. The user API subscriptionUrl and preferred link use an available CDN of the assigned primary. Without a CDN, they use the open primary URL. The API subscriptionDomain object describes the same public address as subscriptionUrl, including UUID, kind, name and path. subscriptionDomainUuid keeps the persisted user assignment (null means the default domain) and does not change when a CDN is selected. With no accessible address, subscriptionDomain is null. SUB_PUBLIC_DOMAIN remains the origin; do not replace it with a CDN. User assignment, credentials, expiry, freezing, devices and quotas remain unchanged. Available links have copy and QR actions; closing a primary hides its whole family. With no available address, subscriptionUrl is empty. Additional CDNs from older versions remain usable and are not deleted automatically, but a second CDN cannot be created or moved into an occupied family. Legacy families prefer an explicitly assigned available CDN, then the redirect target, then the first available CDN ordered by domain. Read permissions for regular, CDN and all links remain separate. Catalog access does not disclose subscription keys.

### CDN: configure once

Copy the individual neutral request header name and UUID value from Set up CDN. Add an origin request header in VK or Yandex. The name stays stable across upgrades; replace only the old common header name when migrating. Use the main subscription site for the HTTPS origin, Host and SNI. Disable forced caching of personalized responses. Existing client URLs need no replacement; files, checksums and device URLs retain the CDN. The ID does not bypass keys, status, freezing, expiry or HWID. The /cdn/<ID> path remains a fallback for CDNs without request headers. No new .env variables are needed. The name is generated with the private installation key and cannot be computed from the public ID alone. If APP_SECRET is separately rotated, copy the new header name to the CDN.

The profile-web-page-url header and {{SUBSCRIPTION_URL}} use the validated public domain and path of the current request. CDN requests keep their CDN URL; another registered open domain keeps its own address. Forwarded, Origin and Referer cannot select the domain. Administrative operations outside a public request prefer an available CDN of the assigned primary, falling back to its open primary URL. Literal URLs explicitly configured by an administrator are not automatically rewritten.

### Subscription domain and .env

The primary domain synchronizes with SUB_PUBLIC_DOMAIN through the installer service. If the service is unavailable or the file was edited concurrently, inspect the status and log, refresh the details and retry. DNS and certificates are configured separately. Keep the origin set to the primary domain, not its CDN address.

Each primary supports one CDN. Choose public access, CDN only or redirection to its linked CDN. Redirection preserves paths and queries, including /json, devices and geofiles. An invalid CDN header returns 403; redirection returns 307. Closed denies the primary and its CDN. The last available primary cannot be closed or deleted.

In Configure CDN, copy the issued header name and value to CDN request headers. Overwrite the header rather than duplicating it. Keep it out of responses, public links and client apps. Before restricting the origin, check the page, normal subscription, /json and geofiles through the CDN.

Before deleting an old primary, remove or move its CDN and explicitly confirm transferring users to the current default domain. Credentials, devices, frozen lifetime, expiry and limits remain. Subscriptions already imported into apps must be migrated separately; retain the old DNS and certificate during transition.

### Subscription refresh and HWID

A subscription can refresh even when the node control connection is unavailable. Personal keys are delivered separately; a new connection on that node works after its key arrives. Every refresh still checks user access, HWID blocks, registration rules and device count. Repeated refreshes do not remove restrictions.

Opening a web page or requesting without device headers differs from a Happ or INCY request. For diagnostics, compare the same URL, application User-Agent and HWID. Keep personal links and device identifiers private.

### Pages on this server

The Subscription pages tab manages registered instances on the panel server: start, stop, restart and independent update. Installer 1.2.100 and its local control service are required. CLI commands: install-subscription-page, upgrade-subscription-page --page-id ID, and manage-subscription-page; the list shows IDs. A local panel uses a separate restricted token and Docker network. A remote panel requires HTTPS and a subscription-page API token. Page ports bind to loopback; use a separate Caddy on free HTTPS ports or your existing proxy. Updates preserve settings and stopped state; failed readiness rolls Compose back. Private operation logs: /opt/remnacust/logs/page-<id>.log. Browser requests cannot supply arbitrary commands, paths or images.

### Existing Remnawave pages

Local discovery also includes legacy Remnawave Compose pages connected to this exact panel. It checks the official image, connection to the panel and its network, Compose identity and safe files. Listing does not register or change the deployment. Legacy pages support start, stop and restart; their image, token and settings are preserved. Migrate explicitly with the installer before upgrading. Remote pages, non-Compose deployments, connections to another panel and unsafe paths are not accepted for management. Registered pages retain their existing controls.

### Page connection to the panel

During page installation or migration, choose the local panel or another panel’s HTTPS address and an API token with subscription-page permissions. Option 9 in the installer’s page management changes the panel and token. Enter the token privately or use a private file with mode 0600. Connectivity and permissions are checked first; failed application restores the previous settings. Only the selected page changes, and stopped pages remain stopped. An existing Remnacust image is not offered for migration again.

### Fields and controls

- **Enable the Remnacust geofile system**: Off by default. Enables full GeoIP/GeoSite updates and geofiles in selected templates. Generated client settings require JSON at the base subscription URL. Manual geosite:, geoip:, ext:, geodata and routing remain independent.
- **Additional options**: Configure additional subscription options
- **Randomize hosts**: Enables random host ordering in subscription output. The order can change on the next refresh.
- **Show custom remarks**: Shows configured subscription status messages, such as expiry or exhausted quota notices.
- **HWID settings**: Carefully review the documentation before enabling the HWID feature. Not all client applications support this feature.
- **Fallback device limit**: Device limit for users without an individual limit. For example, 3 allows up to three registered devices; 0 removes the count limit.
- **Max devices announce**: Device-count announcement sent to a compatible app with the subscription. An empty value leaves the announcement unset.
- **Response headers**: Headers that will be sent with the subscription content.
- **Subscription domains**: The primary domain is used for new links. A CDN domain belongs to it and preserves the address through which the client requested the subscription.
- **Existing URL or subscription key**: Paste a regular subscription URL to generate its CDN URL below. Nothing is sent to the server.
- **Name**: Object display name. UUID remains a separate identifier.
- **Domain**: Use a public hostname only, without protocol, port or path.
- **Subscription path**: Optional subscription path, such as /api/sub. It must match the page and proxy configuration.
- **Type**: Primary subscription domain or CDN address. A CDN must belong to a primary domain.
- **Primary domain**: UUID of the primary domain associated with this CDN.
- **Make the primary domain**: Use this primary domain for users without an explicit domain assignment.
- **Primary domain access**: Closed mode returns HTTP 403 without redirection. Closing a primary closes all its CDNs; closing one CDN leaves siblings available. The last available primary cannot be closed or deleted, even when CDNs exist. User cards, QR codes and link APIs show only available addresses, hiding CDN-only and redirecting primary addresses. Deleting a former primary can explicitly move its users to the current default. Credentials, devices, frozen state, expiry dates and quotas are preserved. Move or remove child CDNs first.
- **Redirect destination**: A CDN belonging to this primary domain. Redirects preserve subscription and geofile paths and cannot target unrelated domains.
- **Subscription pages**: Manage local subscription pages on this server. Updates preserve settings and stopped pages remain stopped.

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

## Subscription proxy on a separate server

### What is proxied

Client → separate proxy sub.example.net → subscription-page server 198.51.100.20 → panel API. This proxies subscription delivery, not node VPN traffic. Connecting to a fixed IP bypasses origin DNS lookup; Host selects the origin site, while SNI and certificate verification authenticate its name. In this example origin.example.net is the primary page domain and sub.example.net its CDN/proxy domain. All addresses and keys are examples. Only the server-side page needs the private panel address; do not expose it to clients.

### Prepare the panel and servers

In Subscription → Settings → Subscription pages, add primary origin.example.net and child CDN sub.example.net. Copy the individual request-header name and value from Configure CDN. The X-… name and UUID/signature value are different for each CDN. Each opening fetches fresh credentials; closing removes them from the UI cache. Viewing does not rotate the configured pair. Point sub.example.net DNS at the separate proxy; the origin certificate must match origin.example.net. The origin HTTPS site must forward complete paths to an updated subscription page. Keep its REMNAWAVE_PANEL_URL and API token in the private server-side .env. Update separately hosted pages independently of the panel. For an existing Remnawave page, choose Migration → Subscription page from Remnawave (migrate-remnawave-subscription-page) in the installer; its panel connection and settings are retained.

### Provider CDN, separate origin and legacy links

With a provider CDN: client → CDN → origin.example.net on a separate server → Caddy → local subscription page → private panel API; responses follow the reverse path. Point public sub.example.net to the CDN using the provider-required A or CNAME record. Set the CDN source to the page HTTPS hostname or its IP, with Host and SNI origin.example.net. Configure the individual panel header pair on CDN REQUESTS, never responses. Origin Caddy forwards the complete request to the local page. Port 3010 is an example: use your published port bound only to loopback. This block assumes Caddy on the same host; in a separate Docker network use the service name and its port instead of 127.0.0.1.

```caddyfile
origin.example.net {
    reverse_proxy 127.0.0.1:3010
}
```

For a migration without cutting off clients, retain legacy.example.net as a registered OPEN primary with working HTTPS forwarding to the page. Keep its DNS and certificate so imported links still work. Make origin.example.net the default primary and issue sub.example.net CDN links from user cards or the link API to new clients. Change explicit legacy user assignments separately; their keys need not change. SUB_PUBLIC_DOMAIN remains the origin primary synchronized with panel settings, not its child CDN. To omit the new origin from client link lists, select CDN only or Redirect to CDN. An already imported legacy URL does not disappear automatically. A Caddy block alone without panel registration is insufficient: unknown hostnames may be rejected. Retire the old domain only after clients migrate.

### Forward the complete path

Proxy /KEY, /KEY/json, device links and every /geofiles/... path, including .dat, .sha256 and query parameters. Preserve any configured subscription prefix; these examples assume an empty prefix. Do not prepend /api/sub to every request: direct panel API access is a different topology. Keep the URI and avoid redirects to private service addresses. Preserve client User-Agent, Accept and HWID headers, plus Routing, Profile-Title, Subscription-Userinfo, Content-Type and ETag responses. Overwrite only your own CDN header. Do not force caching of pages, subscriptions or errors; respect origin Cache-Control for DAT. An HTML 200 does not prove that JSON and geofiles work.

### Caddy: connect to an origin IP over HTTPS

Place this block in the separate server’s Caddyfile. Set SUB_ORIGIN_HEADER and SUB_ORIGIN_VALUE in the Caddy service environment using Configure CDN values; keep them private and do not publish expanded configurations. Caddy obtains the public certificate when ACME is reachable; this example does not configure DNS or firewall. Host is explicit for Caddy 2.9/2.10 as well. Origin TLS verification remains enabled; tls_insecure_skip_verify is unnecessary.

```caddyfile
sub.example.net {
    reverse_proxy https://198.51.100.20 {
        header_up Host origin.example.net
        header_up {$SUB_ORIGIN_HEADER} {$SUB_ORIGIN_VALUE}
        transport http {
            tls_server_name origin.example.net
            dial_timeout 5s
            response_header_timeout 30s
        }
    }
}
```

### Nginx: HTTPS with hostname verification

Provide a valid public-domain certificate. Store exactly one proxy_set_header directive with the panel’s individual name/value in private /etc/nginx/private/sub-origin-header.conf. Replace the example pair below. Keep the file outside the webroot and administrator-only; the standard Nginx root master reads it at startup. For an unprivileged deployment, grant reading only to the required service. proxy_pass without a URI preserves paths and queries; certificate verification and SNI are explicit.

```nginx
server {
    listen 443 ssl;
    server_name sub.example.net;
    access_log off;
    ssl_certificate /etc/letsencrypt/live/sub.example.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sub.example.net/privkey.pem;
    location / {
        proxy_pass https://198.51.100.20;
        proxy_http_version 1.1;
        proxy_set_header Host origin.example.net;
        proxy_set_header Connection "";
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        include /etc/nginx/private/sub-origin-header.conf;
        proxy_ssl_server_name on;
        proxy_ssl_name origin.example.net;
        proxy_ssl_verify on;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_cache off;
        proxy_buffering off;
    }
}
```

```nginx
proxy_set_header X-0123456789abcdef01234567 "00000000-0000-4000-8000-000000000001.0000000000000000000000000000000000000000000000000000000000000000";
```

### Verify and diagnose

The example disables Nginx access logging so subscription keys do not enter ordinary request logs. Restrict access to error logs too: they may contain URIs. For verification, enter your test KEY without echo and press Enter; JSON is saved in a separate private directory. Remove it after checking.

Validate with caddy validate --config /etc/caddy/Caddyfile or nginx -t before restricting the origin. In these commands KEY is your private test subscription key; keep it out of public logs. The first --resolve command verifies the IP, SNI and certificate without origin DNS lookup; it does not bypass access policy. Once CDN only is enabled, direct requests without the signed header should return 403. The second command checks the proxy. Test the base URL with each supported application’s real User-Agent too. Obtain actual DAT URLs from the Routing header and download both files and checksums; an invented /geofiles/test.dat is not a valid check. DAT-only 404: check /geofiles forwarding and origin page version. 403: check policy and the CDN header pair. 502/504: check origin connectivity, TLS and logs. Do not use unlimited timeouts.

```bash
umask 077
CHECK_DIR=$(mktemp -d)
IFS= read -r -s KEY
curl --fail --silent --show-error --resolve origin.example.net:443:198.51.100.20 "https://origin.example.net/${KEY}/json" -H 'User-Agent: INCY/2.6.2/ios' -o "$CHECK_DIR/origin.json"
curl --fail --silent --show-error "https://sub.example.net/${KEY}/json" -H 'User-Agent: INCY/2.6.2/ios' -o "$CHECK_DIR/proxy.json"
```

### Restrict the origin and protect secrets

After successful checks, enable CDN only on the primary: the correct signed pair permits origin requests. Redirect to CDN sends clients a 307; Closed denies the entire family including CDNs. These are different modes. The last primary cannot be fully closed. For network isolation, separately allow origin HTTPS only from proxy/CDN IPs while retaining SSH, management API and certificate issuance/renewal; check the hosting firewall too. Across a private protected network, HTTP can go directly to the page port with the public-domain Host instead of origin HTTPS; never expose that port publicly or send credentials over public HTTP. The CDN header is not an API token and does not erase origin IPs from DNS/history. Private addresses, Authorization and CDN secrets must not appear in response bodies, Location headers, response headers or webroots.

[Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) · [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)

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

### Reading private settings through the API

Node API responses exclude raw inbound settings and private keys. Use the profile API with the appropriate permission to read configuration. Updating a profile requires update permission and config-profiles:get; updating a template requires update permission and subscription-template:get because the response contains stored content. Matching :read, :* or * scopes also permit reading. Without read access, the request is rejected before changing data. Updating, enabling, disabling or extending users, resetting their traffic and revoking subscriptions also require users:by-id. Updating an external squad requires external-squads:get; reordering requires external-squads:list. Matching :read and :* grants also apply. Creating a user does not require reading existing keys. Administrator sessions keep their existing behavior.

### User-management bots and permanent access

The Users preset permits creating and editing users, freezing and resuming subscriptions, resetting traffic, obtaining keys and links, and bulk operations. HWID management and access to squad and domain catalogs are selected separately. It does not grant panel settings, servers, backups or token administration.

When creating a token, select No expiration if it should remain valid until revoked. Deleting the token revokes access; permission changes affect subsequent requests. Editing the name and permissions preserves the token value and expiry. To change its lifetime, create a replacement and delete the old token after checking it.

Use the separate minimal subscription-page preset for a subscription website. Add username lookup only for enabled Marzban legacy-link compatibility. Store the token on the website server, not in public links or browser code.

### Fields and controls

- **API tokens**: Manage your API access tokens for programmatic access.
- **No expiration**: Valid until deleted. Permission changes take effect immediately.

## Language and appearance

### Interface preferences

Choose the panel language and a comfortable appearance: light or dark theme, accent color, font, density and navigation style. These settings change the interface presentation.

### Reducing motion

Enable “Reduce motion” if you prefer a calmer interface. The panel also respects the equivalent device setting.

### Updating from the panel

The update dialog shows the current stage out of eight, stage completion percentage, elapsed time, remaining stages and the 24 most recent events. The technical-log button downloads a text .log containing up to 1 MiB of recent data; a truncated file includes a notice. The full log stays in a private server directory. Remaining time is estimated from a previous successful update; without history, the remaining stage count is shown. During a panel restart, the dialog retains its last state and waits for reconnection.

### Appearance reset

Reset in theme settings restores the default theme, accent, font, interface density and motion setting. Changes apply immediately and are saved in this browser.

### Theme settings

Open the palette in the header. Checkmarks identify the selected theme and accent, and the current accent name appears above the palette. Choose a font from the list; interface density and motion have switches below. Changes apply immediately and are saved in this browser; no separate Save button is needed. Reset restores the default theme, accent, font, density and motion.

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

Choose “Support the project” in the documentation contents to open the addresses page directly. It is also available in the additional options menu. The page lists Gram on TON, Solana, TRC20 on TRON, Litecoin, Ethereum and Bitcoin addresses. Find the required network in the list and click Copy. Check the full address in your wallet before sending; the currency and network must match the selected network.

### How the page works

Copy places the address on the clipboard. The panel does not connect a wallet, sign or send a transfer, charge funds or create a subscription. The Telegram link opens contact with the project author for questions and suggestions.
