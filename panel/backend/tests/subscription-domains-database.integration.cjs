const assert = require('node:assert/strict');
const path = require('node:path');
const { PrismaClient } = require('./prisma-test-client.cjs');
const load = require('./load-typescript.cjs');
const url = process.env.SUBSCRIPTION_DOMAINS_TEST_DATABASE_URL;
if (!url || !/^\/remnacust_test_subscription_domains(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
    throw Error('A dedicated remnacust_test_subscription_domains database is required');
const prisma = new PrismaClient({ datasourceUrl: url });
const { SubscriptionDomainsService } = load(path.join(__dirname, '../src/modules/subscription-domains/subscription-domains.service.ts'), {
    '@common/config/app-config': {}, '@common/database/prisma.service': {},
    '@libs/contracts/models/subscription-domain.schema': load(path.join(__dirname, '../libs/contract/models/subscription-domain.schema.ts')),
});
let value = 'old.example.test/api/sub', generation = 0, failWrite = false;
const snapshot = () => ({ value, valid: value !== null, revision: generation.toString(16).padStart(64, '0') });
const environment = {
    async read() { return snapshot(); },
    async write(next, revision) {
        if (failWrite) throw Error('private-agent-detail');
        assert.equal(revision, snapshot().revision);
        value = next; generation++;
        return snapshot();
    },
};
const service = () => new SubscriptionDomainsService(prisma, { getOrThrow: () => 'https://old.example.test/api/sub/' }, environment);
(async () => {
    try {
        await prisma.subscriptionDomains.deleteMany();
        const instance = service();
        await instance.onModuleInit();
        let listing = await instance.listing();
        assert.equal(listing.environment, 'synced');
        let main = listing.response.find(row => row.isDefault);
        assert.equal(main.domain, 'old.example.test');
        assert.equal(main.path, '/api/sub');
        assert.equal(main.usersCount, 0);
        await instance.save(main.uuid, { name: 'Saved label', domain: 'new.example.test', path: '/client', kind: 'PRIMARY', parentUuid: null, isDefault: true });
        assert.equal(value, 'new.example.test/client');
        assert.equal((await service().listing()).response.find(row => row.isDefault).name, 'Saved label', 'stale process environment must not overwrite the host');
        value = 'manual.example.test'; generation++;
        listing = await instance.listing();
        main = listing.response.find(row => row.isDefault);
        assert.equal(main.domain, 'manual.example.test');
        assert.equal(listing.response.filter(row => row.isDefault).length, 1);
        const cdn = await instance.save(undefined, { name: 'CDN', domain: 'cdn.example.test', path: '', kind: 'CDN', parentUuid: main.uuid, isDefault: false });
        assert.equal(value, 'manual.example.test', 'CDNs do not replace SUB_PUBLIC_DOMAIN');
        const competing = await Promise.allSettled([1,2,3].map(i => instance.save(undefined, {
            name: `Concurrent ${i}`, domain: `cdn-${i}.example.test`, path: '', kind: 'CDN', parentUuid: main.uuid, isDefault: false,
        })));
        assert.equal(competing.filter(result => result.status === 'fulfilled').length, 0);
        assert.equal(competing.filter(result => result.status === 'rejected' && result.reason.errorCode === 'SUBSCRIPTION_DOMAIN_CDN_LIMIT').length, 3);
        assert.equal(await prisma.subscriptionDomains.count({ where: { parentUuid: main.uuid } }), 1);
        const other = await instance.save(undefined, { name: 'Other', domain: 'other.example.test', path: '', kind: 'PRIMARY', parentUuid: null, isDefault: false });
        const newFamily = await Promise.allSettled([1, 2, 3].map(i => service().save(undefined, {
            name: `Other CDN ${i}`, domain: `other-cdn-${i}.example.test`, path: '', kind: 'CDN', parentUuid: other.uuid, isDefault: false,
        })));
        assert.equal(newFamily.filter(result => result.status === 'fulfilled').length, 1);
        assert.equal(newFamily.filter(result => result.status === 'rejected' && result.reason.errorCode === 'SUBSCRIPTION_DOMAIN_CDN_LIMIT').length, 2);
        assert.equal(await prisma.subscriptionDomains.count({ where: { parentUuid: other.uuid } }), 1);
        const otherCdn = newFamily.find(result => result.status === 'fulfilled').value;
        await assert.rejects(instance.save(otherCdn.uuid, { name: otherCdn.name, domain: otherCdn.domain, path: '', kind: 'CDN', parentUuid: main.uuid, isDefault: false }), error => error.errorCode === 'SUBSCRIPTION_DOMAIN_CDN_LIMIT');
        assert.equal((await instance.save(cdn.uuid, { name: 'Renamed CDN', domain: cdn.domain, path: '', kind: 'CDN', parentUuid: main.uuid, isDefault: false })).name, 'Renamed CDN');
        assert.equal((await instance.list({ kind: 'CDN', parentUuid: main.uuid })).length, 1);
        assert.equal((await instance.userLinks(cdn.uuid, 'fixture_key')).links.length, 2);
        assert.equal((await instance.userLinks(other.uuid, 'fixture_key', { kind: 'CDN' })).links.length, 1);
        value = cdn.domain; generation++;
        assert.equal((await instance.listing()).environment, 'conflict');
        assert.equal((await prisma.subscriptionDomains.findUnique({ where: { uuid: cdn.uuid } })).kind, 'CDN');
        value = main.domain; generation++;
        failWrite = true;
        await assert.rejects(instance.save(main.uuid, { domain: 'not-saved.example.test', name: 'Uncommitted', path: '', kind: 'PRIMARY', parentUuid: null, isDefault: true }));
        assert.equal((await prisma.subscriptionDomains.findUnique({ where: { uuid: main.uuid } })).domain, main.domain);
        failWrite = false;
        const results = await Promise.all([service().listing(), service().listing()]);
        assert.ok(results.every(row => row.environment === 'synced'));
        assert.equal(await prisma.subscriptionDomains.count({ where: { isDefault: true } }), 1);
        value = null; generation++;
        assert.equal((await instance.listing()).environment, 'invalid');
        assert.equal(await prisma.subscriptionDomains.count({ where: { isDefault: true } }), 1);
        console.log('PASS real PostgreSQL: default import, bidirectional sync, stale workers, concurrent reads, CDN isolation and rollback');
    } finally { await prisma.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
