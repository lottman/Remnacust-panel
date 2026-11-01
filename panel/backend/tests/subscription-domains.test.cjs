const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const load = require('./load-typescript.cjs');
const { SubscriptionDomainInputSchema, MAX_CDN_PER_PRIMARY } = load(
    path.join(__dirname, '../libs/contract/models/subscription-domain.schema.ts'),
);
const { publicGeofileOrigin } = load(
    path.join(__dirname, '../src/common/utils/public-geofile-origin.ts'),
);
const { SubscriptionDomainsService } = load(
    path.join(__dirname, '../src/modules/subscription-domains/subscription-domains.service.ts'),
    {
        '@common/config/app-config': {},
        '@common/database/prisma.service': {},
        '@common/utils/public-geofile-origin': { publicGeofileOrigin },
        '@libs/contracts/models/subscription-domain.schema': { SubscriptionDomainInputSchema, MAX_CDN_PER_PRIMARY },
    },
);

const primaryId = '01234567-89ab-4def-8123-456789abcdef';

test('domain API computes stable individual request header names only for CDN records', async () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const rows = [
        { uuid: primaryId, domain: 'sub.example.test', path: '', kind: 'PRIMARY', _count: { users: 0, aliases: 1 } },
        { uuid, domain: 'cdn.example.test', path: '', kind: 'CDN', _count: { users: 0, aliases: 0 } },
    ];
    const service = new SubscriptionDomainsService(
        { subscriptionDomains: { findMany: async () => rows } },
        { getOrThrow: () => 'sub.example.test' },
    );
    const list = await service.list();
    assert.equal(list[0].requestHeaderName, null);
    assert.equal(list[1].requestHeaderName, 'X-d9f142b3f4d53ae2399cf5b5');
    assert.equal((await service.list())[1].requestHeaderName, list[1].requestHeaderName);
});

test('hostname-only configuration bootstraps a default UUID and safe fallback', async () => {
    let created;
    const service = new SubscriptionDomainsService(
        {
            $transaction: async (action) =>
                action({
                    $executeRawUnsafe: async () => {},
                    subscriptionDomains: {
                        count: async () => 0,
                        create: async ({ data }) => {
                            created = data;
                            return { uuid: primaryId, ...data };
                        },
                    },
                }),
            subscriptionDomains: { findMany: async () => [] },
        },
        { getOrThrow: () => 'sub.example.test' },
    );
    await service.onModuleInit();
    assert.equal(created.domain, 'sub.example.test');
    assert.equal(created.path, '');
    assert.equal(created.isDefault, true);
    assert.equal(await service.resolveOrigin('https://evil.test'), 'https://sub.example.test');
});

test('an in-flight registry read cannot repopulate cache after a committed domain change', async () => {
    let finish;
    let reads = 0;
    const service = new SubscriptionDomainsService(
        {
            subscriptionDomains: {
                findMany: () => {
                    reads++;
                    return reads === 1
                        ? new Promise((resolve) => {
                              finish = resolve;
                          })
                        : Promise.resolve([
                              { domain: 'new.example.test', path: '', isDefault: true },
                          ]);
                },
            },
        },
        { getOrThrow: () => 'sub.example.test' },
    );
    const old = service.resolveOrigin(undefined);
    service.invalidate();
    assert.equal(await service.resolveOrigin(undefined), 'https://new.example.test');
    finish([{ domain: 'old.example.test', path: '', isDefault: true }]);
    await old;
    assert.equal(await service.resolveOrigin(undefined), 'https://new.example.test');
    assert.equal(reads, 2);
});

test('subscription domains normalize public hostnames and preserve a safe legacy prefix', () => {
    const value = SubscriptionDomainInputSchema.parse({
        name: 'Public',
        domain: 'SUB.Example.TEST',
        path: '/api/sub',
        kind: 'PRIMARY',
        isDefault: true,
    });
    assert.equal(value.domain, 'sub.example.test');
    assert.equal(value.path, '/api/sub');
    assert.equal(value.parentUuid, null);
});

test('a CDN needs a primary domain and inherits an empty path in the service', () => {
    const value = SubscriptionDomainInputSchema.parse({
        name: 'CDN',
        domain: 'cdn.example.test',
        path: '',
        kind: 'CDN',
        parentUuid: primaryId,
    });
    assert.equal(value.kind, 'CDN');
    assert.equal(value.parentUuid, primaryId);
    assert.equal(value.path, '');
    assert.equal(
        SubscriptionDomainInputSchema.safeParse({
            ...value,
            parentUuid: null,
        }).success,
        false,
    );
});

test('untrusted addresses and unsafe paths cannot enter the public domain registry', () => {
    for (const domain of [
        'https://panel.example.test',
        'panel.example.test:8443',
        'panel.example.test/path',
        'user@panel.example.test',
        '127.0.0.1',
        'panel.local',
    ]) {
        assert.equal(
            SubscriptionDomainInputSchema.safeParse({ name: 'bad', domain, kind: 'PRIMARY' })
                .success,
            false,
            domain,
        );
    }
    for (const pathValue of ['api/sub', '/api//sub', '/../panel', '/api?next=x', '/api/sub#x']) {
        assert.equal(
            SubscriptionDomainInputSchema.safeParse({
                name: 'bad path',
                domain: 'sub.example.test',
                path: pathValue,
                kind: 'PRIMARY',
            }).success,
            false,
            pathValue,
        );
    }
});

test('an empty registry never reflects an untrusted Host into client geofile links', async () => {
    const service = new SubscriptionDomainsService(
        { subscriptionDomains: { findMany: async () => [] } },
        { getOrThrow: () => 'sub.example.test/api/sub' },
    );

    assert.equal(
        await service.resolveOrigin('https://attacker.example.test'),
        'https://sub.example.test/api/sub',
    );
});

test('a registered CDN keeps its public hostname and applies its registered path only', async () => {
    const service = new SubscriptionDomainsService(
        {
            subscriptionDomains: {
                findMany: async () => [
                    {
                        uuid: primaryId,
                        kind: 'PRIMARY',
                        domain: 'sub.example.test',
                        path: '/api/sub',
                        isDefault: true,
                    },
                    {
                        uuid: '11111111-1111-4111-8111-111111111111',
                        kind: 'CDN',
                        parentUuid: primaryId,
                        domain: 'cdn.example.test',
                        path: '/edge/sub',
                        isDefault: false,
                    },
                ],
            },
        },
        { getOrThrow: () => 'sub.example.test/api/sub' },
    );

    assert.equal(
        await service.resolveOrigin('https://cdn.example.test'),
        'https://cdn.example.test/edge/sub/cdn/11111111-1111-4111-8111-111111111111',
    );
    assert.equal(
        await service.resolveOrigin('https://unknown.example.test'),
        'https://sub.example.test/api/sub',
    );
});
