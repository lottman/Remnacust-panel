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
    domain: 'origin.example.test',
    path: '/subscriptions',
    kind: 'PRIMARY',
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
        subscriptionDomain: primary,
        subscriptionUrlBase: 'https://cdn.example.test/edge',
        activeInternalSquads: [],
        userTraffic: { usedTrafficBytes: 0n, lifetimeUsedTrafficBytes: 0n },
    };
    const response = new GetFullUserResponseModel(entity, 'fallback.example.test');
    assert.equal(response.subscriptionUrl, 'https://cdn.example.test/edge/fixture');
    assert.equal(response.subscriptionDomainUuid, null);
    assert.equal(response.subscriptionDomain, primary);
    assert.equal(Object.hasOwn(response, 'subscriptionUrlBase'), false);
    assert.equal(
        new GetFullUserResponseModel(
            { ...entity, subscriptionUrlBase: '' },
            'fallback.example.test',
        ).subscriptionUrl,
        '',
    );
});
