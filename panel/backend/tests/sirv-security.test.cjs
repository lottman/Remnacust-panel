const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

for (const build of ['build.js', 'build.mjs']) {
    test(`sirv ${build}: hostile SPA fallback paths remain bounded and normal routes work`, (t) => {
        const filename = path.join(path.dirname(require.resolve('sirv')), build);
        const worker = `
            const fs = require('node:fs');
            const os = require('node:os');
            const path = require('node:path');
            const http = require('node:http');
            const assert = require('node:assert/strict');
            const { pathToFileURL } = require('node:url');
            (async () => {
                const sirv = (await import(pathToFileURL(${JSON.stringify(filename)}))).default;
                const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sirv-security-'));
                fs.writeFileSync(path.join(root, 'index.html'), 'fixture-index');
                const server = http.createServer(sirv(root, { single: true }));
                await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
                const base = 'http://127.0.0.1:' + server.address().port;
                try {
                    assert.equal((await fetch(base + '/missing.js')).status, 404);
                    assert.equal(await (await fetch(base + '/ordinary/route')).text(), 'fixture-index');
                    const started = performance.now();
                    const response = await fetch(base + '/' + 'a.'.repeat(40) + '!');
                    assert.equal(await response.text(), 'fixture-index');
                    console.log(JSON.stringify({ hostileRequestMs: performance.now() - started }));
                } finally {
                    server.closeAllConnections();
                    await new Promise(resolve => server.close(resolve));
                    fs.rmSync(root, { recursive: true, force: true });
                }
            })().catch(error => { console.error(error); process.exitCode = 1; });
        `;
        const result = spawnSync(process.execPath, ['-e', worker], { timeout: 3000, encoding: 'utf8' });
        assert.equal(result.error?.code, undefined, 'SPA fallback blocked the process past its hard deadline');
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /hostileRequestMs/);
        t.diagnostic(result.stdout.trim());
    });
}
