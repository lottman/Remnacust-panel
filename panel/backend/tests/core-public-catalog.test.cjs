const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { coreCatalog } = load(
    path.join(__dirname, '../src/modules/core-management/core-management.types.ts'),
);
test('default catalog contains published files for both architectures and owner overrides retain checksums', () => {
    const previous = process.env.REMNACUST_CORE_CATALOG_JSON;
    try {
        delete process.env.REMNACUST_CORE_CATALOG_JSON;
        const published = coreCatalog();
        assert.ok(published.length > 0);
        for (const release of published) {
            assert.match(release.build, /^\d+\.\d+\.\d+$/);
            assert.match(release.sourceCommit, /^[a-f0-9]{40}$/);
            assert.deepEqual(Object.keys(release.artifacts).sort(), ['amd64', 'arm64']);
            for (const arch of ['amd64', 'arm64']) {
                assert.equal(release.artifacts[arch].url, `https://github.com/lottman/Remnacust-core/releases/download/v${release.build}/remnacust-core-${release.build}-linux-${arch}`);
                assert.match(release.artifacts[arch].sha256, /^[a-f0-9]{64}$/);
            }
        }
        process.env.REMNACUST_CORE_CATALOG_JSON = '[]';
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
        process.env.REMNACUST_CORE_CATALOG_JSON = JSON.stringify([published[0], published[0]]);
        assert.throws(() => coreCatalog());
    } finally {
        if (previous === undefined) delete process.env.REMNACUST_CORE_CATALOG_JSON;
        else process.env.REMNACUST_CORE_CATALOG_JSON = previous;
    }
});
