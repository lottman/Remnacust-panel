const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { deflateSync, inflateSync } = require('node:zlib');
const load = require('./load-typescript.cjs');
const { validateSrs } = load(path.resolve(__dirname, '../src/modules/subscription-template/geofiles/validate-srs.ts'));
const srs = (bytes, version = 3) => Buffer.concat([Buffer.from([83, 82, 83, version]), deflateSync(Buffer.from(bytes))]);
const valid = [1, 0, 1, 1, 3, 116, 99, 112, 255, 0];
test('SRS versions 1–4 accept structurally valid default and nested logical rules', () => {
    for (let version = 1; version <= 4; version++) {
        validateSrs(srs(valid, version));
        validateSrs(srs([1, 1, 0, 1, ...valid.slice(1), 0], version));
    }
});
test('published MetaCubeX domain matcher survives validation; every truncated record fails', () => {
    const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/srs/broadcom.srs'));
    validateSrs(fixture);
    const body = inflateSync(fixture.subarray(4));
    for (let length = 0; length < body.length; length++) assert.throws(() => validateSrs(srs(body.subarray(0, length), fixture[3])), `truncated at ${length}`);
});
test('SRS rejects unknown types, missing invert flags, bad lengths, trailing data and excessive recursion', () => {
    const malformed = [
        [1, 254, 0], [1, 0, 254, 255, 0], [1, 0, 255],
        [2, 0, 255, 0], [1, 0, 255, 2], [...valid, 0],
        [1, 1, 2, 0, 0], [1, 1, 0, 1, 254, 0],
        [1, 0, 1, 1, 250, 255, 0],
        [255, 255, 255, 255, 255, 255, 255, 255, 255, 127],
    ];
    let nested = [0, 255, 0];
    for (let i = 0; i < 18; i++) nested = [1, 0, 1, ...nested, 0];
    malformed.push([1, ...nested]);
    for (const input of malformed) assert.throws(() => validateSrs(srs(input)));
    assert.throws(() => validateSrs(srs(valid, 5)));
    assert.throws(() => validateSrs(Buffer.concat([srs(valid), Buffer.from([0])])));
});
test('SRS checks IP set ranges and v4 prefixes, not only the compressed header', () => {
    const prefix = [1, 0, 22, 1, 4, 192, 0, 2, 0, 24, 255, 0];
    validateSrs(srs(prefix, 4));
    const badPrefix = [...prefix]; badPrefix[9] = 33;
    assert.throws(() => validateSrs(srs(badPrefix, 4)));
    const ipRange = [1, 0, 6, 1, 0, 0, 0, 0, 0, 0, 0, 1, 4, 192, 0, 2, 0, 4, 192, 0, 2, 255, 255, 0];
    validateSrs(srs(ipRange));
    const reversed = [...ipRange]; reversed[16] = 255; reversed[21] = 0;
    assert.throws(() => validateSrs(srs(reversed)));
    const huge = [...ipRange]; huge[4] = 127;
    assert.throws(() => validateSrs(srs(huge)));
});
