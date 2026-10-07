const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const load = require('./load-typescript.cjs');
const { GetMetadataResponseModel } = load(path.join(__dirname,
    '../src/modules/system/models/get-metadata.response.model.ts'));

test('release metadata keeps its build identity and links to the panel repository', () => {
    const backend = 'a'.repeat(40);
    const frontend = 'b'.repeat(40);
    const model = new GetMetadataResponseModel({
        version: '1.1.6', backendCommitSha: backend, frontendCommitSha: frontend,
        branch: 'main', buildTime: '2026-10-07T16:00:00Z', buildNumber: '42',
    });
    assert.equal(model.version, '1.1.6');
    assert.deepEqual(model.build, { time: '2026-10-07T16:00:00Z', number: '42' });
    assert.equal(model.git.backend.branch, 'main');
    assert.equal(model.git.backend.commitSha, backend);
    assert.equal(model.git.frontend.commitSha, frontend);
    assert.equal(model.git.backend.commitUrl, `https://github.com/lottman/Remnacust-panel/commit/${backend}`);
    assert.equal(model.git.frontend.commitUrl, `https://github.com/lottman/Remnacust-panel/commit/${frontend}`);
});

test('a local build without commit metadata links to the repository rather than an invalid commit', () => {
    const model = new GetMetadataResponseModel({
        version: '1.1.6', backendCommitSha: 'unknown', frontendCommitSha: '../invalid',
        branch: 'local', buildTime: '', buildNumber: '0',
    });
    assert.equal(model.git.backend.branch, 'local');
    assert.equal(model.git.backend.commitUrl, 'https://github.com/lottman/Remnacust-panel');
    assert.equal(model.git.frontend.commitUrl, 'https://github.com/lottman/Remnacust-panel');
});
