const assert = require('node:assert/strict');

module.exports = async ({
    prisma,
    service,
    access,
    usage,
    calls,
    user,
    db,
    transactions,
    DurableUsageService,
    QuotaCoordinatorService,
}) => {
    const owner = '11111111-1111-4111-8111-111111111111';
    const source = '22222222-2222-4222-8222-222222222222';
    const source2 = '33333333-3333-4333-8333-333333333333';
    const owner2 = '44444444-4444-4444-8444-444444444444';
    const inbound = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const profile = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const node = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const compact = (id) => id.replaceAll('-', '');
    const hosts = (ids) => ids.map((uuid) => ({ uuid, configProfileInboundUuid: inbound }));
    await prisma.$executeRawUnsafe('DELETE FROM xera_host_quota_usage WHERE user_id=901');
    await prisma.$executeRawUnsafe(`UPDATE hosts SET only_when_inactive=false,always_available=false,
        traffic_multiplier=1,use_tag_traffic_limit=false,use_tag_speed_limit=false,
        use_tag_device_speed_limit=false,use_tag_total_speed_limit=false,
        total_speed_limit_mbps=0,device_speed_limit_mbps=0,server_speed_limit_mbps=0`);
    for (const id of [source2, owner2]) {
        await prisma.$executeRawUnsafe(
            `INSERT INTO hosts(uuid,remark,address,port,config_profile_uuid,config_profile_inbound_uuid)
            VALUES ($1::uuid,$1,'example.test',443,$2::uuid,$3::uuid)`,
            id,
            profile,
            inbound,
        );
    }
    await prisma.$executeRawUnsafe(
        `UPDATE hosts SET tags=ARRAY['AUTO'],user_traffic_limit_bytes=1000,
        server_speed_limit_mbps=8,device_speed_limit_mbps=2,total_speed_limit_mbps=16 WHERE uuid=$1::uuid`,
        owner,
    );
    await prisma.$executeRawUnsafe(
        `UPDATE hosts SET tags='{}',user_traffic_limit_bytes=0 WHERE uuid=$1::uuid`,
        owner2,
    );
    await prisma.$executeRawUnsafe(
        `UPDATE hosts SET tags=ARRAY['alpha'],user_traffic_limit_bytes=10,
        server_speed_limit_mbps=100,device_speed_limit_mbps=20,use_tag_traffic_limit=true,use_tag_speed_limit=true
        WHERE uuid=ANY($1::uuid[])`,
        [source, source2],
    );
    const first = await access.prepareAutoselect(user, owner, hosts([source, source2]));
    const repeated = await access.prepareAutoselect(user, owner, hosts([source]));
    const other = await access.prepareAutoselect(user, owner2, hosts([source]));
    const direct = await access.prepare(user, hosts([source]));
    await Promise.all(access.preparing.values());
    for (const id of [source, source2]) assert.ok(first.get(id)?.vlessUuid);
    assert.equal(first.get(source).vlessUuid, repeated.get(source).vlessUuid);
    assert.notEqual(first.get(source).vlessUuid, other.get(source).vlessUuid);
    assert.notEqual(first.get(source).vlessUuid, direct.get(source).vlessUuid);
    assert.equal(
        first.get(source).username.split('~h')[0],
        first.get(source2).username.split('~h')[0],
    );
    assert.notEqual(
        first.get(source).username.split('~h')[0],
        other.get(source).username.split('~h')[0],
    );
    const routes = await prisma.$queryRawUnsafe(
        'SELECT uuid,owner_host_uuid,source_host_uuid FROM xera_autoselect_routes',
    );
    const route = (o, s) =>
        routes.find((row) => row.owner_host_uuid === o && row.source_host_uuid === s).uuid;
    const policy = async () => {
        await service.syncNode({ uuid: node });
        return calls.at(-1).policy;
    };
    let wire = await policy();
    const alias = route(owner, source),
        unlimited = route(owner2, source);
    assert.deepEqual(wire.hosts[compact(alias)].groups, ['host:' + owner]);
    assert.deepEqual(wire.hosts[compact(unlimited)].groups, ['host:' + owner2]);
    assert.equal(wire.groups['host:' + owner].bytesPerSecond, 1000000);
    assert.equal(wire.groups['host:' + owner].deviceBytesPerSecond, 250000);
    assert.equal(wire.groups['host:' + owner2].bytesPerSecond, 0);
    assert.equal(wire.groups['host:' + owner2].deviceBytesPerSecond, undefined);
    assert.ok(
        (await access.configIdentities(profile)).some(
            (row) => row.id === first.get(source).username,
        ),
    );
    await usage.record(901n, [
        { username: first.get(source).username, uplink: 100, downlink: 200 },
        { username: first.get(source2).username, uplink: 300, downlink: 100 },
        { username: direct.get(source).username, uplink: 11, downlink: 0 },
        { username: other.get(source).username, uplink: 10000, downlink: 0 },
    ]);
    const total = async (id) =>
        (
            await prisma.$queryRawUnsafe(
                'SELECT coalesce(sum(total_bytes),0)::text AS n FROM xera_host_quota_usage WHERE user_id=901 AND host_uuid=$1::uuid',
                id,
            )
        )[0].n;
    assert.equal(await total(owner), '700');
    assert.equal(await total(source), '11');
    assert.equal(await total(source2), '0');
    assert.equal(await total(owner2), '10000');
    wire = await policy();
    assert.equal(wire.groups['host:' + source].blockedOwners['901'], true);
    assert.equal(wire.groups['host:' + owner].blockedOwners['901'], undefined);
    assert.equal(wire.groups['host:' + owner2].blockedOwners['901'], undefined);
    await usage.record(901n, [{ username: first.get(source2).username, uplink: 301, downlink: 0 }]);
    wire = await policy();
    assert.equal(wire.groups['host:' + owner].blockedOwners['901'], true);
    assert.equal(wire.groups['host:' + owner2].blockedOwners['901'], undefined);
    const allowed = async (id, parent = user.vlessUuid) =>
        (
            await prisma.$queryRawUnsafe(
                'SELECT xera_subscription_identity_allowed(901,$1::uuid,NULL,$2::uuid) AS allowed',
                id,
                parent,
            )
        )[0].allowed;
    assert.equal(await allowed(alias), true);
    assert.equal(await allowed(alias, 'ffffffff-ffff-4fff-8fff-ffffffffffff'), false);
    for (const hwid of ['route-device-a', 'route-device-b'])
        await prisma.$executeRawUnsafe(
            'INSERT INTO hwid_user_devices(user_id,hwid) VALUES(901,$1)',
            hwid,
        );
    try {
        const devices = [];
        for (const hwid of ['route-device-a', 'route-device-b']) {
            const deviceUser = {
                ...user,
                hostIdentityContext: { hwid, parentVlessUuid: user.vlessUuid },
            };
            devices.push(
                (await access.prepareAutoselect(deviceUser, owner, hosts([source]))).get(source),
            );
        }
        await Promise.all(access.preparing.values());
        assert.notEqual(devices[0].vlessUuid, devices[1].vlessUuid);
        assert.notEqual(devices[0].username.split('~h')[0], devices[1].username.split('~h')[0]);
        await prisma.$executeRawUnsafe(
            "UPDATE hwid_user_devices SET blocked=true WHERE user_id=901 AND hwid='route-device-a'",
        );
        const deviceAllowed = async (hwid) =>
            (
                await prisma.$queryRawUnsafe(
                    'SELECT xera_subscription_identity_allowed(901,$1::uuid,$2,$3::uuid) AS allowed',
                    alias,
                    hwid,
                    user.vlessUuid,
                )
            )[0].allowed;
        assert.equal(await deviceAllowed('route-device-a'), false);
        assert.equal(await deviceAllowed('route-device-b'), true);
        const configured = await access.configIdentities(profile);
        assert.ok(!configured.some((identity) => identity.id === devices[0].username));
        assert.ok(configured.some((identity) => identity.id === devices[1].username));
    } finally {
        await prisma.$executeRawUnsafe(
            "DELETE FROM hwid_user_devices WHERE user_id=901 AND hwid IN('route-device-a','route-device-b')",
        );
    }
    await prisma.$executeRawUnsafe('UPDATE hosts SET is_disabled=true WHERE uuid=$1::uuid', source);
    assert.equal(await allowed(alias), false);
    assert.equal(await allowed(unlimited), false);
    await prisma.$executeRawUnsafe(
        'UPDATE hosts SET is_disabled=false WHERE uuid=$1::uuid',
        source,
    );
    await prisma.$executeRawUnsafe('UPDATE hosts SET is_disabled=true WHERE uuid=$1::uuid', owner);
    assert.equal(await allowed(alias), false);
    assert.equal(await allowed(unlimited), true);
    await prisma.$executeRawUnsafe('UPDATE hosts SET is_disabled=false WHERE uuid=$1::uuid', owner);
    await prisma.$executeRawUnsafe("UPDATE users SET status='FROZEN',frozen_until=(statement_timestamp() AT TIME ZONE 'UTC')+interval '1 day' WHERE id=901");
    assert.equal(await allowed(alias), false);
    await prisma.$executeRawUnsafe("UPDATE users SET status='ACTIVE' WHERE id=901");
    await prisma.$executeRawUnsafe(
        'INSERT INTO user_traffic(id) VALUES(901) ON CONFLICT DO NOTHING',
    );
    const beforeGlobal = (
        await prisma.$queryRawUnsafe('SELECT used_traffic_bytes FROM user_traffic WHERE id=901')
    )[0].used_traffic_bytes;
    const durable = new DurableUsageService(db, {}, transactions, {
        getOrThrow: (key) => (key === 'USER_USAGE_IGNORE_BELOW_BYTES' ? 0n : false),
    });
    await transactions.withTransaction({}, () =>
        durable.applySnapshot(
            { nodeId: 901n, nodeUuid: node },
            { requestedAt: new Date(), multiplier: '1000000000' },
            [first.get(source), first.get(source2)].map((key) => ({
                name: `user>>>${key.username}>>>traffic>>>uplink`,
                value: '20',
            })),
            String(Date.now()),
        ),
    );
    assert.equal(await total(owner), '1041');
    assert.equal(await total(source), '11');
    await prisma.$executeRawUnsafe(
        'UPDATE hosts SET traffic_multiplier=2 WHERE uuid=$1::uuid',
        owner,
    );
    await prisma.$executeRawUnsafe(
        'UPDATE hosts SET traffic_multiplier=3 WHERE uuid=$1::uuid',
        source,
    );
    assert.equal(
        (
            await prisma.$queryRawUnsafe(
                "SELECT used_bytes FROM xera_limit_state('HOST',$1,901)",
                owner,
            )
        )[0].used_bytes,
        2082n,
    );
    assert.equal(
        (
            await prisma.$queryRawUnsafe(
                "SELECT used_bytes FROM xera_limit_state('HOST',$1,901)",
                source,
            )
        )[0].used_bytes,
        33n,
    );
    await prisma.$executeRawUnsafe(
        'UPDATE hosts SET traffic_multiplier=1 WHERE uuid=ANY($1::uuid[])',
        [owner, source],
    );
    assert.equal(
        (
            await prisma.$queryRawUnsafe('SELECT used_traffic_bytes FROM user_traffic WHERE id=901')
        )[0].used_traffic_bytes,
        beforeGlobal + 40n,
    );
    const node2 = '99999999-9999-4999-8999-999999999999';
    const inbound2 = '88888888-8888-4888-8888-888888888888';
    await prisma.$executeRawUnsafe(
        `INSERT INTO nodes(id,uuid,name,address) VALUES(999,$1::uuid,'route-source','127.0.0.2')`,
        node2,
    );
    try {
        await prisma.$executeRawUnsafe(
            `INSERT INTO config_profile_inbounds(uuid,profile_uuid,tag,type,raw_inbound)
            VALUES($1::uuid,$2::uuid,'source-only','vless','{"protocol":"vless","tag":"source-only"}')`,
            inbound2,
            profile,
        );
        await prisma.$executeRawUnsafe(
            'INSERT INTO config_profile_inbounds_to_nodes(config_profile_inbound_uuid,node_uuid) VALUES($1::uuid,$2::uuid)',
            inbound2,
            node2,
        );
        await prisma.$executeRawUnsafe(
            `INSERT INTO internal_squad_inbounds(internal_squad_uuid,inbound_uuid)
            VALUES('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$1::uuid)`,
            inbound2,
        );
        await prisma.$executeRawUnsafe(
            'UPDATE hosts SET config_profile_inbound_uuid=$1::uuid WHERE uuid=$2::uuid',
            inbound2,
            source2,
        );
        await prisma.$executeRawUnsafe(
            `UPDATE hosts SET tags='{}',user_traffic_limit_bytes=0,server_speed_limit_mbps=0,
            device_speed_limit_mbps=0,total_speed_limit_mbps=0 WHERE uuid=$1::uuid`,
            source2,
        );
        await service.syncNode({ uuid: node2 });
        assert.deepEqual(
            calls.at(-1).policy.protectedInbounds,
            [],
            'routing alone must not revoke existing direct keys on an unrestricted inbound',
        );
        assert.ok(
            calls.at(-1).policy.hosts[compact(route(owner, source2))].allowedIdentities[
                first.get(source2).username
            ],
        );
        const repeatedOnUnprotected = await access.prepareAutoselect(user, owner, [
            { uuid: source2, configProfileInboundUuid: inbound2 },
        ]);
        assert.equal(repeatedOnUnprotected.get(source2).vlessUuid, first.get(source2).vlessUuid);
        await Promise.all(access.preparing.values());
        const coordinator = Object.create(QuotaCoordinatorService.prototype);
        const targets = [];
        coordinator.db = db;
        coordinator.transitions = {
            reconcile: async (target) => {
                targets.push(target);
                return false;
            },
        };
        coordinator.write = async () => {};
        coordinator.policies = { requestSync() {} };
        await coordinator.fund(
            'probe',
            { cursor: '0', phase: 'ACTIVE' },
            [node, node2].map((uuid) => ({
                uuid,
                instance: uuid,
                drained: true,
                legacyDrained: true,
            })),
        );
        assert.ok(
            targets
                .find(
                    (target) =>
                        target.kind === 'HOST' && target.key === owner && target.owner === '901',
                )
                .nodes.includes(node2),
            'recipient credit must reach the actual source node, even without its own inbound there',
        );
        assert.ok(!targets.some((target) => target.kind === 'HOST' && target.key === owner2));
    } finally {
        await prisma.$executeRawUnsafe('DELETE FROM nodes WHERE id=999');
    }
    await prisma.$executeRawUnsafe('DELETE FROM hosts WHERE uuid=$1::uuid', source2);
    await usage.record(901n, [{ username: first.get(source2).username, uplink: 7, downlink: 0 }]);
    assert.equal(
        await total(owner),
        '1048',
        'late usage keeps its recipient after a source is deleted',
    );
    assert.equal(await allowed(route(owner, source2)), false);
    await prisma.$executeRawUnsafe(
        `INSERT INTO hosts(uuid,remark,address,port,config_profile_uuid,config_profile_inbound_uuid)
        VALUES($1::uuid,'restored source','example.test',443,$2::uuid,$3::uuid)`,
        source2,
        profile,
        inbound,
    );
    const restored = await access.prepareAutoselect(user, owner, hosts([source2]));
    assert.equal(restored.get(source2).vlessUuid, first.get(source2).vlessUuid);
    await Promise.all(access.preparing.values());
    assert.equal(await allowed(route(owner, source2)), true);
    console.log(
        'PASS: real SQL recipient quotas/speeds, direct-source isolation, independent recipients, revocation and delayed route usage',
    );
};
