# Operating the panel and nodes

Use node status, the time of its last observation and a client connection together when checking a change. Saving settings confirms that the panel accepted them; successful application must also be confirmed by the node.

## Control addresses and proxy

Open the node form's **IP addresses** list. It accepts up to **65 unique IPv4 addresses, IPv6 addresses or hostnames**, including disabled entries. Enter the address without a scheme, port or path; every entry uses the node's separately configured API port.

Enable an address to allow panel control through it. Arrows set priority, with the first enabled entry preferred. Saved addresses cannot be edited or deleted: disable an obsolete address and add the correct one. A new unsaved row can be discarded. Disabling every address makes control unavailable.

After upgrading, the previous primary and MANAGEMENT/RESERVE addresses are enabled. Other known IPs are retained but disabled. Confirm that an address belongs to the same node before enabling it.

The panel tries enabled fallback addresses in list order. The node card shows the current control address and the last check result. A ping reply or open TCP port does not confirm a working authenticated node connection. Control failover does not migrate existing user VPN connections.

**Proxy URL** affects only panel-to-node control. A configured SOCKS5 proxy applies to every fallback address. Proxy failure is shown as an error; there is no automatic direct bypass. To select a direct connection, explicitly clear the setting and save the form.

The proxy column indicates whether a proxy is configured, not whether it is healthy. Credentials remain masked in the editor. Keep proxy credentials private and use a trusted proxy over a protected network; standard SOCKS5 username/password authentication does not encrypt its own handshake.

## Diagnostics and applying changes

Node diagnostics distinguish the control connection, running Xray, user synchronization and configuration application. They do not verify the full client VPN path. Disabled nodes are not contacted; manual checks are rate limited.

For port changes, review the proposed result and confirm it. If settings changed after review, obtain a fresh preview. A queued operation is still pending until the node confirms application. On failure, inspect the error before restoring a previously applied configuration.

A connected node API with a stopped core is not a working VPN node. Missing telemetry is unknown rather than zero. If required host policies cannot be applied, the previous working configuration remains and configured restrictions stay enabled. Update the agent and running core together when the node reports missing capabilities.

Node-image updates can preserve a previously selected managed core. Check the running version separately and update Core when needed.

## Connection selection

Recipients receive a template; pool members are possible destinations. Neither selection grants access to another host. Pool membership refreshes with the subscription, while the client selects a server for new connections.

| Strategy | Behavior |
| --- | --- |
| Lowest response time | Selects using HTTP response time through each pool member |
| Distribute connections | Rotates new connections among available members; it does not measure server CPU or bandwidth |
| Priority: first available | Uses the first working member in the configured order |
| Manual selection | Lets the user select a member in the client |

Xray connection distribution uses roundRobin and HTTP observations. With no working member and no explicit custom fallback, traffic is blocked. An explicit fallback remains in effect. Mihomo, Clash and Stash use load-balance with round-robin. sing-box explicitly uses urltest instead; this is response-time selection and provides no round-robin distribution.

Existing streams keep their server. Equal connection counts do not guarantee equal byte volumes. A blocked probe website can exclude a server that could reach other destinations; choose a small response reachable through the entire pool.

Host assignments take precedence over tag assignments. A host's explicit template also retains priority. Keep domain rules, DIRECT and REJECT settings consistent with the intended access policy. See [autoselect](XRAY-AUTOSELECT.md).

## Template editing

The selected template opens independently of the host list. Text editing can continue while hosts load. Host selection and host hints require the host list; retry its request before changing a pool if it failed. Failure to load the template itself shows an error and must not be treated as an empty template.

A duplicate copies template content, draft, tags and geofile references, while clearing recipient assignments. Review the copy before assigning it to users.

Invalid JSON/YAML and incomplete selections can be saved as drafts. A draft with errors does not replace the active subscription. History retains the last 30 versions. Open an older version in the editor, inspect the difference and save to apply it; saving creates a new version.

After saving, fetch a test subscription and refresh it in the actual client. Updating the panel alone does not refresh a profile already imported into an application.

## Storage and response time

Reliable storage needs enough free space, read/write capacity and durable writes. Network-backed block storage can be used when it meets those requirements.

Compare subscription response time, disk load, CPU and memory after startup and during concurrent refreshes. Cache warming can explain improvement after startup, but does not establish that persistent delays are resolved. Keep the database and its files intact while investigating. See [database operation](DATABASE-COMPATIBILITY.md).

## Freezing subscriptions

Freeze pauses normal access and preserves remaining subscription lifetime. Set a future automatic resume date before saving. The saved date is read-only during that freeze; an older frozen account without a deadline can receive one.

Manual activation resumes the remaining lifetime immediately. Automatic activation uses the scheduled deadline, including after panel downtime. Exhausted quota or lifetime does not grant access. Traffic resets do not unfreeze the account.

Deleting a registered device frees its registration slot. If new registration is allowed, it can register again. Use device blocking for a persistent prohibition. A disconnected node receives revocation when it reconnects; verify application when immediate revocation matters.

## Updates and logs

Panel updates show stages, elapsed time and retained events. Remaining-time estimates require timing history. Closing the page does not cancel an update. Check the final result after the panel reconnects.

Use the technical-log download for a **.log** file. The download retains the latest **1 MiB** with a truncation notice when needed; the complete original remains in the private server log directory until replaced. Keep local copies private and remove sensitive data before sharing them.

Installer logs are under /opt/remnacust/logs/. A subsequent operation can replace the previous component log, so save it before retrying. Interactive system-package questions require SSH. A panel-initiated component update can defer package maintenance and record a notice; complete that maintenance separately. The server is not rebooted automatically.

See [installation](INSTALLER.md), [updates and node health](UPDATE-PROGRESS-AND-NODE-HEALTH.md), [backups](BACKUPS.md) and [node autonomy](NODE-AUTONOMY.md).

## Restricted node access

A node installed with a main-server source restriction accepts incoming ports and echo ping only from that source, except configured SSH access. Direct VPN clients must reach it through the intended gateway. Docker forwarding is covered; provider and existing firewall rules can still deny traffic.

This restriction prevents public HTTP-01 renewal. Use the certificate method appropriate to that deployment and confirm SSH access before enabling it. Removing the container does not remove the host firewall policy. See the installer documentation before changing the guard.

Technical API contracts and source checks for contributors are separate: [API](API.md) and [building](BUILDING.md).
