# Operations and connection-time selection

Autoselect separates two independent selections: **recipients** get a template; **pool members** are possible destinations. Neither selection grants a user access to another host. The Xray `all` pool delivers all eligible members, and its running balancer chooses destinations for new connections. `random` and `group` are legacy subscription-generation sampling modes. The connection-selection action converts them to `all` without changing the routing strategy. Native application formats use their own group behavior; a manual selector is not automatic.

## Stable TCP entry

In the template's Autoselect tab, expand **Stable entry**, select a gateway node, one subscription host and the ordered backend nodes assigned to that host. Set the same public port as the host, select priority / round robin / least connections, review the requirements and apply through the existing SSH terminal. Admin authentication, host-key verification and browser-held SSH credentials remain required.

Before applying, point the host's stable DNS name at the gateway. Every backend must serve that **same host**, inbound and credentials. The server rechecks membership, active/applied ports and gateway port conflicts at apply time. Backend node DNS is resolved to an IP when applying; repeat the operation after node-address changes. The frontend does not change DNS records or save the template draft as a side effect.

The verified installer creates only `/etc/remnacust-entry/haproxy.cfg` and the dedicated `remnacust-entry.service`. It parses the candidate before replacing the live file and restores the previous configuration if apply fails. Subsequent applies reload HAProxy; they do not restart Xray. A source IP guard on the backend must allow the gateway's actual egress IP.

The client keeps the same host, address, port and keys. TCP health checks run every two seconds with two failures/successes to change health. Priority selects the first healthy backend; backup order follows the form. Existing connections are not migrated; graceful reload retains them until completion or the one-hour hard-stop limit. A reachable TCP port is not proof of successful VPN authentication. TLS/Reality terminates on the backend, so its certificate and keys must remain compatible with the public host. Backends see the gateway's IP; IP-based limits and source routing must account for that. UDP transports are not supported by this TCP entry.

The standalone installer equivalent is:

```sh
bash installer.sh configure-entry-node --entry-config entry.json --yes
```

```json
{"listenPort":443,"strategy":"priority","backends":[{"address":"192.0.2.11","port":8443},{"address":"192.0.2.12","port":8443}]}
```

Reference: [HAProxy 2.8 configuration manual](https://docs.haproxy.org/2.8/configuration.html).

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

Network tests run in isolated Linux network namespaces, without altering the host or production firewall:

```sh
sudo python3 ../Remnacust-installer/tests/test_node_firewall.py --network
sudo python3 ../Remnacust-installer/tests/test_stable_entry.py --network
```

They exercise real nftables input/forward filtering, preserved SSH and outbound replies, and actual HAProxy connection selection, priority failover and graceful reload. Backend tests cover host membership, current TCP plans, source/port validation, shell injection, reviewed apply and read-only subscription preview. Redis tests cover leases, retries and stale ACKs.
