const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('upstream sources are pinned to official release tags without development patches', () => {
    const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../docs/UPSTREAM-SOURCES.json'), 'utf8'));
    assert.equal(metadata.updatePolicy, 'published-official-releases-only');
    const repositories = {
        backend: 'https://github.com/remnawave/backend',
        frontend: 'https://github.com/remnawave/frontend',
        node: 'https://github.com/remnawave/node',
        'subscription-page': 'https://github.com/remnawave/subscription-page',
        xray: 'https://github.com/XTLS/Xray-core',
    };
    assert.equal(metadata.components.length, Object.keys(repositories).length);
    for (const [component, repository] of Object.entries(repositories)) {
        const sources = metadata.components.filter(row => row.component === component);
        assert.equal(sources.length, 1);
        const source = sources[0];
        assert.equal(source.repository, repository);
        assert.match(source.version, /^v?\d+\.\d+\.\d+$/);
        assert.equal(source.ref, 'refs/tags/' + source.version);
        assert.match(source.commit, /^[a-f0-9]{40}$/);
        assert.equal(source.patchCommit, undefined, 'Unreleased upstream branch commits must not be imported');
    }
});
