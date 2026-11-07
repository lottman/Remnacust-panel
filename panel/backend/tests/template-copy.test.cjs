const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const directory = path.join(__dirname, '../src/modules/subscription-template');
const { ERRORS } = load(path.join(__dirname, '../libs/contract/constants/errors/errors.ts'));
const { SubscriptionTemplateService } = load(
    path.join(directory, 'subscription-template.service.ts'),
    {
        '@common/types': {
            ok: (response) => ({ isOk: true, response }),
            fail: (error) => ({ isOk: false, error }),
        },
        '@common/utils': {},
        '@libs/contracts/constants': { ERRORS, CACHE_KEYS: {} },
        '@libs/contracts/models': {},
        './constants': {},
        './models/get-templates.response.model': {},
        './geofiles/xray-geofile-delivery': { XrayGeofileDelivery: class {} },
    },
);
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const source = {
    uuid: id,
    name: 'Default',
    tags: ['test'],
    viewPosition: 4,
    templateType: 'XRAY_JSON',
    templateJson: {
        remnawave: {
            assignTo: { hosts: [id] },
            assignments: [{ hosts: [id], balancerTag: 'auto' }],
            injectHosts: [],
        },
        remnacust: { geofiles: [{ id: 'shared-file', target: 'DIRECT' }] },
    },
    draftContent: '{ unfinished',
    templateYaml: null,
};
test('a single create copies content, tags and invalid drafts without stealing host assignments', async () => {
    let written;
    const service = new SubscriptionTemplateService(
        {
            findByUUID: async () => source,
            create: async (entity) => (written = { ...entity, uuid: 'new', viewPosition: 5 }),
        },
        {},
        { withReferenceLock: async (operation) => operation() },
    );
    service.logger = { error() {} };
    const before = structuredClone(source);
    const result = await service.createTemplate('Default copy', 'XRAY_JSON', id);
    assert.equal(result.isOk, true);
    assert.equal(written.draftContent, source.draftContent);
    assert.deepEqual(written.tags, ['test']);
    assert.deepEqual(
        written.templateJson.remnacust.geofiles,
        source.templateJson.remnacust.geofiles,
    );
    assert.deepEqual(written.templateJson.remnawave, { injectHosts: [] });
    assert.deepEqual(source, before);
    assert.equal(written.createdAt, undefined);
});
test('YAML copies preserve exact code and JSON copies remove assignments from parseable drafts', async () => {
    for (const type of ['MIHOMO', 'CLASH', 'STASH', 'SINGBOX', 'XRAY_JSON']) {
        let written;
        const original = {
            ...source,
            templateType: type,
            templateYaml: '# comment\nproxies: []\n',
            draftContent: JSON.stringify(source.templateJson),
        };
        const service = new SubscriptionTemplateService(
            {
                findByUUID: async () => original,
                create: async (entity) => (written = { ...entity, uuid: 'new' }),
            },
            {},
            { withReferenceLock: async (operation) => operation() },
        );
        assert.equal((await service.createTemplate('Copy', type, id)).isOk, true);
        assert.equal(written.templateYaml, original.templateYaml);
        if (type === 'XRAY_JSON')
            assert.deepEqual(JSON.parse(written.draftContent).remnawave, { injectHosts: [] });
    }
});
test('missing or mismatching sources never create partial copies', async () => {
    for (const value of [null, { ...source, templateType: 'SINGBOX' }]) {
        let creates = 0;
        const service = new SubscriptionTemplateService(
            { findByUUID: async () => value, create: async () => creates++ },
            {},
            { withReferenceLock: async (operation) => operation() },
        );
        const result = await service.createTemplate('Copy', 'XRAY_JSON', id);
        assert.equal(result.isOk, false);
        assert.equal(creates, 0);
    }
});

test('source read and clone create share the geofile lock, so subsequent publish/refresh cannot orphan the clone', async () => {
    const fs = require('node:fs/promises'),
        os = require('node:os');
    const { mocks, pool } = require('./client-pool-fixture.cjs');
    const data = require('./geofiles-fixture.cjs');
    const root = path.join(directory, 'geofiles');
    const modules = { ...mocks, '../generators/client-pool': pool };
    const network = load(path.join(root, 'download-geofile.ts'), modules);
    const other = data.bytes(
        1,
        Buffer.concat([data.bytes(1, 'OTHER'), data.bytes(2, data.domain(2, 'other.test'))]),
    );
    const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), {
        ...modules,
        './download-geofile': { ...network, downloadGeofile: async () => other },
    });
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'remnacust-template-clone-race-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = temp;
    try {
        let rows = [],
            lock = Promise.resolve();
        const files = new GeofilesService(
            { getOrThrow: (key) => (key === 'APP_SECRET' ? 's'.repeat(64) : 'sub.test') },
            { getAllTemplates: async () => structuredClone(rows) },
            {
                $transaction: (fn) => {
                    const pending = lock.then(() => fn({ $executeRaw: async () => 1 }));
                    lock = pending.catch(() => {});
                    return pending;
                },
            },
        );
        const file = await files.ingest('Data', 'geosite', async () =>
            Buffer.concat([data.geosite, other]),
        );
        const original = {
            ...source,
            templateType: 'SINGBOX',
            draftContent: null,
            templateJson: {
                outbounds: [{ type: 'direct', tag: 'direct' }],
                remnacust: {
                    geofiles: [{ id: file.id, categories: ['example'], target: 'DIRECT' }],
                },
            },
        };
        rows.push(original);
        await files.configureRefresh(file.id, {
            sourceUrl: 'https://example.com/data.dat',
            enabled: true,
        });
        let release,
            started,
            published = false;
        const ready = new Promise((r) => {
                started = r;
            }),
            gate = new Promise((r) => {
                release = r;
            });
        const service = new SubscriptionTemplateService(
            {
                findByUUID: async () => structuredClone(original),
                create: async (entity) => {
                    started();
                    await gate;
                    const row = { ...entity, uuid: 'new' };
                    rows.push(row);
                    return row;
                },
            },
            {},
            files,
        );
        const cloning = service.createTemplate('Copy', 'SINGBOX', id);
        await ready;
        const publish = files.withReferenceLock(async () => {
            original.templateJson.remnacust.geofiles[0].categories = ['other'];
            published = true;
        });
        await new Promise((r) => setImmediate(r));
        const wasPublishedEarly = published;
        release();
        const result = await cloning;
        await publish;
        assert.equal(wasPublishedEarly, false);
        assert.equal(result.isOk, true);
        assert.equal(
            await files.refreshNow(file.id),
            false,
            'Committed clone reference prevents removal of example',
        );
        await files.prepare(result.response.templateJson, 'SINGBOX');
    } finally {
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
});
