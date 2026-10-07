const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const manifest = require('../patches/manifest.json');

test('dependency patching is idempotent and rejects changed files before writing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remnacust-dependency-patches-'));
    try {
        fs.mkdirSync(path.join(root, 'scripts'));
        fs.mkdirSync(path.join(root, 'patches'));
        fs.copyFileSync(path.join(__dirname, '../scripts/apply-dependency-patches.cjs'), path.join(root, 'scripts/apply-dependency-patches.cjs'));
        fs.writeFileSync(path.join(root, 'patches/manifest.json'), JSON.stringify(manifest));
        const originals = new Map();
        for (const patch of manifest) {
            let text = fs.readFileSync(path.join(__dirname, '..', patch.path), 'utf8').replace(/\r\n/g, '\n');
            for (const change of [...patch.changes].reverse()) text = text.replace(change.after, change.before);
            const target = path.join(root, patch.path);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, text);
            originals.set(target, text);
        }
        const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/apply-dependency-patches.cjs')], { encoding: 'utf8' });
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
