const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { fork } = require('node:child_process');
test('four API processes sharing PostgreSQL publish one entry for identical geofiles', { skip: !process.env.TEST_GEOFILES_DATABASE_URL, timeout: 45000 }, async t => {
    const url = new URL(process.env.TEST_GEOFILES_DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use an isolated local test database');
    assert.match(url.pathname, /^\/remnacust_test_/);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remnacust-geofiles-concurrency-'));
    const children = [];
    t.after(async () => { for (const child of children) if (child.exitCode === null) child.kill(); await fs.rm(directory, { recursive: true, force: true }); });
    const ready = [], completed = [];
    for (let i = 0; i < 4; i++) {
        const child = fork(path.join(__dirname, 'geofiles-import-worker.cjs'), [], { env: { ...process.env, XERA_BACKUPS_DIR: directory }, silent: true });
        children.push(child);
        ready.push(new Promise((resolve, reject) => {
            child.once('error', reject);
            child.on('message', message => { if (message.ready) resolve(); });
            child.once('exit', code => { if (code !== 0) reject(new Error('Import worker exited before ready')); });
        }));
        completed.push(new Promise((resolve, reject) => {
            let result, stderr = '';
            child.stderr.on('data', chunk => stderr += chunk);
            child.on('message', message => { if (!message.ready) result = message; });
            child.once('error', reject);
            child.once('exit', code => code === 0 && result?.id ? resolve(result.id) : reject(new Error(result?.error || stderr || `Worker exited ${code}`)));
        }));
    }
    await Promise.all(ready);
    for (const child of children) child.send({ start: true });
    const ids = await Promise.all(completed);
    assert.equal(new Set(ids).size, 1);
    const entries = await fs.readdir(path.join(directory, 'geofiles'));
    assert.equal(entries.length, 1);
    const item = JSON.parse(await fs.readFile(path.join(directory, 'geofiles', entries[0], 'meta.json'), 'utf8'));
    assert.equal(item.id, ids[0]);
});
