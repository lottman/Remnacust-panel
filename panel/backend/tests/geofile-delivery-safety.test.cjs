const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const load = require('./load-typescript.cjs');
const dataFixture = require('./geofiles-fixture.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = {
    ...mocks,
    '../generators/client-pool': pool,
    '@common/config/app-config/typed-config.service': {},
    '@common/database/prisma.service': {},
};
const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), modules);
const { storeBundleSelection } = load(path.join(root, 'bundle-selection.ts'), modules);
const { datCategories } = load(path.join(root, 'compile-dat.ts'), modules);
const { datCategory } = load(path.join(root, 'xray-geofile-delivery.ts'), modules);
const digest = (data) => createHash('sha256').update(data).digest('hex');
const site = (category) =>
    dataFixture.bytes(
        1,
        Buffer.concat([
            dataFixture.bytes(1, category),
            dataFixture.bytes(2, dataFixture.domain(2, 'example.test')),
        ]),
    );

test('automatic library refresh reads the master once and never requires assigned templates', async () => {
    let settings = null,
        reads = 0,
        lists = 0;
    const refreshed = [];
    const service = new GeofilesService(
        { getOrThrow: (key) => (key === 'APP_SECRET' ? 'local-test-secret' : 'sub.example.test') },
        {},
        {
            subscriptionSettings: {
                findFirst: async (query) => {
                    assert.deepEqual(query, { select: { geofilesSystemEnabled: true } });
                    reads++;
                    return settings;
                },
            },
            subscriptionTemplate: {
                findFirst: () => assert.fail('Library refresh must not read template assignments'),
            },
        },
    );
    const id = '00' + 'a'.repeat(32);
    service.refreshStore.dependencies.list = async () => {
        lists++;
        return [{ id, refresh: { enabled: true } }];
    };
    service.refreshStore.refresh = async (value) => refreshed.push(value);
    for (const value of [null, {}, { geofilesSystemEnabled: false }, { geofilesEnabled: true }]) {
        settings = value;
        const before = reads;
        assert.deepEqual(await service.refreshDue(), []);
        assert.equal(reads, before + 1);
        assert.equal(lists, 0);
        assert.deepEqual(refreshed, []);
    }
    settings = { geofilesSystemEnabled: true };
    const before = reads;
    await service.refreshDue();
    assert.equal(reads, before + 1);
    assert.equal(lists, 1);
    assert.deepEqual(refreshed, [id]);
    settings = { geofilesSystemEnabled: false };
    assert.deepEqual(await service.refreshDue(), []);
    assert.equal(lists, 1);
    assert.deepEqual(refreshed, [id]);
    service.prisma.subscriptionSettings.findFirst = async () => {
        throw new Error('database unavailable');
    };
    await assert.rejects(service.refreshDue(), /database unavailable/);
    assert.equal(lists, 1);
    assert.deepEqual(refreshed, [id]);
});

async function fixture(run) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-geofile-delivery-safety-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    let templates = [],
        lock = Promise.resolve(),
        locked = false;
    const service = new GeofilesService(
        { getOrThrow: (key) => (key === 'APP_SECRET' ? 'local-test-secret' : 'sub.example.test') },
        { getAllTemplates: async () => templates },
        {
            $transaction: (operation) => {
                const result = lock.then(async () => {
                    locked = true;
                    try {
                        return await operation({ $executeRaw: async () => 1 });
                    } finally {
                        locked = false;
                    }
                });
                lock = result.catch(() => undefined);
                return result;
            },
        },
    );
    try {
        await run({
            service,
            setTemplates: (value) => {
                templates = value;
            },
            isLocked: () => locked,
        });
    } finally {
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
        await fs.rm(directory, { recursive: true, force: true });
    }
}

test('large ingest yields to the event loop before storage and keeps valid metadata on late validation failure', async (t) =>
    fixture(async ({ service }) => {
        const records = 400_000;
        const encoded = dataFixture.bytes(2, dataFixture.domain(2, 'heartbeat.example.test'));
        const data = dataFixture.bytes(
            1,
            Buffer.concat([
                dataFixture.bytes(1, 'LARGE'),
                Buffer.alloc(encoded.length * records).fill(encoded),
            ]),
        );
        let ticks = 0,
            beforeRead = 0,
            storageCalls = 0;
        const locked = service.withReferenceLock.bind(service);
        service.withReferenceLock = async (operation) => {
            assert(ticks > beforeRead, 'Validation must yield before storage admission');
            storageCalls++;
            return locked(operation);
        };
        const timer = setInterval(() => {
            ticks++;
        }, 1);
        const start = performance.now();
        try {
            const file = await service.ingest('Large heartbeat', 'geosite', async () => {
                beforeRead = ticks;
                return data;
            });
            assert.equal(file.size, data.length);
            assert.equal(file.sha256, digest(data));
            assert.deepEqual(file.categories, ['large']);
            assert.equal(storageCalls, 1);
            const malformed = Buffer.concat([data, Buffer.from([10, 255])]);
            await assert.rejects(
                service.ingest('Late invalid', 'geosite', async () => malformed),
                /geofile-invalid-or-unreachable/,
            );
            assert.equal(storageCalls, 1);
            assert.equal(service.active, 0);
            assert.equal((await service.list()).length, 1);
            const { stream } = await service.download(file.id, file.filename);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            assert.deepEqual(Buffer.concat(chunks), data);
            t.diagnostic(
                JSON.stringify({
                    records,
                    bytes: data.length,
                    ticks,
                    elapsedMs: Math.round(performance.now() - start),
                }),
            );
        } finally {
            clearInterval(timer);
        }
    }));

