const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const load = require('./load-typescript.cjs');
const { frontendAssets } = load(path.join(__dirname, '../src/common/frontend/frontend.module.ts'), {
    '../utils/get-assets-path': { getAssetsPath: () => '' },
});

test('frontend assets preserve API routing and restrict immutable caching to versioned assets', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'remnacust-assets-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'index.html'), '<main>Panel</main>');
    await fs.writeFile(path.join(root, 'main-12345678.js'), 'window.fixture=true');
    await fs.writeFile(path.join(root, '.env'), 'must-not-be-served');
    const app = express();
    app.use(frontendAssets(root));
    app.use((req, res) => res.status(418).json({ downstream: true }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}`;
    for (const pathname of ['/api', '/api/auth/status', '/API/status', '/%61pi/status', '/api%2Fstatus', '/%ZZ']) {
        assert.equal((await fetch(url + pathname)).status, 418, pathname);
    }
    assert.equal((await fetch(url + '/dashboard/users', { method: 'POST' })).status, 418);
    const page = await fetch(url + '/dashboard/users');
    assert.equal(await page.text(), '<main>Panel</main>');
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    const asset = await fetch(url + '/main-12345678.js', { method: 'HEAD' });
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(await asset.text(), '');
    assert(!(await (await fetch(url + '/.env')).text()).includes('must-not-be-served'));
});
