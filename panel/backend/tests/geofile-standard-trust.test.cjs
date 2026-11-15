require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const fixture = require('./geofiles-fixture.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');

const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = {
    ...mocks,
    '../generators/client-pool': pool,
    '@common/config/app-config/typed-config.service': {},
    '@common/database/prisma.service': {},
    'node:https': {
        ...require('node:https'),
        request: () => assert.fail('No Internet access in the standard trust fixture'),
    },
    'node:dns/promises': {
        ...require('node:dns/promises'),
        lookup: () => assert.fail('No remote DNS in the standard trust fixture'),
    },
};
const { standardDat } = load(path.join(root, 'standard-dat.ts'), modules);
const { readGeofileRefresh } = load(path.join(root, 'refresh-geofile.ts'), modules);
const network = load(path.join(root, 'download-geofile.ts'), modules);
const official =
    'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat';
const alternative =
    'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat';
const other = 'https://example.test/geosite.dat';
const digest = (data) => createHash('sha256').update(data).digest('hex');
const changed = Buffer.from(
    fixture.geosite
        .toString('hex')
        .replace(
            Buffer.from('ads.example.com').toString('hex'),
            Buffer.from('new.example.com').toString('hex'),
        ),
    'hex',
);

async function setup(t) {
    const prefix = 'rc-geofile-trust-';
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    const previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    t.after(async () => {
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        const absolute = path.resolve(directory);
        assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
        assert(path.basename(absolute).startsWith(prefix));
        const info = await fs.lstat(absolute);
        assert(info.isDirectory() && !info.isSymbolicLink());
        await fs.rm(absolute, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
    });
    let download = async () => fixture.geosite;
    let reads = 0;
    let serial = Promise.resolve();
    const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), {
        ...modules,
        './download-geofile': {
            ...network,
            downloadGeofile: async (url) => {
                reads++;
                return download(url);
            },
        },
    });
    const create = () =>
        new GeofilesService(
            {
                getOrThrow: (key) =>
                    key === 'APP_SECRET' ? 'isolated-standard-trust-secret' : 'sub.example.test',
            },
            { getAllTemplates: async () => [] },
            {
                subscriptionSettings: { findFirst: async () => ({ geofilesSystemEnabled: true }) },
                $transaction: (operation) => {
                    const result = serial.then(() => operation({ $executeRaw: async () => 1 }));
                    serial = result.catch(() => {});
                    return result;
                },
            },
        );
    const service = create();
    return {
        service,
        create,
        get reads() {
            return reads;
        },
        set download(value) {
            download = value;
        },
        file: async (id, instance = service) =>
            (await instance.list()).find((file) => file.id === id),
        state: (id) => readGeofileRefresh(service.directory(id)),
        bytes: async (id) => {
            const { stream } = await service.download(id, 'latest.dat');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            return Buffer.concat(chunks);
        },
    };
}

test('official URL configuration alone cannot attest locally uploaded bytes', async (t) => {
    const f = await setup(t);
    const file = await f.service.ingest('Unverified sites', 'geosite', async () => fixture.geosite);
    const configured = await f.service.configureRefresh(file.id, {
        sourceUrl: official,
        enabled: false,
        intervalSeconds: 172800,
    });
    assert.equal(configured.origin, 'preset');
    assert.equal(configured.editPolicy, 'copy');
    assert.equal(configured.refresh.lastSuccessAt, undefined);
    assert.equal(f.reads, 0);
    assert.equal(standardDat(await f.service.list(), 'geosite'), undefined);
});

