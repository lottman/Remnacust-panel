const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const f = require('./geofiles-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = { ...mocks, '../generators/client-pool': pool };
const editor = load(path.join(root, 'geofile-editor.ts'), modules);
const { compileDat, datCategories } = load(path.join(root, 'compile-dat.ts'), modules);
const { bundleDat } = load(path.join(root, 'bundle-dat.ts'), modules);

test('cooperative DAT helpers preserve pure-helper results, validation and round-trip fields', async () => {
    for (const [kind, data, category] of [
        ['geosite', f.geosite, 'example'],
        ['geoip', f.geoip, 'ru'],
    ]) {
        const patch = {
            category,
            additions: [
                {
                    type: kind === 'geoip' ? 'ip' : 'full',
                    value: kind === 'geoip' ? '2001:db8::/32' : 'added.test',
                },
            ],
        };
        const expected = editor.editGeofile(data, kind, patch);
        assert.deepEqual(await editor.editGeofileAsync(data, kind, patch), expected);
        assert.deepEqual(
            await editor.geofileContentAsync(expected, kind, { category }),
            editor.geofileContent(expected, kind, { category }),
        );
        assert.deepEqual(await editor.datCategoriesAsync(expected), datCategories(expected));
        assert.deepEqual(
            await editor.compileDatAsync(expected, kind, [category]),
            compileDat(expected, kind, [category]),
        );
        await editor.validateGeofileAsync(expected, kind);
        const id = '00' + 'a'.repeat(32);
        bundleDat([{ id, data: expected }]);
        await editor.validateNativeDatAsync(expected, id);
    }
    assert.deepEqual(
        await editor.compileDatAsync(f.geosite, 'geosite', ['example@ads']),
        compileDat(f.geosite, 'geosite', ['example@ads']),
    );
    await assert.rejects(
        () => editor.compileDatAsync(f.geosite, 'geosite', ['example@missing']),
        /empty/,
    );
    await assert.rejects(
        () =>
            editor.validateNativeDatAsync(
                Buffer.concat([f.geosite, f.geosite]),
                '00' + 'a'.repeat(32),
            ),
        /duplicate/,
    );
    await assert.rejects(() => editor.validateGeofileAsync(Buffer.from([10, 255]), 'geosite'));
    const unknown = Buffer.from([117, 1, 2, 3, 4]);
    const attributed = f.bytes(
        1,
        Buffer.concat([
            f.bytes(1, 'EXAMPLE'),
            unknown,
            f.bytes(2, Buffer.concat([f.domain(3, 'attr.test', 'ads'), unknown])),
        ]),
    );
    const edited = await editor.editGeofileAsync(attributed, 'geosite', {
        category: 'example',
        changes: [{ index: 0, value: 'changed.test' }],
    });
    assert.deepEqual(
        edited,
        editor.editGeofile(attributed, 'geosite', {
            category: 'example',
            changes: [{ index: 0, value: 'changed.test' }],
        }),
    );
    assert.equal(
        (await editor.geofileContentAsync(edited, 'geosite', { category: 'example' })).records[0]
            .attributeCount,
        1,
    );
});

test('large DAT GET/search/edit and commit preflight yield while scanning, with bounded pages and stable indexes', async (t) => {
    const count = Number(process.env.GEOFILE_EDITOR_PERF_RECORDS ?? 100_000);
    assert(Number.isSafeInteger(count) && count >= 1000 && count <= 2_000_000);
    const encoded = f.bytes(2, f.domain(2, 'repeat-record.example.test'));
    const chunkCount = Math.ceil(count / 250_000),
        entries = [];
    for (let index = 0, remaining = count; index < chunkCount; index++) {
        const size = Math.min(remaining, 250_000);
        entries.push(
            f.bytes(
                1,
                Buffer.concat([
                    f.bytes(1, 'LARGE'),
                    Buffer.allocUnsafe(encoded.length * size).fill(encoded),
                ]),
            ),
        );
        remaining -= size;
    }
    const data = Buffer.concat(entries);
    assert(data.length <= 64 * 1024 * 1024);
    const metrics = [];
    async function observe(name, operation) {
        let ticks = 0,
            last = performance.now(),
            maxGapMs = 0;
        const start = last;
        const timer = setInterval(() => {
            const now = performance.now();
            maxGapMs = Math.max(maxGapMs, now - last);
            last = now;
            ticks++;
        }, 0);
        try {
            const result = await operation();
            maxGapMs = Math.max(maxGapMs, performance.now() - last);
            assert(ticks > 0, name + ' must permit timer progress before completing');
            metrics.push({
                name,
                elapsedMs: Math.round(performance.now() - start),
                ticks,
                maxGapMs: Math.round(maxGapMs),
            });
            return result;
        } finally {
            clearInterval(timer);
        }
    }
    const page = await observe('GET', () =>
        editor.geofileContentAsync(data, 'geosite', {
            category: 'large',
            page: Math.ceil(count / 100),
            limit: 100,
        }),
    );
    assert.equal(page.total, count);
    assert(page.records.length <= 100);
    assert.equal(page.records.at(-1).index, count - 1);
    const search = await observe('search', () =>
        editor.geofileContentAsync(data, 'geosite', {
            category: 'large',
            search: 'absent',
            limit: 200,
        }),
    );
    assert.equal(search.total, 0);
    assert.equal(search.records.length, 0);
    const edited = await observe('edit', () =>
        editor.editGeofileAsync(data, 'geosite', {
            category: 'large',
            changes: [{ index: count - 1, value: 'changed.example.test' }],
        }),
    );
    await observe('commit-validation', () => editor.validateGeofileAsync(edited, 'geosite'));
    await observe('commit-categories', () => editor.datCategoriesAsync(edited));
    await observe('template-preflight', () =>
        editor.compileDatAsync(edited, 'geosite', ['large'], true),
    );
    const last = await editor.geofileContentAsync(edited, 'geosite', {
        category: 'large',
        search: 'changed',
    });
    assert.equal(last.records.length, 1);
    assert.equal(last.records[0].index, count - 1);
    t.diagnostic(JSON.stringify({ records: count, bytes: data.length, metrics }));
});
