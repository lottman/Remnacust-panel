# Operations and connection-time selection

Autoselect separates two independent selections: **recipients** get a template; **pool members** are possible destinations. Neither selection grants a user access to another host. The Xray `all` pool delivers all eligible members, and its running balancer chooses destinations for new connections. `random` and `group` are legacy subscription-generation sampling modes. The connection-selection action converts them to `all` without changing the routing strategy. Native application formats use their own group behavior; a manual selector is not automatic.

## Assigning a specific autoselect

The Autoselect tab groups each selection with its source pools and strategy. **Where to use autoselect** binds recipient hosts or tags to a specific balancer using `remnawave.assignments: [{ balancerTag, hosts, tags }]`. Direct host matches take precedence over tag matches. The host card's explicit template retains priority, and its matching assignment selects the default balancer within that template. Domain rules, DIRECT and REJECT remain in place. Existing `remnawave.assignTo` remains readable; the UI asks which selection it belongs to when editing it.

Pool errors identify the pool and a zero-based JSON path; clicking the path reveals the field in the code editor. Distinct prefixes such as `g` and `g-ru` are allowed. Identical prefixes and collisions with generated tags such as `g-2` must be corrected. Invalid code remains saveable as a draft and does not replace the active subscription.

Xray leastLoad `tolerance` is a failed-probe fraction: 0.01 means 1%, and 1 means 100%. It is not the number of servers. Finite values outside that range follow Xray's clamp behavior and are saved with a warning.

Source membership is refreshed with the subscription; the client chooses among delivered members for each new connection. The separate HAProxy stable-entry workflow and installer command have been removed. Existing user-managed infrastructure is not stopped by a source update.

## Template copies and editing

Every editable subscription format has **Duplicate template** in its card menu. Creation copies the active content, draft, tags and shared geofile references in one database operation. Recipient assignments are cleared in the copy. API callers need both create and read access to copy an existing template.

Changes are collapsed into one review panel. Autoselects open individually; connection probes and additional settings are grouped below them. Geofiles use a shared library and a separate upload section with computer/link sources. Save actions stay visible while scrolling.

The system update journal follows new events, including when the retained event window is full. Scrolling up pauses following until the reader returns to the bottom. A new update starts following again.

## Node source guard

For a fresh node, `--panel-ip IP[/CIDR]` restricts **all incoming ports and echo ping** to the main server, except TCP SSH (22, the current SSH server port and ports discovered through `sshd -T`). Direct VPN clients must therefore enter through the main server. Docker forwarding is filtered too. Existing provider/UFW rules can still deny a connection: this feature never opens an upstream firewall or flushes another ruleset. Outgoing reply traffic, Docker-originated traffic and necessary IPv6 control traffic are preserved. Reapply the guard after manually adding new Docker bridges.

The owned nftables table is `inet remnacust_node_guard`; the boot service restores it. Uninstalling a container does not remove this host security policy. To remove only this guard:

```sh
python3 /etc/remnacust-node-firewall/guard.py remove
```

HTTP-01 renewal from the public internet is incompatible with this strict source policy. Use DNS-01 or externally managed certificates. Never deploy this policy to an existing node without checking its gateway egress and SSH ports.

## Diagnostics, reviewed apply and device preview

Node diagnostics issue a real mTLS request to the registered node. Results distinguish management transport, Xray, user synchronization and configuration application. They do not claim a complete client VPN test. Disabled nodes are not contacted, manual requests are rate limited, and transport errors are classified without returning private node exception text.

Port changes use preview hashes and optimistic revisions. The confirmation endpoint rejects a changed profile or revision. Node ACK determines success, and rollback restores a previously applied snapshot against the current revision. Legacy programmatic save remains available for API compatibility.

Incident confirmation requires three observations over 20 seconds; recovery needs two over 10 seconds. Redis serializes observations and leases pending notifications. Failed notification handoffs remain pending for another worker; normal repeats and stale observations are ignored. Delivery to multiple sinks is at-least-once after transport failure, not an exactly-once guarantee. Maintenance suppresses notifications, not health checks.

The device preview accepts only an existing registered device and executes production response rules and generators without registering the device, creating access identities or writing subscription history. Candidate hosts are labeled as candidates because generators perform final filtering. Configuration containing credentials is opt-in, private, no-store and limited to 2 MiB.

## Validation

### Backup inspection and template warnings

Panel backup ZIP files use AES password protection. After extraction, `database.dump` is a compressed PostgreSQL custom-format dump (`pg_dump --format=custom`), without another encryption layer. To inspect SQL without restoring a database, use PostgreSQL tools of the same major version as the dump producer or newer:

```sh
pg_restore --list database.dump
pg_restore --file=database.sql database.dump
```

The template editor preserves a finite numeric `leastLoad` tolerance in the saved template and subscription JSON. Xray clamps it internally when building the router settings; it does not rewrite the JSON. `0.01` means a 1% failed-probe threshold, `1` means 100%, and `0` disables this check. A saved value of `2` therefore remains `2` in the JSON while the core uses `1`. The editor warning explains that distinction.

Snippet hover previews show the complete snippet JSON, including its array boundaries. Monaco's hover copy action copies that JSON without the introductory documentation or reference name. Ordinary schema documentation continues through the JSON language worker.

Network tests run in isolated Linux network namespaces, without altering the host or production firewall:

```sh
sudo python3 ../Remnacust-installer/tests/test_node_firewall.py --network
```

They exercise real nftables input/forward filtering, preserved SSH and outbound replies, and quota boundary transitions. Backend tests cover host membership, explicit balancer assignments, template copies, source/port validation, shell injection, reviewed apply and read-only subscription preview. Redis tests cover leases, retries and stale ACKs.

# Frozen subscriptions

Freeze a user to pause normal access and retain the exact remaining subscription lifetime. Activation resumes the saved remainder; an exhausted quota or zero remaining lifetime does not grant access. Extending a frozen subscription adds time, and editing its expiry sets the remainder from the time of that edit. Scheduled traffic resets still run. Bulk status changes synchronize device access through the per-user queue. The API reports `frozenAt`, `frozenRemainingMs`, and a projected `expireAt` for frozen users; export/import preserves the remaining duration. A periodic database rewrite is not required.

## Quota tables

The `xera_quota_*` tables hold quota budgets and reservations, node state, usage deliveries, and recovery evidence and decisions. Some are accessed by database functions rather than directly by application code. Do not remove them based only on the object list or an empty current row count: backups, reconciliation and an interrupted recovery may still need them. Consolidation requires a versioned migration, compatibility checks and a tested rollback. Freezing a subscription adds a column to `users`; it does not add another quota table.