test('existing successful preset metadata remains eligible with exact full-source ranking', () => {
    const file = {
        id: '00' + 'a'.repeat(32),
        kind: 'geosite',
        origin: 'preset',
        editPolicy: 'copy',
        sha256: digest(fixture.geosite),
        refresh: {
            sourceUrl: official,
            lastSuccessAt: '2026-11-15T00:00:00.000Z',
            enabled: false,
            intervalSeconds: 172800,
        },
    };
    const second = {
        ...file,
        id: '01' + 'b'.repeat(32),
        refresh: { ...file.refresh, sourceUrl: alternative },
    };
    assert.equal(standardDat([second, file], 'geosite'), file);
    for (const candidate of [
        { ...file, origin: 'copy' },
        { ...file, editPolicy: 'edit' },
        { ...file, refresh: { ...file.refresh, sourceUrl: official + '?other=1' } },
        {
            ...file,
            refresh: {
                ...file.refresh,
                sourceUrl:
                    'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite-lite.dat',
            },
        },
        { ...file, refresh: { ...file.refresh, lastSuccessAt: undefined } },
        { ...file, refresh: { ...file.refresh, lastSuccessAt: 'invalid' } },
    ])
        assert.equal(standardDat([candidate], 'geosite'), undefined);
});

test('actual official import establishes persisted trust only after a successful download', async (t) => {
    const f = await setup(t);
    f.download = async () => {
        throw Error('synthetic import failure');
    };
    await assert.rejects(() => f.service.importUrl('Failed import', 'geosite', official));
    assert.deepEqual(await f.service.list(), []);
    f.download = async (url) => {
        assert.equal(url, official);
        return fixture.geosite;
    };
    const imported = await f.service.importUrl('Official sites', 'geosite', official);
    assert.equal(f.reads, 2);
    assert.ok(imported.refresh.lastSuccessAt);
    assert.equal(imported.refresh.enabled, false);
    assert.equal(standardDat(await f.create().list(), 'geosite').id, imported.id);
    assert.deepEqual(await f.bytes(imported.id), fixture.geosite);
});

test('successful other-source bytes lose trust on official URL change even when SHA is unchanged', async (t) => {
    const f = await setup(t);
    const imported = await f.service.importUrl('Other sites', 'geosite', other);
    assert.ok(imported.refresh.lastSuccessAt);
    const configured = await f.service.configureRefresh(imported.id, { sourceUrl: official });
    assert.equal(configured.sha256, imported.sha256);
    assert.equal(configured.refresh.lastSuccessAt, undefined);
    assert.equal(standardDat(await f.service.list(), 'geosite'), undefined);
    assert.equal(await f.service.refreshNow(imported.id), true);
    const verified = await f.file(imported.id);
    assert.ok(verified.refresh.lastSuccessAt);
    assert.equal(verified.refresh.current, undefined);
    assert.equal(standardDat([verified], 'geosite').id, imported.id);
    assert.deepEqual(await f.bytes(imported.id), fixture.geosite);
});

test('source change invalidates successful preset trust until an unchanged manual download succeeds', async (t) => {
    const f = await setup(t);
    const imported = await f.service.importUrl('Official sites', 'geosite', official);
    const file = await f.service.configureRefresh(imported.id, {
        sourceUrl: alternative,
        enabled: false,
    });
    assert.equal(file.refresh.lastSuccessAt, undefined);
    assert.equal(standardDat([file], 'geosite'), undefined);
    await f.service.refreshDue();
    assert.equal(f.reads, 1);
    assert.equal(await f.service.refreshNow(file.id), true);
    assert.equal(standardDat(await f.service.list(), 'geosite').id, file.id);
    assert.equal((await f.state(file.id)).current, undefined);
    assert.equal(f.reads, 2);
});

test('interval changes, disabling and restart preserve attestation to active refreshed bytes', async (t) => {
    const f = await setup(t);
    const imported = await f.service.importUrl('Official sites', 'geosite', official);
    f.download = async () => changed;
    assert.equal(await f.service.refreshNow(imported.id), true);
    const before = await f.state(imported.id);
    assert.equal(before.current.sha256, digest(changed));
    const configured = await f.service.configureRefresh(imported.id, {
        enabled: false,
        intervalSeconds: 3600,
    });
    assert.equal(configured.refresh.lastSuccessAt, before.lastSuccessAt);
    assert.deepEqual(configured.refresh.current, before.current);
    const restarted = await f.file(imported.id, f.create());
    assert.equal(standardDat([restarted], 'geosite').id, imported.id);
    assert.deepEqual(await f.bytes(imported.id), changed);
    await f.service.refreshDue();
    assert.equal(f.reads, 2);
});

