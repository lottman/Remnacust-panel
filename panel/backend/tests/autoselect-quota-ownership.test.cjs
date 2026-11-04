const test = require('node:test'),
    assert = require('node:assert/strict'),
    path = require('node:path');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src/common/host-policy');
const { autoselectRouteUuid, attachAutoselectRoutes, routeDestinations } = load(
    path.join(root, 'autoselect-route-policy.ts'),
);
const { buildPolicyGroups } = load(path.join(root, 'host-policy-scopes.ts'));
const { source: serviceSource } = require('./upstream-filter-fixture.cjs');
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('a conflicting real host or another recipient cannot substitute route credentials', async () => {
    const { HostAccessService } = serviceSource('common/host-policy/host-access.service.ts');
    for (const quotaHostUuid of [undefined, id(2)]) {
        const service = Object.create(HostAccessService.prototype);
        service.policies = {
            scopes: async () => ({
                hosts: [{ uuid: id(3), quotaHostUuid }],
                protectedInboundIds: new Set([id(4)]),
            }),
        };
        service.checkAccess = () => {
            throw Error('a mismatched route reached credential issuance');
        };
        const keys = await service.prepare(
            { id: 1n },
            [{ uuid: id(3), configProfileInboundUuid: id(4) }],
            id(1),
        );
        assert.equal(keys.size, 0);
    }
});
const host = (n, extra = {}) => ({
    uuid: id(n),
    tags: [],
    inboundUuid: id(n + 10),
    inboundTag: 'in-' + n,
    profileUuid: id(n + 20),
    nodes: [],
    boundNodes: [id(n + 30)],
    alwaysAvailable: false,
    onlyWhenInactive: false,
    userLimit: '0',
    trafficMultiplier: null,
    userSpeed: 0,
    deviceSpeed: 0,
    totalSpeed: 0,
    anchor: new Date(0),
    resetValue: 0,
    resetUnit: 'DAY',
    domains: null,
    issued: false,
    ...extra,
});

test('autoselect keys are stable per recipient/source and separate from direct connection identities', () => {
    const first = autoselectRouteUuid(id(1), id(2));
    assert.equal(first, autoselectRouteUuid(id(1).toUpperCase(), id(2).toUpperCase()));
    assert.notEqual(first, autoselectRouteUuid(id(3), id(2)));
    assert.notEqual(first, id(2));
    assert.throws(() => autoselectRouteUuid(id(1), id(1).toUpperCase()), /Invalid/);
    assert.throws(() => autoselectRouteUuid('invalid', id(2)), /Invalid/);
});

test('unlimited autoselect never inherits source host or source tag quotas and speeds', () => {
    const owner = host(1),
        source = host(2, {
            tags: ['PAID'],
            userLimit: '100',
            userSpeed: 50,
            deviceSpeed: 5,
            totalSpeed: 100,
            trafficMultiplier: 2,
        });
    const route = {
        uuid: autoselectRouteUuid(owner.uuid, source.uuid),
        ownerUuid: owner.uuid,
        sourceUuid: source.uuid,
    };
    const hosts = attachAutoselectRoutes([owner, source], [route]),
        alias = hosts[2];
    assert.equal(alias.userLimit, '0');
    assert.equal(alias.userSpeed, 0);
    assert.equal(alias.deviceSpeed, 0);
    assert.equal(alias.totalSpeed, 0);
    assert.equal(alias.trafficMultiplier, null);
    assert.deepEqual(alias.tags, []);
    assert.equal(alias.inboundTag, source.inboundTag);
    assert.deepEqual(alias.boundNodes, source.boundNodes);
    const groups = buildPolicyGroups(hosts, [
        {
            tag: 'PAID',
            userLimit: '100',
            userSpeed: 7,
            deviceSpeed: 3,
            totalSpeed: 100,
            trafficMultiplier: 3,
            anchor: new Date(0),
            resetValue: 0,
            resetUnit: 'DAY',
        },
    ]);
    const attached = groups.filter((group) => group.hostUuids.includes(alias.uuid));
    assert.deepEqual(
        attached.map((group) => group.key),
        ['host:' + owner.uuid],
    );
    assert(
        attached.every(
            (group) =>
                group.userLimit === '0' &&
                !group.userSpeed &&
                !group.deviceSpeed &&
                !group.totalSpeed,
        ),
    );
    assert.equal(groups.find((group) => group.key === 'host:' + source.uuid).userLimit, '100');
    assert.deepEqual(groups.find((group) => group.key === 'tag:PAID').hostUuids, [source.uuid]);
});