test('ingest retains its two-operation admission bound and releases rejected validation slots', async () =>
    fixture(async ({ service }) => {
        let releaseFirst,
            releaseSecond,
            unexpectedRead = false;
        const first = service.ingest(
            'Invalid pending',
            'geosite',
            () =>
                new Promise((resolve) => {
                    releaseFirst = resolve;
                }),
        );
        const failed = assert.rejects(first, /geofile-invalid-or-unreachable/);
        const second = service.ingest(
            'Valid pending',
            'geosite',
            () =>
                new Promise((resolve) => {
                    releaseSecond = resolve;
                }),
        );
        assert.equal(service.active, 2);
        await assert.rejects(
            service.ingest('Over admission', 'geosite', async () => {
                unexpectedRead = true;
                return dataFixture.geosite;
            }),
            /geofile-busy/,
        );
        assert.equal(unexpectedRead, false);
        releaseFirst(Buffer.from('<html>invalid</html>'));
        releaseSecond(dataFixture.geosite);
        const [, file] = await Promise.all([failed, second]);
        assert.equal(service.active, 0);
        assert.equal((await service.list()).length, 1);
        const retry = await service.ingest('Retry', 'geosite', async () => dataFixture.geosite);
        assert.equal(retry.id, file.id);
        assert.equal(service.active, 0);
    }));

test('saturated manifest storage never widens 32 selected categories to all 33 source categories', async () =>
    fixture(async ({ service }) => {
        const categories = Array.from({ length: 32 }, (_, i) => `selected_${i}_` + 'x'.repeat(85));
        const data = Buffer.concat([...categories, 'unused'].map(site));
        const file = await service.ingest('Large selection', 'geosite', async () => data);
        const url = new URL(
            await service.bundleUrl('geosite', [file.id], { [file.id]: categories }),
        );
        const selection = url.pathname.split('/').at(-2);
        const filename = url.pathname.split('/').at(-1);
        assert.match(selection, /^m-[a-f0-9]{64}$/);
        const expected = categories.map((category) => datCategory(file.id, category)).sort();
        assert.deepEqual(
            datCategories(await service.bundle(file.id, filename, selection)),
            expected,
        );
        const slot = service.directory(file.id);
        for (let i = 0; i < 127; i++) {
            assert(
                await storeBundleSelection(slot, {
                    kind: 'geosite',
                    ids: [file.id],
                    namespace: 2,
                    categories: { [file.id]: ['unused'] },
                    revision: digest(Buffer.from(String(i))),
                }),
            );
        }
        const stored = (await fs.readdir(slot))
            .filter((name) => name.startsWith('selection-'))
            .sort();
        assert.equal(stored.length, 128);
        assert.equal(
            await service.bundleUrl('geosite', [file.id], { [file.id]: categories }),
            url.href,
        );
        const changed = await service.editContent(file.id, {
            sha256: file.sha256,
            category: categories[0],
            changes: [{ index: 0, value: 'updated.test' }],
        });
        assert.notEqual(changed.sha256, file.sha256);
        for (const selected of [
            categories.slice(0, 3),
            categories.slice(0, 31).concat('unused'),
            categories,
        ]) {
            await assert.rejects(
                service.bundleUrl('geosite', [file.id], { [file.id]: selected }),
                /geofile-bundle-size/,
            );
        }
        const dat = await service.bundle(file.id, filename, selection);
        assert.deepEqual(datCategories(dat), expected);
        assert.equal(
            (await service.bundle(file.id, filename + '.sha256', selection)).toString(),
            digest(dat),
        );
        assert.deepEqual(
            (await fs.readdir(slot)).filter((name) => name.startsWith('selection-')).sort(),
            stored,
        );
        const short = new URL(
            await service.bundleUrl('geosite', [file.id], { [file.id]: ['unused'] }),
        );
        const shortSelection = short.pathname.split('/').at(-2);
        assert(!shortSelection.startsWith('m-'));
        assert.deepEqual(
            datCategories(
                await service.bundle(file.id, short.pathname.split('/').at(-1), shortSelection),
            ),
            [datCategory(file.id, 'unused')],
        );
    }));

