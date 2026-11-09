const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { deflateSync } = require('node:zlib');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const f = require('./geofiles-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = { ...mocks, '../generators/client-pool': pool };
const { editGeofile, geofileContent, parseGeofileSelections } = load(
    path.join(root, 'geofile-editor.ts'),
    modules,
);
const { geofileFields, validateGeofile } = load(path.join(root, 'validate-geofile.ts'), modules);
const { PRESET_GEOFILE_URLS } = load(path.join(root, 'provenance.ts'), modules);
const sha = (data) => createHash('sha256').update(data).digest('hex');
const entry = (name, ...records) =>
    f.bytes(1, Buffer.concat([f.bytes(1, name), ...records.map((r) => f.bytes(2, r))]));
const text = (domain) => Buffer.from(JSON.stringify({ version: 3, rules: [{ domain: [domain] }] }));

async function fixture(run, fsOverrides = {}) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remnacust-geofile-editor-'));
    const old = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    let body = f.geosite,
        templates = [],
        lock = Promise.resolve(),
        activeLocks = 0,
        onLock;
    const network = load(path.join(root, 'download-geofile.ts'), modules);
    let download = async () => body;
    const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), {
        ...modules,
        'node:fs/promises': { ...fs, ...fsOverrides },
        './download-geofile': {
            ...network,
            downloadGeofile: (url) => {
                assert.equal(activeLocks, 0, 'No network under the reference lock');
                return download(url);
            },
        },
    });
    const prisma = {
        $transaction: (operation) => {
            const promise = lock.then(async () => {
                activeLocks++;
                try {
                    if (onLock) await onLock();
                    return await operation({ $executeRaw: async () => 1 });
                } finally {
                    activeLocks--;
                }
            });
            lock = promise.catch(() => {});
            return promise;
        },
    };
    const create = () =>
        new GeofilesService(
            { getOrThrow: (k) => (k === 'APP_SECRET' ? 's'.repeat(64) : 'sub.example.test') },
            { getAllTemplates: async () => templates },
            prisma,
        );
    const service = create();
    const read = async (id, filename = 'latest.dat') => {
        const { stream } = await service.download(id, filename);
        const chunks = [];
        for await (const part of stream) chunks.push(part);
        return Buffer.concat(chunks);
    };
    try {
        await run({
            service,
            create,
            directory,
            read,
            setBody: (v) => {
                body = v;
            },
            setDownload: (fn) => {
                download = fn;
            },
            setTemplates: (v) => {
                templates = v;
            },
            setOnLock: (fn) => {
                onLock = fn;
            },
            isLocked: () => activeLocks > 0,
        });
    } finally {
        if (old === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = old;
        await fs.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
}

test('native signed provider URLs protect effective attribute selections but immutable originals do not follow edits', async () =>
    fixture(async ({ service, setTemplates, read }) => {
        const source = await service.ingest('Native reference', 'geosite', async () => f.geosite);
        const prepared = await service.prepare(
            {
                remnacust: {
                    geofiles: [
                        {
                            id: source.id,
                            categories: ['example@ads'],
                            target: 'DIRECT',
                            downloadToClient: true,
                        },
                    ],
                },
            },
            'SINGBOX',
            undefined,
            'remote',
        );
        const url = prepared.route.rule_set[0].url;
        setTemplates([
            {
                templateType: 'SINGBOX',
                templateJson: { route: { rule_set: [{ type: 'remote', url }] } },
            },
        ]);
        const patch = {
            sha256: source.sha256,
            category: 'example',
            changes: [{ index: 1, remove: true }],
        };
        await assert.rejects(
            () => service.editContent(source.id, patch),
            /referenced-content-invalid/,
        );
        assert.deepEqual(await read(source.id), f.geosite);
        setTemplates([
            {
                templateType: 'SINGBOX',
                templateJson: { route: { rule_set: [{ url: url.replace('rules-', 'rules-A') }] } },
            },
        ]);
        const edited = await service.editContent(source.id, patch);
        assert.notEqual(edited.sha256, source.sha256);
        const restored = await service.replaceData(source.id, edited.sha256, async () => f.geosite);
        setTemplates([
            {
                templateType: 'SINGBOX',
                templateJson: { route: { rule_set: [{ url: source.url }] } },
            },
        ]);
        await service.editContent(source.id, { ...patch, sha256: restored.sha256 });
        assert.deepEqual(await read(source.id, source.filename), f.geosite);
    }));

test('signed native Xray bundle references prevent removing included categories', async () =>
    fixture(async ({ service, setTemplates }) => {
        const data = Buffer.concat([f.geosite, entry('OTHER', f.domain(2, 'other.test'))]);
        const source = await service.ingest('Native bundle', 'geosite', async () => data);
        const url = await service.bundleUrl('geosite', [source.id], { [source.id]: ['example'] });
        setTemplates([
            { templateType: 'XRAY_JSON', templateJson: { customGeodata: { geosite: url } } },
        ]);
        await assert.rejects(
            () =>
                service.replaceData(source.id, source.sha256, async () =>
                    entry('OTHER', f.domain(2, 'other.test')),
                ),
            /referenced-content-invalid/,
        );
        assert.equal((await service.list())[0].sha256, source.sha256);
    }));

test('metadata ENOSPC after blob rename leaves no orphan current blobs and retains active and immutable bytes', async () => {
    let fail = false;
    await fixture(
        async ({ service, directory, read }) => {
            const source = await service.ingest(
                'Disk-full fixture',
                'geosite',
                async () => f.geosite,
            );
            const first = await service.editContent(source.id, {
                sha256: source.sha256,
                category: 'example',
                changes: [{ index: 0, value: 'retained.test' }],
            });
            const active = await read(source.id);
            fail = true;
            for (let n = 0; n < 3; n++)
                await assert.rejects(
                    () =>
                        service.editContent(source.id, {
                            sha256: first.sha256,
                            category: 'example',
                            changes: [{ index: 0, value: `failed-${n}.test` }],
                        }),
                    { code: 'ENOSPC' },
                );
            const slot = path.join(
                directory,
                'geofiles',
                String(parseInt(source.id.slice(0, 2), 16)).padStart(2, '0'),
            );
            assert.deepEqual(
                (await fs.readdir(slot)).filter((name) => name.startsWith('current-')),
                ['current-' + first.sha256],
            );
            assert.deepEqual(await read(source.id), active);
            assert.deepEqual(await read(source.id, source.filename), f.geosite);
            assert.equal((await service.list())[0].sha256, first.sha256);
        },
        {
            writeFile: async (name, ...args) => {
                if (fail && /refresh-[a-f0-9]{32}\.tmp$/.test(String(name)))
                    throw Object.assign(Error('disk full'), { code: 'ENOSPC' });
                return fs.writeFile(name, ...args);
            },
        },
    );
});

test('multipart copy supplier runs only inside bounded editor admission and validates before creating a copy', async () =>
    fixture(async ({ service }) => {
        const source = await service.ingest('Multipart budget', 'geosite', async () => f.geosite);
        const pending = new Map();
        const supplier = (key) => () => new Promise((resolve) => pending.set(key, resolve));
        const a = service.copyData(source.id, source.sha256, supplier('a'));
        const b = service.copyData(source.id, source.sha256, supplier('b'));
        const rejected = assert.rejects(() => b, /copy-selections/);
        let invoked = false;
        await assert.rejects(
            () =>
                service.copyData(source.id, source.sha256, async () => {
                    invoked = true;
                    return {};
                }),
            /busy/,
        );
        assert.equal(invoked, false);
        while (pending.size < 2) await new Promise((resolve) => setImmediate(resolve));
        pending.get('a')({
            name: 'Copy A',
            data: f.geosite,
            selections: [{ format: 'SINGBOX', categories: ['example@ads'] }],
        });
        pending.get('b')({
            name: 'Copy B',
            data: f.geosite,
            selections: [{ format: 'SINGBOX', categories: ['missing'] }],
        });
        await a;
        await rejected;
        assert.equal((await service.list()).length, 2);
        await assert.rejects(
            () =>
                service.copyData(source.id, '0'.repeat(64), async () => {
                    invoked = true;
                    return {};
                }),
            /stale/,
        );
        assert.equal(invoked, false);
    }));

test('editor reads legacy duplicate singular fields using the last correctly typed value while commits use the shared strict validator', async () => {
    const { compileDatAsync, datCategoriesAsync, validateGeofileAsync } = load(
        path.join(root, 'geofile-editor.ts'),
        modules,
    );
    const unknown = f.number(12, 77);
    const attrs = Buffer.concat([
        f.bytes(3, Buffer.concat([f.bytes(1, 'old'), f.bytes(1, 'ads'), f.number(2, 1)])),
        f.bytes(3, Buffer.concat([f.bytes(1, 'other'), f.number(2, 0)])),
    ]);
    const record = Buffer.concat([
        f.number(1, 0),
        f.bytes(2, 'old.test'),
        f.number(1, 3),
        f.bytes(2, 'last.test'),
        attrs,
        unknown,
    ]);
    const data = f.bytes(
        1,
        Buffer.concat([f.bytes(1, 'OLD'), f.bytes(1, 'EXAMPLE'), f.bytes(2, record)]),
    );
    assert.deepEqual(await datCategoriesAsync(data), ['example']);
    assert.deepEqual(geofileContent(data, 'geosite', { category: 'example' }).records, [
        { index: 0, type: 'full', value: 'last.test', attributeCount: 2 },
    ]);
    assert.deepEqual((await compileDatAsync(data, 'geosite', ['example@ads'])).domains, [
        { type: 3, value: 'last.test' },
    ]);
    await assert.rejects(() => compileDatAsync(data, 'geosite', ['example@old']), /empty/);
    await assert.rejects(
        () =>
            compileDatAsync(entry('EXAMPLE', f.domain(3, 'uppercase.test', 'ADS')), 'geosite', [
                'example@ads',
            ]),
        /empty/,
    );
    await assert.rejects(() => validateGeofileAsync(data, 'geosite'), /duplicate-field/);
    const reverse = f.bytes(
        1,
        Buffer.concat([[...geofileFields(f.geoip)][0].value, f.number(3, 1), f.number(3, 0)]),
    );
    assert.deepEqual((await compileDatAsync(reverse, 'geoip', ['ru'])).ips, ['203.0.113.0/24']);
    const invalid = entry('EXAMPLE', f.domain(1, '['));
    await assert.rejects(() => validateGeofileAsync(invalid, 'geosite'), /regexp/);
    await assert.rejects(
        () =>
            load(path.join(root, 'geofile-editor.ts'), modules).editGeofileAsync(
                f.geosite,
                'geosite',
                { category: 'example', additions: [{ type: 'regexp', value: '[' }] },
            ),
        /regexp/,
    );
});

test('refresh metadata ENOSPC cannot leave an unpublished current blob behind', async () => {
    let writes = 0;
    await fixture(
        async ({ service, directory, setBody, read }) => {
            const source = await service.ingest(
                'Refresh disk fixture',
                'geosite',
                async () => f.geosite,
            );
            await service.configureRefresh(source.id, {
                sourceUrl: 'https://example.com/geosite.dat',
                enabled: true,
            });
            setBody(entry('EXAMPLE', f.domain(2, 'refresh.test')));
            writes = 2;
            assert.equal(await service.refreshNow(source.id), false);
            const slot = path.join(
                directory,
                'geofiles',
                String(parseInt(source.id.slice(0, 2), 16)).padStart(2, '0'),
            );
            assert.deepEqual(
                (await fs.readdir(slot)).filter((name) =>
                    /^(current-|download-|refresh-)/.test(name),
                ),
                [],
            );
            assert.deepEqual(await read(source.id), f.geosite);
            assert.equal((await service.list())[0].refresh.lastError, 'geofile-refresh-failed');
        },
        {
            writeFile: async (name, ...args) => {
                if (/refresh-[a-f0-9]{32}\.tmp$/.test(String(name)) && writes > 0 && --writes === 0)
                    throw Object.assign(Error('disk full'), { code: 'ENOSPC' });
                return fs.writeFile(name, ...args);
            },
        },
    );
});

test('DAT category pagination/search retain absolute indexes across repeated entries and preserve attributes/unknown fields', () => {
    const unknown = Buffer.concat([
        f.number(12, 19),
        Buffer.from([117, 1, 2, 3, 4]),
        Buffer.from([121, 8, 7, 6, 5, 4, 3, 2, 1]),
    ]);
    const repeatedAttribute = f.bytes(
        3,
        Buffer.concat([f.bytes(1, 'other'), f.number(2, 0), f.number(11, 9)]),
    );
    const first = Buffer.concat([f.domain(3, 'one.test', 'ads'), repeatedAttribute, unknown]);
    const other = entry('OTHER', f.domain(2, 'untouched.test'));
    const fixedRoot = Buffer.from([117, 1, 2, 3, 4]);
    const fixedEntry = Buffer.from([121, 8, 7, 6, 5, 4, 3, 2, 1]);
    const data = Buffer.concat([
        fixedRoot,
        f.bytes(1, Buffer.concat([f.bytes(1, 'EXAMPLE'), fixedEntry, f.bytes(2, first)])),
        other,
        entry('example', f.domain(2, 'two.test')),
    ]);
    validateGeofile(data, 'geosite');
    const page = geofileContent(data, 'geosite', {
        category: 'EXAMPLE',
        search: 'two',
        limit: '1',
    });
    assert.deepEqual(page.records, [
        { index: 1, type: 'domain', value: 'two.test', attributeCount: 0 },
    ]);
    const edited = editGeofile(data, 'geosite', {
        category: 'example',
        changes: [{ index: 0, type: 'keyword', value: 'changed' }],
        additions: [{ type: 'full', value: 'added.test' }],
    });
    assert(edited.includes(other));
    assert(edited.includes(fixedRoot));
    assert(edited.includes(fixedEntry));
    const record = [...geofileFields([...geofileFields(edited)][0].value)].find(
        (v) => v.field === 2,
    ).value;
    assert(record.includes(unknown));
    assert(record.includes(repeatedAttribute));
    assert.equal(
        geofileContent(edited, 'geosite', { category: 'example' }).records[0].attributeCount,
        2,
    );
    assert.deepEqual(
        geofileContent(edited, 'geosite', { category: 'example' }).records.map((v) => v.value),
        ['changed', 'added.test', 'two.test'],
    );
    assert.throws(() =>
        editGeofile(data, 'geosite', {
            category: 'example',
            changes: [{ index: 9, remove: true }],
        }),
    );
    assert.throws(
        () =>
            editGeofile(data, 'geosite', {
                category: 'example',
                changes: [{ index: 0, remove: true }],
            }),
        /empty/,
    );
    assert.throws(() => geofileContent(data, 'geosite', { category: 'example', limit: 201 }));
});

test('GeoIP editing preserves reverse/unknown entry fields and encodes IPv4/IPv6', () => {
    const original = [...geofileFields(f.geoip)][0].value;
    const flags = Buffer.concat([f.number(3, 1), f.number(13, 9)]);
    const data = f.bytes(1, Buffer.concat([original, flags]));
    const edited = editGeofile(data, 'geoip', {
        category: 'ru',
        changes: [{ index: 0, type: 'ip', value: '2001:db8::/32' }],
        additions: [{ type: 'ip', value: '192.0.2.0/24' }],
    });
    assert(edited.includes(flags));
    assert.deepEqual(
        geofileContent(edited, 'geoip', { category: 'ru' }).records.map((v) => v.value),
        ['2001:db8::/32', '192.0.2.0/24'],
    );
    for (const value of ['127.0.0.1/33', '::1/129', 'example.com/24'])
        assert.throws(() =>
            editGeofile(f.geoip, 'geoip', { category: 'ru', additions: [{ type: 'ip', value }] }),
        );
});

test('partial DAT changes preserve the omitted type/value and unchanged records byte-for-byte', () => {
    const changed = editGeofile(f.geosite, 'geosite', {
        category: 'example',
        changes: [{ index: 0, value: 'partial.test' }],
    });
    assert.equal(
        geofileContent(changed, 'geosite', { category: 'example' }).records[0].type,
        'domain',
    );
    const changedType = editGeofile(changed, 'geosite', {
        category: 'example',
        changes: [{ index: 0, type: 'full' }],
    });
    assert.deepEqual(geofileContent(changedType, 'geosite', { category: 'example' }).records[0], {
        index: 0,
        type: 'full',
        value: 'partial.test',
        attributeCount: 0,
    });
    assert.deepEqual(
        editGeofile(f.geosite, 'geosite', { category: 'example', changes: [{ index: 0 }] }),
        f.geosite,
    );
});

test('copy selections strictly bound query/body schema and reject disappearing attributes before creating files', async () =>
    fixture(async ({ service, read, setTemplates }) => {
        for (const value of [
            null,
            {},
            '[]',
            [{ format: 'UNKNOWN', categories: [] }],
            [{ format: 'SINGBOX', categories: [], extra: true }],
            [{ format: 'SINGBOX', categories: 'example' }],
            Array.from({ length: 33 }, () => ({ format: 'SINGBOX', categories: ['example'] })),
            [{ format: 'SINGBOX', categories: Array(33).fill('example') }],
        ])
            assert.throws(() => parseGeofileSelections(value));
        assert.throws(() => parseGeofileSelections('x'.repeat(2049), true));
        assert.deepEqual(parseGeofileSelections('[]', true), []);
        const file = await service.ingest('Source', 'geosite', async () => f.geosite);
        setTemplates([
            {
                templateType: 'SINGBOX',
                templateJson: {
                    remnacust: {
                        geofiles: [{ id: file.id, categories: ['example@ads'], target: 'DIRECT' }],
                    },
                },
            },
        ]);
        const selections = [{ format: 'SINGBOX', categories: ['example@ads'] }];
        const patch = {
            name: 'Rejected',
            sha256: file.sha256,
            category: 'example',
            changes: [{ index: 1, remove: true }],
            selections,
        };
        await assert.rejects(() => service.editContent(file.id, patch, true), /copy-selections/);
        const noAds = editGeofile(f.geosite, 'geosite', {
            category: 'example',
            changes: [{ index: 1, remove: true }],
        });
        await assert.rejects(
            () =>
                service.replaceData(
                    file.id,
                    file.sha256,
                    async () => noAds,
                    'Rejected raw',
                    selections,
                ),
            /copy-selections/,
        );
        assert.equal((await service.list()).length, 1);
        assert.deepEqual(await read(file.id), f.geosite);
        const copy = await service.editContent(
            file.id,
            { ...patch, name: 'Valid', changes: [{ index: 1, value: 'new.test' }] },
            true,
        );
        assert.notEqual(copy.id, file.id);
        const unattached = await service.editContent(
            file.id,
            { ...patch, name: 'Unattached', selections: [] },
            true,
        );
        assert.notEqual(unattached.id, file.id);
        await assert.rejects(
            () =>
                service.editContent(
                    file.id,
                    {
                        ...patch,
                        name: 'Wrong format',
                        selections: [{ format: 'CLASH', categories: ['example'] }],
                        changes: [{ index: 1, type: 'regexp', value: '^example' }],
                    },
                    true,
                ),
            /copy-selections/,
        );
    }));

test('text preserves complete JSON/YAML/text documents and SRS explicitly exposes binary-only replacement', () => {
    for (const [kind, data] of [
        ['singbox-json', text('one.test')],
        ['mihomo-domain', Buffer.from('# keep comment\npayload:\n  - one.test\n')],
        ['mihomo-text-ipcidr', Buffer.from('# keep comment\n192.0.2.0/24\n')],
    ]) {
        const content = geofileContent(data, kind, {});
        assert.equal(content.mode, 'text');
        assert.equal(content.text, data.toString());
        assert.deepEqual(editGeofile(data, kind, {}), data);
        validateGeofile(
            editGeofile(data, kind, { text: data.toString().replace('one.test', 'two.test') }),
            kind,
        );
    }
    const srs = Buffer.concat([
        Buffer.from('53525301', 'hex'),
        deflateSync(Buffer.from([1, 0, 255, 0])),
    ]);
    assert.equal(geofileContent(srs, 'singbox-srs', {}).mode, 'binary');
    assert.throws(() => editGeofile(srs, 'singbox-srs', { text: '{}' }));
    assert.equal(
        geofileContent(Buffer.alloc(8 * 1024 * 1024 + 1), 'mihomo-domain', {}).mode,
        'binary',
    );
    assert.throws(() => editGeofile(text('one.test'), 'singbox-json', { text: '{}' }));
});

test('copy+edit is atomic, named uniquely, independent even without edits, and never inherits refresh source', async () =>
    fixture(async ({ service, directory }) => {
        const source = await service.ingest('Original', 'geosite', async () => f.geosite);
        await service.configureRefresh(source.id, {
            sourceUrl: 'https://example.com/geosite.dat',
            enabled: true,
        });
        for (const name of [' original ', 'ORIGINAL'])
            await assert.rejects(
                () => service.editContent(source.id, { sha256: source.sha256, name }, true),
                /name-exists/,
            );
        const copy = await service.editContent(
            source.id,
            { sha256: source.sha256, name: 'Named copy' },
            true,
        );
        assert.notEqual(copy.id, source.id);
        assert.equal(copy.origin, 'copy');
        assert.equal(copy.refresh, undefined);
        assert.equal(copy.name, 'Named copy');
        assert.equal(copy.sha256, source.sha256);
        await assert.rejects(
            () =>
                service.editContent(source.id, { sha256: source.sha256, name: 'named COPY' }, true),
            /name-exists/,
        );
        await assert.rejects(() =>
            service.editContent(
                source.id,
                {
                    sha256: source.sha256,
                    name: 'Invalid copy',
                    category: 'example',
                    changes: [{ index: 50, remove: true }],
                },
                true,
            ),
        );
        assert.equal((await service.list()).length, 2);
        assert.equal(
            (await fs.readdir(path.join(directory, 'geofiles'))).some((v) =>
                v.startsWith('editor-'),
            ),
            false,
        );
    }));

test('manual edit uses active SHA, preserves original bytes, refresh settings, and is visible across instances', async () =>
    fixture(async ({ service, create, read }) => {
        const source = await service.ingest('Original', 'geosite', async () => f.geosite);
        const other = create();
        await other.content(source.id, { category: 'example' });
        const edited = await service.editContent(source.id, {
            sha256: source.sha256,
            category: 'example',
            changes: [{ index: 1, type: 'full', value: 'updated.test' }],
        });
        assert.notEqual(edited.sha256, source.sha256);
        assert.equal(edited.refresh.enabled, false);
        assert.equal(edited.refresh.sourceUrl, undefined);
        assert.equal(edited.original.sha256, source.sha256);
        assert.equal(edited.url.endsWith('/latest.dat'), true);
        assert.deepEqual(await read(source.id, source.filename), f.geosite);
        assert.equal(sha(await read(source.id)), edited.sha256);
        assert.equal(
            (await other.content(source.id, { category: 'example' })).records[1].value,
            'updated.test',
        );
        assert.equal((await other.list())[0].sha256, edited.sha256);
        assert.equal(
            (await service.configureRefresh(source.id, { enabled: false })).sha256,
            edited.sha256,
        );
        await assert.rejects(
            () => other.editContent(source.id, { sha256: source.sha256 }),
            /stale/,
        );
        await assert.rejects(
            () => other.replaceData(source.id, source.sha256, async () => f.geosite),
            /stale/,
        );
    }));

test('six exact preset imports and legacy source URLs require copies; similar URLs remain editable', async () =>
    fixture(async ({ service, directory }) => {
        let index = 0;
        for (const url of PRESET_GEOFILE_URLS) {
            const preset = await service.importUrl('Preset ' + index++, 'geosite', url);
            assert.equal(preset.origin, 'preset');
            assert.equal(preset.editPolicy, 'copy');
            await assert.rejects(
                () => service.editContent(preset.id, { sha256: preset.sha256 }),
                /copy-required/,
            );
            await assert.rejects(
                () => service.replaceData(preset.id, preset.sha256, async () => f.geosite),
                /copy-required/,
            );
            const directoryPath = path.join(
                directory,
                'geofiles',
                String(parseInt(preset.id.slice(0, 2), 16)).padStart(2, '0'),
            );
            const metadata = JSON.parse(
                await fs.readFile(path.join(directoryPath, 'meta.json'), 'utf8'),
            );
            delete metadata.origin;
            delete metadata.editPolicy;
            await fs.writeFile(path.join(directoryPath, 'meta.json'), JSON.stringify(metadata));
            assert.equal((await service.content(preset.id, {})).file.editPolicy, 'copy');
            const copy = await service.editContent(
                preset.id,
                { name: 'Preset copy ' + index, sha256: preset.sha256 },
                true,
            );
            assert.equal(copy.editPolicy, 'edit');
            assert.equal(copy.refresh, undefined);
        }
        const similar = await service.importUrl(
            'Custom',
            'geosite',
            [...PRESET_GEOFILE_URLS][0] + '?custom=1',
        );
        assert.equal(similar.editPolicy, 'edit');
        const legacy = (await service.list()).find((file) => file.editPolicy === 'copy');
        await service.configureRefresh(legacy.id, {
            sourceUrl: 'https://example.com/new.dat',
            enabled: false,
        });
        assert.equal((await service.content(legacy.id, {})).file.editPolicy, 'copy');
    }));

test('raw SRS replacement and copy-data retain binary format and reject malformed replacements', async () =>
    fixture(async ({ service, read }) => {
        const srs = Buffer.concat([
            Buffer.from('53525301', 'hex'),
            deflateSync(Buffer.from([1, 0, 255, 0])),
        ]);
        const file = await service.ingest('Binary', 'singbox-srs', async () => srs);
        assert.equal((await service.content(file.id, {})).mode, 'binary');
        await assert.rejects(
            () => service.editContent(file.id, { sha256: file.sha256 }),
            /binary-replacement-required/,
        );
        await assert.rejects(() =>
            service.replaceData(file.id, file.sha256, async () => Buffer.from('invalid')),
        );
        const copy = await service.replaceData(
            file.id,
            file.sha256,
            async () => srs,
            'Binary copy',
        );
        assert.equal(copy.kind, 'singbox-srs');
        assert.notEqual(copy.id, file.id);
        const saved = await service.replaceData(file.id, file.sha256, async () => srs);
        assert.deepEqual(await read(file.id, 'latest.srs'), srs);
        assert.equal(saved.refresh.enabled, false);
    }));

test('saved template categories and concurrent reference changes reject edits with no partial commit', async () =>
    fixture(async ({ service, read, setTemplates, setOnLock }) => {
        const file = await service.ingest('Original', 'geosite', async () => f.geosite);
        setTemplates([
            {
                templateType: 'SINGBOX',
                templateJson: {
                    remnacust: {
                        geofiles: [{ id: file.id, categories: ['example@ads'], target: 'DIRECT' }],
                    },
                },
            },
        ]);
        const replacement = entry('OTHER', f.domain(2, 'other.test'));
        await assert.rejects(
            () => service.replaceData(file.id, file.sha256, async () => replacement),
            /referenced-content-invalid/,
        );
        assert.deepEqual(await read(file.id), f.geosite);
        setOnLock(() => {
            setTemplates([]);
            setOnLock(undefined);
        });
        await assert.rejects(
            () =>
                service.editContent(file.id, {
                    sha256: file.sha256,
                    category: 'example',
                    additions: [{ type: 'full', value: 'extra.test' }],
                }),
            /references-changed/,
        );
        assert.deepEqual(await read(file.id), f.geosite);
    }));

test('late refresh cannot overwrite a manual edit or reenable automatic downloads', async () =>
    fixture(async ({ service, read, setDownload }) => {
        const file = await service.ingest('Original', 'geosite', async () => f.geosite);
        await service.configureRefresh(file.id, {
            sourceUrl: 'https://example.com/geosite.dat',
            enabled: true,
        });
        let release, started;
        const ready = new Promise((r) => {
            started = r;
        });
        setDownload(() => {
            started();
            return new Promise((r) => {
                release = r;
            });
        });
        const refreshing = service.refreshNow(file.id);
        await ready;
        const edited = await service.editContent(file.id, {
            sha256: file.sha256,
            category: 'example',
            additions: [{ type: 'full', value: 'manual.test' }],
        });
        release(entry('EXAMPLE', f.domain(2, 'remote.test')));
        assert.equal(await refreshing, false);
        assert.equal(sha(await read(file.id)), edited.sha256);
        assert.equal((await service.list())[0].refresh.enabled, false);
    }));

test('concurrent cross-instance CAS has one winner and admission bounds live request buffers to two', async () =>
    fixture(async ({ service, create, read }) => {
        const file = await service.ingest('Original', 'geosite', async () => f.geosite);
        const other = create();
        const results = await Promise.allSettled([
            service.editContent(file.id, {
                sha256: file.sha256,
                category: 'example',
                additions: [{ type: 'full', value: 'first.test' }],
            }),
            other.editContent(file.id, {
                sha256: file.sha256,
                category: 'example',
                additions: [{ type: 'full', value: 'second.test' }],
            }),
        ]);
        assert.equal(results.filter((v) => v.status === 'fulfilled').length, 1);
        assert.equal(results.find((v) => v.status === 'rejected').reason.getStatus(), 409);
        const current = (await service.list())[0];
        assert.equal(sha(await read(file.id)), current.sha256);
        let release;
        const pending = new Promise((r) => {
            release = r;
        });
        const a = service.replaceData(file.id, current.sha256, () => pending);
        const b = service.replaceData(file.id, current.sha256, () => pending);
        await assert.rejects(() => service.content(file.id, {}), /busy/);
        release(await read(file.id));
        assert((await Promise.allSettled([a, b])).every((v) => v.status === 'fulfilled'));
    }));

test('symlinked data and metadata never disclose external files or permit edits', async (t) =>
    fixture(async ({ service, directory }) => {
        const file = await service.ingest('Original', 'geosite', async () => f.geosite);
        const slot = path.join(directory, 'geofiles', '00');
        const external = path.join(directory, 'external.dat');
        await fs.writeFile(external, f.geosite);
        await fs.rename(path.join(slot, 'data'), path.join(slot, 'data-original'));
        try {
            await fs.symlink(external, path.join(slot, 'data'));
        } catch (error) {
            if (['EPERM', 'EACCES'].includes(error.code)) {
                t.skip('Host does not permit file symlinks');
                return;
            }
            throw error;
        }
        await assert.rejects(() => service.content(file.id, {}));
        await assert.rejects(() =>
            service.editContent(file.id, { sha256: file.sha256, name: 'Forbidden copy' }, true),
        );

        assert.deepEqual(await fs.readFile(external), f.geosite);
        await fs.unlink(path.join(slot, 'data'));
        await fs.rename(path.join(slot, 'data-original'), path.join(slot, 'data'));
        const externalMeta = path.join(directory, 'external-meta.json');
        await fs.rename(path.join(slot, 'meta.json'), externalMeta);
        await fs.symlink(externalMeta, path.join(slot, 'meta.json'));
        await assert.rejects(() => service.content(file.id, {}));
    }));