test('recipient limits and tag switches are shared by every physical route without multiplying groups', () => {
    const owner = host(1, {
        tags: ['AUTO'],
        userLimit: '500',
        userSpeed: 20,
        deviceSpeed: 4,
        totalSpeed: 40,
        useTagTrafficLimit: false,
    });
    const sources = [
        host(2, { tags: ['PAID'], userLimit: '100' }),
        host(3, { tags: ['PAID'], userLimit: '200' }),
    ];
    const routes = sources.map((source) => ({
        uuid: autoselectRouteUuid(owner.uuid, source.uuid),
        ownerUuid: owner.uuid,
        sourceUuid: source.uuid,
    }));
    const hosts = attachAutoselectRoutes([owner, ...sources], routes),
        groups = buildPolicyGroups(hosts, [
            {
                tag: 'AUTO',
                userLimit: '900',
                userSpeed: 10,
                deviceSpeed: 2,
                totalSpeed: 80,
                trafficMultiplier: 1,
                anchor: new Date(0),
                resetValue: 0,
                resetUnit: 'DAY',
            },
        ]);
    const group = groups.find((group) => group.key === 'host:' + owner.uuid);
    assert.deepEqual(group.hostUuids, [owner.uuid, ...routes.map((route) => route.uuid)]);
    assert.equal(group.userLimit, '500');
    assert.equal(group.userSpeed, 20);
    assert.equal(group.deviceSpeed, 4);
    assert.equal(groups.filter((group) => group.key === 'host:' + owner.uuid).length, 1);
    assert.deepEqual(
        new Set(group.nodeUuids),
        new Set([owner, ...sources].flatMap((host) => host.boundNodes)),
    );
    assert.deepEqual(groups.find((group) => group.key === 'tag:AUTO').hostUuids, []);
    assert.deepEqual(
        groups.find((group) => group.key === 'tag-host:AUTO:' + owner.uuid).hostUuids,
        group.hostUuids,
    );
    assert.equal(attachAutoselectRoutes([owner], routes).length, 1);
    assert.throws(
        () => attachAutoselectRoutes([owner, ...sources], [{ ...routes[0], uuid: id(99) }]),
        /identity conflict/,
    );
});

test('route destination permissions intersect instead of bypassing source or recipient restrictions', () => {
    const allow = (domains) => ({ mode: 'ALLOW_ONLY', domains }),
        deny = (domains) => ({ mode: 'DENY', domains });
    assert.deepEqual(routeDestinations(null, allow(['telegram.org'])), allow(['telegram.org']));
    assert.deepEqual(
        routeDestinations(allow(['example.com']), allow(['api.example.com', 'other.test'])),
        allow(['api.example.com']),
    );
    assert.deepEqual(
        routeDestinations(allow(['192.0.2.0/24']), allow(['192.0.2.128/25'])),
        allow(['192.0.2.128/25']),
    );
    assert.deepEqual(
        routeDestinations(allow(['2001:db8::/32']), allow(['2001:db8:1::/48'])),
        allow(['2001:db8:1::/48']),
    );
    assert.deepEqual(
        routeDestinations(deny(['ads.test']), deny(['malware.test'])),
        deny(['ads.test', 'malware.test']),
    );
    assert.deepEqual(
        routeDestinations(allow(['example.com', 'other.test']), deny(['ads.example.com'])),
        allow(['other.test']),
    );
    assert.deepEqual(
        routeDestinations(allow(['192.0.2.0/24']), allow(['198.51.100.0/24'])),
        allow([]),
    );
});