function legacyUrl(service, ids, namespace, pathSelection, checksum = false) {
    const selection = Buffer.from(JSON.stringify({ kind: 'geosite', ids, namespace })).toString(
        'base64url',
    );
    const filename =
        `bundle-${service.bundleSignature(ids[0], selection)}.dat` + (checksum ? '.sha256' : '');
    return {
        selection,
        filename,
        url:
            `https://cdn.example.test/geofiles/${ids[0]}/` +
            (pathSelection
                ? `bundles/${selection}/${filename}`
                : `${filename}?selection=${selection}`),
    };
}

test('deletion protects secondary native bundle sources in JSON, YAML, manifest and legacy signed URLs', async () =>
    fixture(async ({ service, setTemplates, isLocked }) => {
        const first = await service.ingest('First', 'geosite', async () => site('first'));
        const second = await service.ingest('Second', 'geosite', async () => site('second'));
        const ids = [first.id, second.id];
        const manifestUrl = new URL(
            await service.bundleUrl('geosite', ids, {
                [first.id]: ['first'],
                [second.id]: ['second'],
            }),
        );
        const links = [
            {
                url: manifestUrl.href.replace(manifestUrl.origin, 'https://cdn.example.test'),
                selection: manifestUrl.pathname.split('/').at(-2),
                filename: manifestUrl.pathname.split('/').at(-1),
            },
        ];
        for (const namespace of [1, 2])
            for (const pathSelection of [false, true])
                links.push(legacyUrl(service, ids, namespace, pathSelection, !pathSelection));
        let scans = 0;
        const scan = service.nativeReferences.bind(service);
        service.nativeReferences = async (...args) => {
            assert(isLocked(), 'Native dependency checks must hold the reference lock');
            scans++;
            return scan(...args);
        };
        for (const link of links) {
            assert(!link.url.includes(second.id));
            const before = await service.bundle(first.id, link.filename, link.selection);
            for (const yaml of [false, true]) {
                setTemplates([
                    yaml
                        ? {
                              templateType: 'MIHOMO',
                              templateYaml: `geodata:\n  geosite: '${link.url}'\n`,
                          }
                        : {
                              templateType: 'XRAY_JSON',
                              templateJson: { geodata: { geosite: link.url } },
                          },
                ]);
                await assert.rejects(service.remove(second.id), /geofile-in-use/);
                assert.deepEqual(
                    await service.bundle(first.id, link.filename, link.selection),
                    before,
                );
            }
        }
        assert.equal(scans, links.length * 2);
        const unused = await service.ingest('Unrelated', 'geosite', async () => site('unrelated'));
        await service.remove(unused.id);
        assert.equal((await service.list()).length, 2);
        const link = links[0];
        const signature = link.filename.slice('bundle-'.length, -'.dat'.length);
        const tampered = link.url.replace(
            signature,
            (signature[0] === '0' ? '1' : '0') + signature.slice(1),
        );
        setTemplates([
            { templateType: 'XRAY_JSON', templateJson: { geodata: { geosite: tampered } } },
        ]);
        await assert.rejects(service.bundle(first.id, tampered.split('/').at(-1), link.selection));
        await service.remove(second.id);
        assert.equal((await service.list()).length, 1);
        await assert.rejects(service.bundle(first.id, link.filename, link.selection));
    }));

test('deletion checks references committed while it waits for the shared reference lock', async () =>
    fixture(async ({ service, setTemplates }) => {
        const first = await service.ingest('First', 'geosite', async () => site('first'));
        const second = await service.ingest('Second', 'geosite', async () => site('second'));
        const link = legacyUrl(service, [first.id, second.id], 2, false);
        let enter, release;
        const entered = new Promise((resolve) => {
            enter = resolve;
        });
        const waiting = new Promise((resolve) => {
            release = resolve;
        });
        const save = service.withReferenceLock(async () => {
            enter();
            await waiting;
            setTemplates([
                { templateType: 'XRAY_JSON', templateJson: { geodata: { geosite: link.url } } },
            ]);
        });
        await entered;
        const removed = assert.rejects(service.remove(second.id), /geofile-in-use/);
        release();
        await Promise.all([save, removed]);
        assert.equal((await service.list()).length, 2);
        await service.bundle(first.id, link.filename, link.selection);
        setTemplates([]);
        await service.remove(second.id);
        assert.equal((await service.list()).length, 1);
    }));
