const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const load = require('./load-typescript.cjs');
const fixture = require('./geofiles-fixture.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = {
    ...mocks,
    '../generators/client-pool': pool,
    '@common/config/app-config/typed-config.service': {},
    '@common/database/prisma.service': {},
};
const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), modules);
const { compileDat, datCategories } = load(path.join(root, 'compile-dat.ts'), modules);
const { datCategory } = load(path.join(root, 'xray-geofile-delivery.ts'), modules);
const hash = (data) => createHash('sha256').update(data).digest('hex');
const sourceUrl = (kind) =>
    `https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/${kind}.dat`;
const site = (domain) =>
    fixture.bytes(
        1,
        Buffer.concat([
            fixture.bytes(1, 'CATEGORY-RU'),
            fixture.bytes(2, fixture.domain(2, domain, 'ru')),
        ]),
    );

async function setup(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-standard-dat-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    t.after(async () => {
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    });
    const service = new GeofilesService(
        {
            getOrThrow: (key) =>
                key === 'APP_SECRET' ? 'test-private-secret' : 'sub.example.test',
        },
        { getAllTemplates: async () => [] },
        {},
    );
    const custom = {
        id: '00' + 'a'.repeat(32),
        kind: 'geosite',
        size: fixture.geosite.length,
        sha256: hash(fixture.geosite),
    };
    const standard = {
        id: '01' + 'b'.repeat(32),
        kind: 'geosite',
        origin: 'preset',
        editPolicy: 'copy',
        refresh: {
            sourceUrl: sourceUrl('geosite'),
            enabled: true,
            intervalSeconds: 172800,
            lastSuccessAt: new Date().toISOString(),
        },
    };
    let data = site('ordinary.example');
    const current = () => ({ ...standard, size: data.length, sha256: hash(data) });
    service.fileById = async (id) => (id === custom.id ? custom : current());
    service.list = async () => [custom, current()];
    service.readActive = async (file) => (file.id === custom.id ? fixture.geosite : data);
    await fs.mkdir(service.directory(custom.id), { recursive: true });
    return {
        service,
        custom,
        standard,
        set data(value) {
            data = value;
        },
    };
}

test('managed custom DAT retains full standard category names alongside namespaced custom rules', async (t) => {
    const f = await setup(t);
    const url = new URL(
        await f.service.bundleUrl('geosite', [f.custom.id], { [f.custom.id]: ['example'] }),
    );
    const data = await f.service.bundle(
        f.custom.id,
        url.pathname.split('/').at(-1),
        url.pathname.split('/').at(-2),
    );
    assert.ok(datCategories(data).includes('category-ru'));
    assert.ok(datCategories(data).includes(datCategory(f.custom.id, 'example')));
    assert.deepEqual(compileDat(data, 'geosite', ['category-ru@ru']).domains, [
        { type: 2, value: 'ordinary.example' },
    ]);
    assert.equal(
        compileDat(data, 'geosite', [datCategory(f.custom.id, 'example')]).domains[0].value,
        'example.com',
    );
});

test('changed standard bytes invalidate bundle caches and URLs while old authenticated URLs remain usable', async (t) => {
    const f = await setup(t);
    const selected = { [f.custom.id]: ['example'] };
    const before = await f.service.bundleUrl('geosite', [f.custom.id], selected);
    assert.equal(await f.service.bundleUrl('geosite', [f.custom.id], selected), before);
    f.data = site('modified.example');
    const after = await f.service.bundleUrl('geosite', [f.custom.id], selected);
    assert.notEqual(after, before);
    for (const value of [before, after]) {
        const url = new URL(value);
        const data = await f.service.bundle(
            f.custom.id,
            url.pathname.split('/').at(-1),
            url.pathname.split('/').at(-2),
        );
        assert.equal(
            compileDat(data, 'geosite', ['category-ru']).domains[0].value,
            'modified.example',
        );
        const checksum = await f.service.bundle(
            f.custom.id,
            url.pathname.split('/').at(-1) + '.sha256',
            url.pathname.split('/').at(-2),
        );
        assert.equal(checksum.toString(), hash(data));
    }
});

test('copies and untrusted sources cannot replace the canonical standard alias namespace', async (t) => {
    const f = await setup(t);
    f.service.list = async () => [
        {
            ...f.standard,
            origin: 'copy',
            refresh: { sourceUrl: 'https://untrusted.example/geosite.dat' },
        },
    ];
    const data = await f.service.bundleContent('geosite', [f.custom.id], 2, {
        [f.custom.id]: ['example'],
    });
    assert.deepEqual(datCategories(data), [datCategory(f.custom.id, 'example')]);
});
