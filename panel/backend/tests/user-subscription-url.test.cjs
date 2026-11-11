const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const { subscriptionUserUrl } = load(
    path.join(__dirname, '../src/common/utils/subscription-domain-url.ts'),
);
const { GetFullUserResponseModel } = load(
    path.join(__dirname, '../src/modules/users/models/get-full-user.response.model.ts'),
    {
        '@common/utils/frozen-user-lifetime': load(
            path.join(__dirname, '../src/common/utils/frozen-user-lifetime.ts'),
        ),
    },
);
const primary = {
    uuid: '00000000-0000-4000-8000-000000000001',
    name: 'Primary',
    domain: 'origin.example.test',
    path: '/subscriptions',
    kind: 'PRIMARY',
    parentUuid: null,
    isDefault: true,
};
const cdn = {
    ...primary,
    uuid: '00000000-0000-4000-8000-000000000002',
    name: 'Public CDN',
    domain: 'cdn.example.test',
    path: '/edge',
    kind: 'CDN',
    parentUuid: primary.uuid,
    isDefault: false,
};

test('public URL selection retains fallback, path and explicit denied state', () => {
    assert.equal(
        subscriptionUserUrl(
            primary,
            'fallback.example.test',
            'fixture',
            'https://cdn.example.test/edge',
        ),
        'https://cdn.example.test/edge/fixture',
    );
    assert.equal(subscriptionUserUrl(primary, 'fallback.example.test', 'fixture', ''), '');
    assert.equal(
        subscriptionUserUrl(primary, 'fallback.example.test', 'fixture', null),
        'https://origin.example.test/subscriptions/fixture',
    );
    assert.equal(
        subscriptionUserUrl(null, 'fallback.example.test/path', 'fixture'),
        'https://fallback.example.test/path/fixture',
    );
});

test('user API uses the effective CDN without changing assignment or exposing private selection state', () => {
    const entity = {
        id: 1n,
        shortUuid: 'fixture',
        status: 'ACTIVE',
        expireAt: new Date('2099-01-01'),
        trafficLimitBytes: 0n,
        subscriptionDomainUuid: null,
        subscriptionDomain: cdn,
        subscriptionUrlBase: 'https://cdn.example.test/edge',
        activeInternalSquads: [],
        userTraffic: { usedTrafficBytes: 0n, lifetimeUsedTrafficBytes: 0n },
    };
    const response = new GetFullUserResponseModel(entity, 'fallback.example.test');
    assert.equal(response.subscriptionUrl, 'https://cdn.example.test/edge/fixture');
    assert.equal(response.subscriptionDomainUuid, null);
    assert.equal(response.subscriptionDomain, cdn);
    assert.equal(new URL(response.subscriptionUrl).hostname, response.subscriptionDomain.domain);
    const assigned = new GetFullUserResponseModel(
        { ...entity, subscriptionDomainUuid: primary.uuid },
        'fallback.example.test',
    );
    assert.equal(assigned.subscriptionDomainUuid, primary.uuid);
    assert.equal(assigned.subscriptionDomain.uuid, cdn.uuid);
    assert.equal(assigned.subscriptionDomain.kind, 'CDN');
    assert.equal(Object.hasOwn(response, 'subscriptionUrlBase'), false);
    assert.equal(
        new GetFullUserResponseModel(
            { ...entity, subscriptionUrlBase: '' },
            'fallback.example.test',
        ).subscriptionUrl,
        '',
    );
});

test('user metadata keeps a primary without CDN and exposes no domain for a denied family', () => {
    const entity = {
        id: 1n,
        shortUuid: 'fixture',
        status: 'ACTIVE',
        expireAt: new Date('2099-01-01'),
        trafficLimitBytes: 0n,
        subscriptionDomainUuid: primary.uuid,
        subscriptionDomain: primary,
        subscriptionUrlBase: 'https://origin.example.test/subscriptions',
        activeInternalSquads: [],
        userTraffic: { usedTrafficBytes: 0n, lifetimeUsedTrafficBytes: 0n },
    };
    const open = new GetFullUserResponseModel(entity, 'fallback.example.test');
    assert.equal(open.subscriptionDomain, primary);
    assert.equal(open.subscriptionUrl, 'https://origin.example.test/subscriptions/fixture');
    const closed = new GetFullUserResponseModel(
        { ...entity, subscriptionDomain: null, subscriptionUrlBase: '' },
        'fallback.example.test',
    );
    assert.equal(closed.subscriptionUrl, '');
    assert.equal(closed.subscriptionDomain, null);
    assert.equal(closed.subscriptionDomainUuid, primary.uuid);
});
