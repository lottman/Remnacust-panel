const assert = require('node:assert/strict');

module.exports = async function ({ prisma, service, access, cache, axios, calls }) {
    const native = { uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccd', address: '127.0.0.2', port: 2222, proxyUrl: null };
    const modern = { uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', address: '127.0.0.1', port: 2222, proxyUrl: null };
    const profile = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const shared = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const isolated = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc';
    const host = '11111111-1111-4111-8111-111111111111';
    const isolatedHost = '11111111-1111-4111-8111-111111111112';
    const original = axios.hostPolicy;
    const health = axios.getNodeHealth;
    const cacheKeys = [];
    const originalSet = cache.set;
    cache.set = async (key, value, ttl) => { if (key.includes(native.uuid)) cacheKeys.push(key); return originalSet(key, value, ttl); };
    axios.getNodeHealth = async node => ({ isOk: true, response: { nodeVersion: node.uuid === native.uuid ? '3.4.3' : '1.1.26', isAlive: true, xrayInternalStatusCached: true } });
    axios.hostPolicy = async (node, policy, ...rest) => {
        if (node.uuid !== native.uuid) return original(node, policy, ...rest);
        assert.equal(policy, undefined, 'never send custom policies to a native node');
        return { isOk: false, code: 'NODE_HTTP_404' };
    };
    try {
        await prisma.$executeRaw`INSERT INTO nodes(id,uuid,name,address,port,is_connected) VALUES(903,${native.uuid}::uuid,'native-test','127.0.0.2',2222,true)`;
        await prisma.$executeRaw`INSERT INTO config_profile_inbounds_to_nodes VALUES(${shared}::uuid,${native.uuid}::uuid)`;
        await cache.set('node_versions:' + native.uuid, { node: '3.4.3' });
        await service.syncNode(native);
        await prisma.$executeRaw`UPDATE hosts SET user_traffic_limit_bytes=100,server_speed_limit_mbps=7,
            domain_rules='{"mode":"ALLOW_ONLY","domains":["domain:telegram.org"]}'::jsonb WHERE uuid=${host}::uuid`;
        service.legacyInventory = undefined;
        const snapshot = await service.scopes();
        assert(snapshot.legacyInboundIds.has(shared));
        assert(!snapshot.protectedInboundIds.has(shared));
        assert.equal(snapshot.groups.length, 0);
        await service.syncNode(native);
        await service.syncNode(modern);
        assert.deepEqual(calls.at(-1).policy.hosts, {}, 'custom peer uses the same baseline keys on a shared native inbound');
        const active = { id: 901n, status: 'ACTIVE', expireAt: new Date(Date.now() + 86400000), vlessUuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
        assert.equal((await access.prepare(active, [{ uuid: host, configProfileInboundUuid: shared }])).size, 0);
        for (const status of ['FROZEN','EXPIRED','DISABLED','LIMITED']) {
            const value = await access.prepare({ ...active, status }, [{ uuid: host, configProfileInboundUuid: shared }]);
            assert.equal(value.get(host), null, status + ' cannot fall back to unrestricted baseline keys');
        }
        await prisma.$executeRaw`INSERT INTO config_profile_inbounds(uuid,profile_uuid,tag,type,raw_inbound)
            VALUES(${isolated}::uuid,${profile}::uuid,'isolated','vless','{"protocol":"vless","tag":"isolated"}')`;
        await prisma.$executeRaw`INSERT INTO config_profile_inbounds_to_nodes VALUES(${isolated}::uuid,${modern.uuid}::uuid)`;
        await prisma.$executeRaw`INSERT INTO hosts(uuid,remark,address,port,config_profile_uuid,config_profile_inbound_uuid,user_traffic_limit_bytes)
            VALUES(${isolatedHost}::uuid,'isolated','example.invalid',443,${profile}::uuid,${isolated}::uuid,100)`;
        service.legacyInventory = undefined;
        const mixed = await service.scopes();
        assert(mixed.protectedInboundIds.has(isolated));
        assert(!mixed.protectedInboundIds.has(shared));
        await service.syncNode(modern);
        assert.deepEqual(calls.at(-1).policy.protectedInbounds, ['isolated']);
        assert.equal(await service.routedIdentitySupport([host]), false);
        console.log('PASS mixed native/custom fleet: baseline keys remain usable; isolated extensions stay enforced; inactive native grants remain closed');
    } finally {
        axios.hostPolicy = original;
        axios.getNodeHealth = health;
        cache.set = originalSet;
        for (const key of cacheKeys) await cache.del(key);
        await prisma.$executeRaw`DELETE FROM hosts WHERE uuid=${isolatedHost}::uuid`;
        await prisma.$executeRaw`DELETE FROM config_profile_inbounds WHERE uuid=${isolated}::uuid`;
        await prisma.$executeRaw`DELETE FROM nodes WHERE uuid=${native.uuid}::uuid`;
        await prisma.$executeRaw`UPDATE hosts SET user_traffic_limit_bytes=NULL,server_speed_limit_mbps=NULL,domain_rules=NULL WHERE uuid=${host}::uuid`;
        service.legacyInventory = undefined;
    }
};