test('failed refresh retains trusted active bytes and a later unchanged success does not replace them', async (t) => {
    const f = await setup(t);
    const imported = await f.service.importUrl('Official sites', 'geosite', official);
    f.download = async () => changed;
    assert.equal(await f.service.refreshNow(imported.id), true);
    const before = await f.state(imported.id);
    const filename = path.join(
        f.service.directory(imported.id),
        'current-' + before.current.sha256,
    );
    const stat = await fs.stat(filename);
    f.download = async () => {
        throw Error('synthetic refresh failure');
    };
    assert.equal(await f.service.refreshNow(imported.id), false);
    assert.equal((await f.state(imported.id)).lastSuccessAt, before.lastSuccessAt);
    assert.equal(standardDat(await f.service.list(), 'geosite').id, imported.id);
    assert.deepEqual(await f.bytes(imported.id), changed);
    f.download = async () => changed;
    assert.equal(await f.service.refreshNow(imported.id), true);
    assert.equal((await fs.stat(filename)).mtimeMs, stat.mtimeMs);
    assert.equal((await f.state(imported.id)).lastError, undefined);
});

test('A to B to A source changes invalidate an in-flight lease and cannot restore old trust', async (t) => {
    const f = await setup(t);
    const imported = await f.service.importUrl('Official sites', 'geosite', official);
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    f.download = async () => {
        started.resolve();
        return release.promise;
    };
    const pending = f.service.refreshNow(imported.id);
    await started.promise;
    assert.ok((await f.state(imported.id)).lease);
    await f.service.configureRefresh(imported.id, { sourceUrl: alternative });
    await f.service.configureRefresh(imported.id, { sourceUrl: official });
    const configured = await f.state(imported.id);
    assert.equal(configured.lease, undefined);
    release.resolve(fixture.geosite);
    assert.equal(await pending, false);
    assert.equal((await f.state(imported.id)).lastSuccessAt, undefined);
    assert.equal(standardDat(await f.service.list(), 'geosite'), undefined);
    f.download = async () => fixture.geosite;
    assert.equal(await f.service.refreshNow(imported.id), true);
    assert.equal(standardDat(await f.service.list(), 'geosite').id, imported.id);
});

test('failed new-source refresh leaves old bytes intact without transferring their trust', async (t) => {
    const f = await setup(t);
    const imported = await f.service.importUrl('Official sites', 'geosite', official);
    await f.service.configureRefresh(imported.id, { sourceUrl: alternative });
    f.download = async () => {
        throw Error('new source unavailable');
    };
    assert.equal(await f.service.refreshNow(imported.id), false);
    assert.equal((await f.state(imported.id)).lastSuccessAt, undefined);
    assert.equal(standardDat(await f.service.list(), 'geosite'), undefined);
    assert.deepEqual(await f.bytes(imported.id), fixture.geosite);
});

test('public edit and replacement guards preserve preset proof while copies do not inherit it', async (t) => {
    const f = await setup(t);
    const imported = await f.service.importUrl('Official sites', 'geosite', official);
    const before = await f.state(imported.id);
    await assert.rejects(
        () => f.service.editContent(imported.id, { sha256: imported.sha256 }),
        /geofile-copy-required/,
    );
    let reads = 0;
    await assert.rejects(
        () =>
            f.service.replaceData(imported.id, imported.sha256, async () => {
                reads++;
                return changed;
            }),
        /geofile-copy-required/,
    );
    assert.equal(reads, 0);
    const copy = await f.service.copyData(imported.id, imported.sha256, async () => ({
        name: 'Independent sites',
        data: changed,
    }));
    assert.equal(copy.origin, 'copy');
    assert.equal(copy.refresh, undefined);
    assert.equal(standardDat([copy], 'geosite'), undefined);
    assert.equal(standardDat(await f.service.list(), 'geosite').id, imported.id);
    assert.deepEqual(await f.state(imported.id), before);
    assert.deepEqual(await f.bytes(imported.id), fixture.geosite);
});
