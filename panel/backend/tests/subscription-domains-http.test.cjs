const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const { rspack } = require('@rspack/core');

test('the real domain module injects authentication dependencies for browser sessions and scoped API tokens', { timeout: 60000 }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remnacust-domain-http-'));
    try {
        const { default: production } = await import(pathToFileURL(path.join(__dirname, '../rspack.config.mjs')));
        const compiler = rspack({
            ...production,
            mode: 'production',
            entry: path.join(__dirname, 'fixtures/subscription-domains-http.ts'),
            output: { path: directory, filename: 'fixture.cjs' },
            plugins: [],
            devtool: false,
            optimization: { minimize: false },
        });
        try {
            const stats = await new Promise((resolve, reject) => compiler.run((error, result) => error ? reject(error) : resolve(result)));
            assert.ok(!stats.hasErrors(), stats.toString({ all: false, errors: true }));
        } finally {
            await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()));
        }
        const result = await promisify(execFile)(process.execPath, [path.join(directory, 'fixture.cjs')], {
            env: { ...process.env, NODE_PATH: path.join(__dirname, '../node_modules') },
            timeout: 40000,
        });
        assert.match(result.stdout, /PASS domain HTTP authentication and module injection/);
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
});
