const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');
const { supportsNodeGeocheck } = load(path.join(__dirname, '../src/features/ui/dashboard/nodes/get-node-geocheck/node-geocheck-support.ts'));

test('Remnacust 1.1.1 supports geocheck with prerelease or build metadata branding', () => {
    for (const version of ['1.1.1-remnacust', '1.1.1-remnacust.2', '1.1.1-remnacust+build.3', '1.1.1+remnacust', '1.1.1+build.remnacust.3', '1.1.2-remnacust', 'v1.1.1-remnacust']) {
        assert.equal(supportsNodeGeocheck(version), true, version);
    }
    assert.equal(supportsNodeGeocheck('1.1.0-remnacust'), false);
});

test('stock Remnawave retains its own 3.3.0 threshold; older releases are not enabled', () => {
    for (const version of ['3.3.0', '3.4.1', '3.3.0+build.1']) assert.equal(supportsNodeGeocheck(version), true, version);
    for (const version of ['1.1.1', '1.1.1-other', '3.2.9', '3.2.9+build.1']) assert.equal(supportsNodeGeocheck(version), false, version);
});

test('missing and invalid node versions do not bypass the feature check', () => {
    for (const version of [null, undefined, '', 'unknown', '1.1', '1.1.1-remnacust extra', '1.1.1+not-remnacust']) {
        assert.equal(supportsNodeGeocheck(version), false, String(version));
    }
});

test('all four languages identify both version families in the compatibility hint', () => {
    for (const language of ['ru', 'en', 'fa', 'zh']) {
        const text = require(`../public/locales/${language}/remnawave.json`)['node-geocheck']['requires-node-version'];
        assert.ok(text.includes('Remnacust Node') && text.includes('{{remnacustVersion}}'), language);
        assert.ok(text.includes('Remnawave Node') && text.includes('{{version}}'), language);
    }
});
