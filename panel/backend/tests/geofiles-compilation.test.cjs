const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { mocks: poolMocks, pool } = require('./client-pool-fixture.cjs');
const { geosite } = require('./geofiles-fixture.cjs');
const { GeofilesService } = load(
    path.join(__dirname, '../src/modules/subscription-template/geofiles/geofiles.service.ts'),
    {
        ...poolMocks,
        '../generators/client-pool': pool,
        '@common/config/app-config/typed-config.service': {},
        '@common/database/prisma.service': {},
    },
);
const file = { id: 'a'.repeat(34), sha256: 'a'.repeat(64), kind: 'geosite' };
function service() {
    return new GeofilesService({ getOrThrow: () => 'fixture.test' }, {}, {});
}

test('simultaneous subscriptions share one compilation instead of failing the third identical request', async () => {
    const s = service();
    let reads = 0,
        release;
    s.readActive = async () => {
        reads++;
        await new Promise((r) => (release = r));
        return geosite;
    };
    const jobs = Array.from({ length: 10 }, () => s.compile(file, ['example']));
    assert.equal(reads, 1);
    release();
    const results = await Promise.all(jobs);
    assert(results.every((r) => r === results[0]));
    assert.equal(s.compiling, 0);
    assert.equal(s.compilingByKey.size, 0);
    await s.compile(file, ['example']);
    assert.equal(reads, 1);
});
test('different compilations remain bounded and failed work can be retried', async () => {
    const s = service();
    const releases = [];
    s.readActive = () => new Promise((r) => releases.push(() => r(geosite)));
    const jobs = Array.from({ length: 32 }, (_, i) =>
        s.compile({ ...file, sha256: i.toString(16).padStart(64, '0') }, ['example']),
    );
    assert.equal(releases.length, 2);
    await assert.rejects(
        s.compile({ ...file, sha256: 'f'.repeat(64) }, ['example']),
        /geofile-busy/,
    );
    s.readActive = async () => geosite;
    releases.forEach((r) => r());
    await Promise.all(jobs);
    assert.equal(s.compilingByKey.size, 0);
    assert.equal(s.compiling, 0);
    const changed = { ...file, sha256: 'e'.repeat(64) };
    let reads = 0;
    s.readActive = async () => {
        if (++reads === 1) throw Error('temporary read failure');
        return geosite;
    };
    await assert.rejects(s.compile(changed, ['example']), /temporary read failure/);
    assert.equal(s.compilingByKey.size, 0);
    assert.equal(s.compiling, 0);
    assert((await s.compile(changed, ['example'])).domains.length > 0);
    assert.equal(reads, 2);
});

test('distinct cold bundles wait for bounded capacity, coalesce queued requests and recover from errors', async () => {
    const s = service(),
        releases = [];
    let active = 0,
        peak = 0,
        reads = 0;
    s.fileById = async (id) => ({ ...file, id, size: geosite.length });
    s.activeFile = (f) => f;
    s.readActive = async () => {
        reads++;
        peak = Math.max(peak, ++active);
        await new Promise((r) => releases.push(r));
        active--;
        return geosite;
    };
    const ids = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(34, '0'));
    const jobs = ids.map((id) => s.bundleContent('geosite', [id]));
    const duplicate = s.bundleContent('geosite', [ids[20]]);
    while (releases.length < 2) await new Promise((r) => setImmediate(r));
    await assert.rejects(s.bundleContent('geosite', ['f'.repeat(34)]), /geofile-busy/);
    assert.equal(peak, 2);
    assert.equal(reads, 2);
    for (let i = 0; i < 32; i++) {
        while (!releases[i]) await new Promise((r) => setImmediate(r));
        releases[i]();
    }
    const results = await Promise.all(jobs);
    assert.equal(await duplicate, results[20]);
    assert.equal(reads, 32);
    assert.equal(peak, 2);
    assert.equal(s.bundling, 0);
    assert.equal(s.bundlingByKey.size, 0);
    s.readActive = async () => {
        throw Error('read failed');
    };
    await assert.rejects(s.bundleContent('geosite', ['e'.repeat(34)]), /read failed/);
    assert.equal(s.bundlingByKey.size, 0);
    s.readActive = async () => geosite;
    assert((await s.bundleContent('geosite', ['e'.repeat(34)])).length > 0);
});

test('selection validation and inline rules use separate cache entries', async () => {
    const s = service();
    let reads = 0;
    s.readActive = async () => {
        reads++;
        return geosite;
    };
    assert.deepEqual(await s.compile(file, ['example'], true), { ips: [], domains: [] });
    assert.equal((await s.compile(file, ['example'])).domains.length, 2);
    await s.compile(file, ['example'], true);
    await s.compile(file, ['example']);
    assert.equal(reads, 2);
});

