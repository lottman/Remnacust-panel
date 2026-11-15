const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const load = require('./load-typescript.cjs');
const fixture = require('./geofiles-fixture.cjs');

const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');

async function setup(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-geofile-manual-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    let reads = 0;
    let body = fixture.geosite;
    let download = async () => body;
    const network = load(path.join(root, 'download-geofile.ts'));
    const { GeofileRefreshStore, readGeofileRefresh } = load(
        path.join(root, 'refresh-geofile.ts'),
        {
            './download-geofile': {
                ...network,
                downloadGeofile: async () => {
                    reads++;
                    return download();
                },
            },
        },
    );
    const sha = createHash('sha256').update(fixture.geosite).digest('hex');
    const file = { id: '00' + 'a'.repeat(32), kind: 'geosite', sha256: sha };
    const stateFile = path.join(directory, 'refresh.json');
    await fs.writeFile(
        stateFile,
        JSON.stringify({
            enabled: true,
            sourceUrl: 'https://example.com/geosite.dat',
            intervalSeconds: 172800,
            nextRefreshAt: new Date(Date.now() + 172800000).toISOString(),
        }),
    );
    let serial = Promise.resolve();
    const store = new GeofileRefreshStore({
        directory: () => directory,
        file: async () => file,
        list: async () => [{ ...file, refresh: await readGeofileRefresh(directory) }],
        lock(operation) {
            const result = serial.then(operation);
            serial = result.catch(() => {});
            return result;
        },
        validate: async () => 'revision',
        revision: async () => 'revision',
    });
    return {
        store,
        file,
        directory,
        stateFile,
        get reads() {
            return reads;
        },
        set body(value) {
            body = value;
        },
        set download(value) {
            download = value;
        },
        state: () => readGeofileRefresh(directory),
    };
}

test('manual refresh bypasses the automatic deadline while unchanged bytes retain the current file', async (t) => {
    const f = await setup(t);
    const original = await f.state();
    await f.store.refreshDue();
    assert.equal(f.reads, 0);
    assert.equal(await f.store.refresh(f.file.id, true), true);
    assert.equal(f.reads, 1);
    const state = await f.state();
    assert.equal(state.current, undefined);
    assert.ok(state.lastSuccessAt);
    assert.equal(state.lease, undefined);
    assert.ok(Date.parse(state.nextRefreshAt) >= Date.parse(original.nextRefreshAt) - 1000);
    assert.deepEqual((await fs.readdir(f.directory)).sort(), ['refresh.json']);
});

test('same-size changed bytes are published immediately by a manual refresh', async (t) => {
    const f = await setup(t);
    f.body = Buffer.from(
        fixture.geosite
            .toString('hex')
            .replace(
                Buffer.from('ads.example.com').toString('hex'),
                Buffer.from('new.example.com').toString('hex'),
            ),
        'hex',
    );
    assert.equal(await f.store.refresh(f.file.id, true), true);
    const state = await f.state();
    assert.equal(state.current.size, fixture.geosite.length);
    assert.notEqual(state.current.sha256, f.file.sha256);
    const current = path.join(f.directory, `current-${state.current.sha256}`);
    const before = await fs.stat(current);
    assert.equal(await f.store.refresh(f.file.id, true), true);
    assert.equal((await fs.stat(current)).mtimeMs, before.mtimeMs);
    assert.equal(f.reads, 2);
});

test('manual refresh preserves active leases and permits an explicit retry after failure', async (t) => {
    const f = await setup(t);
    await fs.writeFile(
        f.stateFile,
        JSON.stringify({
            ...(await f.state()),
            lease: { token: 'a'.repeat(32), until: new Date(Date.now() + 60000).toISOString() },
        }),
    );
    assert.equal(await f.store.refresh(f.file.id, true), false);
    assert.equal(f.reads, 0);
    const state = await f.state();
    delete state.lease;
    await fs.writeFile(f.stateFile, JSON.stringify(state));
    f.download = async () => {
        throw Error('synthetic download failure');
    };
    assert.equal(await f.store.refresh(f.file.id, true), false);
    assert.equal((await f.state()).lastError, 'geofile-refresh-failed');
    assert.equal(f.reads, 1);
    f.download = async () => fixture.geosite;
    assert.equal(await f.store.refresh(f.file.id, true), true);
    assert.equal(f.reads, 2);
    assert.equal((await f.state()).lastError, undefined);
});
