const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const schema = load(path.join(__dirname, '../libs/contract/models/subscription-domain.schema.ts'));
const { SubscriptionDomainsService } = load(
    path.join(__dirname, '../src/modules/subscription-domains/subscription-domains.service.ts'),
    {
        '@common/config/app-config': {},
        '@common/database/prisma.service': {},
        '@libs/contracts/models/subscription-domain.schema': schema,
    },
);
const uuid = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const main = {
    uuid: uuid(1),
    kind: 'PRIMARY',
    domain: 'sub.example.test',
    name: 'Regular',
    path: '/sub',
    isDefault: true,
};
const cdns = [2, 3, 4].map((i) => ({
    uuid: uuid(i),
    kind: 'CDN',
    parentUuid: main.uuid,
    domain: `cdn${i}.example.test`,
    name: `CDN ${i}`,
    path: '/sub',
    isDefault: false,
}));
const other = { ...main, uuid: uuid(5), domain: 'other.example.test', isDefault: false };
function fixture(rows = [main, ...cdns, other]) {
    let reads = 0;
    const service = new SubscriptionDomainsService(
        {
            subscriptionDomains: {
                findMany: async () => {
                    reads++;
                    return rows;
                },
            },
        },
        { getOrThrow: () => 'sub.example.test' },
    );
    return { service, reads: () => reads };
}
test('one ordinary URL and three CDN URLs share a user key, with explicit selection and no setup metadata', async () => {
    const { service, reads } = fixture();
    const result = await service.userLinks(null, 'fixture_key');
    assert.equal(result.primaryDomainUuid, main.uuid);
    assert.equal(result.links.length, 4);
    assert.equal(result.links[0].url, 'https://sub.example.test/sub/fixture_key');
    assert.equal(result.links[0].isSelected, true);
    assert.equal(result.links[1].url, 'https://cdn2.example.test/sub/fixture_key');
    for (const link of result.links) assert.equal(new URL(link.url).pathname, '/sub/fixture_key');
    for (const link of result.links)
        assert.deepEqual(Object.keys(link).sort(), [
            'domain',
            'domainUuid',
            'isSelected',
            'kind',
            'name',
            'url',
        ]);
    const selected = await service.userLinks(cdns[1].uuid, 'fixture_key');
    assert.equal(selected.links.find((x) => x.isSelected).domainUuid, cdns[1].uuid);
    assert.equal(reads(), 1, 'Domain registry is reused, not queried for each link');
});
test('kind and UUID filters cannot select a foreign family or silently substitute a regular URL', async () => {
    const { service } = fixture();
    assert.equal((await service.userLinks(null, 'key', { kind: 'PRIMARY' })).links.length, 1);
    assert.equal((await service.userLinks(null, 'key', { kind: 'CDN' })).links.length, 3);
    assert.equal(
        (await service.userLinks(null, 'key', { kind: 'CDN', domainUuid: cdns[0].uuid })).links
            .length,
        1,
    );
    await assert.rejects(
        service.userLinks(null, 'key', { domainUuid: other.uuid }),
        (e) => e.getStatus() === 404,
    );
    await assert.rejects(
        service.userLinks(null, 'key', { kind: 'CDN', domainUuid: main.uuid }),
        (e) => e.getStatus() === 400,
    );
    await assert.rejects(service.userLinks(uuid(99), 'key'), (e) => e.getStatus() === 404);
    assert.deepEqual((await service.userLinks(other.uuid, 'key', { kind: 'CDN' })).links, []);
});
test('legacy excess CDNs are reported rather than omitted, and primary-only access remains available', async () => {
    const extra = { ...cdns[0], uuid: uuid(6), domain: 'extra.example.test' };
    const { service } = fixture([main, ...cdns, extra]);
    await assert.rejects(
        service.userLinks(null, 'key'),
        (e) => e.errorCode === 'SUBSCRIPTION_DOMAIN_CDN_LIMIT' && e.getStatus() === 409,
    );
    assert.equal((await service.userLinks(null, 'key', { kind: 'PRIMARY' })).links.length, 1);
});

test('CDN-only and redirecting primaries are never emitted as user links', async () => {
    for (const mode of ['CDN_ONLY', 'REDIRECT']) {
        const { service } = fixture([{ ...main, accessMode: mode }, ...cdns]);
        const result = await service.userLinks(null, 'key');
        assert.equal(result.links.length, 3);
        assert.ok(result.links.every((link) => link.kind === 'CDN'));
        assert.deepEqual((await service.userLinks(null, 'key', { kind: 'PRIMARY' })).links, []);
        assert.deepEqual(
            (await service.userLinks(null, 'key', { domainUuid: main.uuid })).links,
            [],
        );
    }
});
test('a closed primary hides its complete family; a closed CDN hides only itself', async () => {
    const closed = fixture([{ ...main, accessMode: 'BLOCKED' }, ...cdns]);
    assert.deepEqual((await closed.service.userLinks(null, 'key')).links, []);
    assert.deepEqual((await closed.service.userLinks(cdns[0].uuid, 'key')).links, []);
    const cdnClosed = fixture([main, { ...cdns[0], accessMode: 'BLOCKED' }, ...cdns.slice(1)]);
    const links = (await cdnClosed.service.userLinks(null, 'key')).links;
    assert.equal(links.length, 3);
    assert.ok(links.every((link) => link.domainUuid !== cdns[0].uuid));
});
