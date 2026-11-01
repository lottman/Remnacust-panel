const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const manifest = require('../patches/manifest.json');

for (const entry of ['deepmerge', 'deepmerge/dist/umd.js']) {
    const merge = require(entry);
    test(`${entry}: own __proto__ data cannot change the result prototype`, () => {
        const payload = JSON.parse('{"__proto__":{"injected":true},"title":"schema"}');
        for (const result of [
            merge(payload, {}),
            merge(Object.create(null), payload),
            merge(payload, payload),
            merge({ nested: payload }, { nested: {} }).nested,
            merge([payload], [])[0],
            merge.all([payload, { description: 'valid' }]),
        ]) {
            assert.equal(Object.getPrototypeOf(result), Object.prototype);
            assert.equal(result.injected, undefined);
            assert.equal(result.title, 'schema');
        }
        assert.equal(Object.prototype.injected, undefined);
    });

    test(`${entry}: schema merging preserves arrays, symbols and custom merging`, () => {
        const symbol = Symbol('metadata');
        const left = {
            properties: { name: { type: 'string' } },
            required: ['name'],
            [symbol]: { a: 1 },
        };
        const right = {
            properties: { age: { type: 'number' } },
            required: ['age'],
            [symbol]: { b: 2 },
        };
        assert.deepEqual(merge(left, right), {
            properties: { name: { type: 'string' }, age: { type: 'number' } },
            required: ['name', 'age'],
            [symbol]: { a: 1, b: 2 },
        });
        assert.deepEqual(merge(left, right, { arrayMerge: (_, source) => source }).required, [
            'age',
        ]);
        assert.deepEqual(
            merge(left, right, {
                customMerge: (key) => (key === 'required' ? (a, b) => [...b, ...a] : undefined),
            }).required,
            ['age', 'name'],
        );
        assert.deepEqual(left.required, ['name']);
        assert.deepEqual(right.required, ['age']);
    });
}

test('malformed compressed JSON cannot terminate the HTTP process after parsing', () => {
    const result = spawnSync(
        process.execPath,
        [
            '-e',
            `
        const assert = require('node:assert/strict');
        const http = require('node:http');
        const zlib = require('node:zlib');
        const express = require('express');
        const app = express();
        app.use(express.json());
        app.post('/', (req, res) => res.json(req.body));
        app.get('/health', (_, res) => res.send('alive'));
        app.use((error, req, res, next) => res.status(400).end());
        const server = app.listen(0, '127.0.0.1', async () => {
            const port = server.address().port;
            try {
                for (const [encoding, compress] of [['gzip', zlib.gzipSync], ['deflate', zlib.deflateSync], ['br', zlib.brotliCompressSync]]) {
                    const body = Buffer.concat([compress(Buffer.from('{}')), Buffer.from('invalid trailing bytes')]);
                    await new Promise((resolve, reject) => {
                        const request = http.request({host:'127.0.0.1',port,path:'/',method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':encoding,'Content-Length':body.length}}, response => { response.resume(); response.on('end',resolve); });
                        request.on('error',reject); request.end(body);
                    });
                }
                assert.equal(await (await fetch('http://127.0.0.1:'+port+'/health')).text(),'alive');
                console.log('compressed-body-survived');
            } catch(error) { console.error(error); process.exitCode=1; }
            finally { server.close(); server.closeAllConnections(); }
        });
    `,
        ],
        { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 10_000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /compressed-body-survived/);
});

test('oversized constrained collections reject before validating every element', () => {
    const { z } = require('zod');
    let elements = 0;
    const schema = z
        .array(
            z.string().transform((value) => {
                elements++;
                return value;
            }),
        )
        .max(5);
    const result = schema.safeParse(Array(100_000).fill('value'));
    assert.equal(result.success, false);
    assert.equal(elements, 0);
    assert.equal(result.error.issues.length, 1);
});

test('dependency patching is idempotent and rejects changed files before writing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remnacust-dependency-patches-'));
    try {
        fs.mkdirSync(path.join(root, 'scripts'));
        fs.mkdirSync(path.join(root, 'patches'));
        fs.copyFileSync(
            path.join(__dirname, '../scripts/apply-dependency-patches.cjs'),
            path.join(root, 'scripts/apply-dependency-patches.cjs'),
        );
        fs.writeFileSync(path.join(root, 'patches/manifest.json'), JSON.stringify(manifest));
        const originals = new Map();
        for (const patch of manifest) {
            let text = fs
                .readFileSync(path.join(__dirname, '..', patch.path), 'utf8')
                .replace(/\r\n/g, '\n');
            for (const change of [...patch.changes].reverse())
                text = text.replace(change.after, change.before);
            const target = path.join(root, patch.path);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, text);
            originals.set(target, text);
        }
        const run = () =>
            spawnSync(process.execPath, [path.join(root, 'scripts/apply-dependency-patches.cjs')], {
                encoding: 'utf8',
            });
        assert.equal(run().status, 0);
        const repeated = run();
        assert.equal(repeated.status, 0);
        assert.match(repeated.stdout, /0 updated/);
        for (const [target, text] of originals) fs.writeFileSync(target, text);
        const invalid = [...originals.keys()].at(-1);
        fs.appendFileSync(invalid, '\n// changed dependency\n');
        const rejected = run();
        assert.notEqual(rejected.status, 0);
        assert.match(rejected.stderr, /Dependency contents changed/);
        for (const [target, text] of originals) {
            if (target !== invalid) assert.equal(fs.readFileSync(target, 'utf8'), text);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
