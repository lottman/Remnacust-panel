const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { coreCatalog } = load(
    path.join(__dirname, '../src/modules/core-management/core-management.types.ts'),
);
test('default catalog has no private source and explicit owner releases retain checksums', () => {
    const previous = process.env.REMNACUST_CORE_CATALOG_JSON;
    try {
        delete process.env.REMNACUST_CORE_CATALOG_JSON;
        assert.deepEqual(coreCatalog(), []);
        const release = {
            id: 'custom-1',
            build: 'custom-1',
            artifacts: {
                amd64: { url: 'https://releases.example.org/xray', sha256: 'a'.repeat(64) },
                arm64: { url: 'https://releases.example.org/xray-arm64', sha256: 'b'.repeat(64) },
            },
        };
        process.env.REMNACUST_CORE_CATALOG_JSON = JSON.stringify([release]);
        assert.deepEqual(coreCatalog(), [release]);
        release.artifacts.amd64.sha256 = 'bad';
        process.env.REMNACUST_CORE_CATALOG_JSON = JSON.stringify([release]);
        assert.throws(() => coreCatalog());
    } finally {
        if (previous === undefined) delete process.env.REMNACUST_CORE_CATALOG_JSON;
        else process.env.REMNACUST_CORE_CATALOG_JSON = previous;
    }
});