test('concurrent bundle and checksum requests share cold work and preserve every namespaced category', async () => {
    const s = service();
    let reads = 0,
        release;
    s.fileById = async (id) => ({ ...file, id, size: geosite.length });
    s.activeFile = (f) => f;
    s.readActive = async () => {
        reads++;
        await new Promise((r) => (release = r));
        return geosite;
    };
    const jobs = Array.from({ length: 12 }, () => s.bundleContent('geosite', [file.id]));
    while (!release) await new Promise((r) => setImmediate(r));
    assert.equal(reads, 1);
    release();
    const results = await Promise.all(jobs);
    assert(results.every((r) => r === results[0]));
    assert.equal(s.bundling, 0);
    assert.equal(s.bundlingByKey.size, 0);
    const { datCategory } = load(
        path.join(
            __dirname,
            '../src/modules/subscription-template/geofiles/xray-geofile-delivery.ts',
        ),
        { '../generators/client-pool': pool },
    );
    const { compileDat } = load(
        path.join(__dirname, '../src/modules/subscription-template/geofiles/compile-dat.ts'),
        poolMocks,
    );
    assert.equal(
        compileDat(results[0], 'geosite', [datCategory(file.id, 'example')]).domains.length,
        2,
    );
    assert.equal(reads, 1);
    await s.bundleContent('geosite', [file.id]);
    assert.equal(reads, 1);
});

test('small category subsets share a bounded LRU cache without increasing its byte budget', async () => {
    const s = service();
    let reads = 0;
    s.fileById = async (id) => ({ ...file, id, size: geosite.length });
    s.activeFile = (f) => f;
    s.readActive = async () => {
        reads++;
        return geosite;
    };
    const ids = Array.from(
        { length: 17 },
        (_, i) => i.toString(16).padStart(2, '0') + 'a'.repeat(32),
    );
    for (const id of ids.slice(0, 16))
        await s.bundleContent('geosite', [id], 2, { [id]: ['example'] });
    assert.equal(reads, 16);
    assert.equal(s.bundled.size, 16);
    await s.bundleContent('geosite', [ids[0]], 2, { [ids[0]]: ['example'] });
    await s.bundleContent('geosite', [ids[16]], 2, { [ids[16]]: ['example'] });
    await s.bundleContent('geosite', [ids[0]], 2, { [ids[0]]: ['example'] });
    assert.equal(reads, 17, 'The recently used selection stays cached');
    await s.bundleContent('geosite', [ids[1]], 2, { [ids[1]]: ['example'] });
    assert.equal(reads, 18);
    assert.equal(s.bundled.size, 16);
    s.bundled.clear();
    s.bundled.set('older-large-bundle', Buffer.alloc(32 * 1024 * 1024));
    await s.bundleContent('geosite', [ids[0]], 2, { [ids[0]]: ['example'] });
    assert.equal(s.bundled.size, 1);
    assert([...s.bundled.values()].reduce((n, b) => n + b.length, 0) <= 32 * 1024 * 1024);
});

test('compiled matcher cache is LRU and bounded by records and UTF-8 payload as well as entry count', async () => {
    const fixture = require('./geofiles-fixture.cjs');
    for (const [count, extra] of [
        [50000, ''],
        [10000, 'x'.repeat(195)],
    ]) {
        const s = service();
        let reads = 0;
        const data = fixture.bytes(
            1,
            Buffer.concat([
                fixture.bytes(1, 'EXAMPLE'),
                ...Array.from({ length: count }, (_, i) =>
                    fixture.bytes(2, fixture.domain(2, `${extra}${i}.test`)),
                ),
            ]),
        );
        s.readActive = async () => {
            reads++;
            return data;
        };
        const files = Array.from({ length: 9 }, (_, i) => ({
            ...file,
            sha256: i.toString(16).padStart(64, '0'),
        }));
        for (const f of files.slice(0, 4)) await s.compile(f, ['example']);
        await s.compile(files[0], ['example']);
        assert.equal(reads, 4);
        for (const f of files.slice(4)) {
            await s.compile(f, ['example']);
            const entries = [...s.compiled.values()];
            assert(entries.reduce((n, v) => n + v.records, 0) <= 250000);
            assert(entries.reduce((n, v) => n + v.bytes, 0) <= 16 * 1024 * 1024);
            assert(entries.length <= 32);
            await s.compile(files[0], ['example']);
        }
        assert.equal(reads, 9, 'recently used rules are retained even under pressure');
        assert(s.compiled.size < 9);
        await s.compile(files[1], ['example']);
        assert.equal(reads, 10, 'evicted rules rebuild without truncation');
    }
});
