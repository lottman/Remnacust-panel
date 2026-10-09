const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const load = require('./load-typescript.cjs');
const source = path.join(__dirname, '../src/common/utils/certs/resolve-pem-certs.util.ts');
const certs = load(source);
const { readPemLines } = certs;

test('certificate resolution rejects ordinary data and oversized regular files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pem-security-'));
    try {
        const filename = path.join(directory, 'data');
        fs.writeFileSync(filename, 'fixture-private-data\n');
        assert.throws(() => readPemLines(filename));
        const { XRayConfig } = load(path.join(__dirname, '../src/common/helpers/xray-config/xray-config.validator.ts'), {
            '@common/utils/certs': certs,
            '@common/utils/flow/get-vless-flow': {},
            './ss-cipher': {},
        });
        const resolver = Object.create(XRayConfig.prototype);
        assert.throws(() => resolver.resolveCertificate({ certificateFile: filename }), certs.UnsafePemFileError);
        const remoteFile = { certificateFile: path.join(directory, 'node-only.pem') };
        assert.equal(resolver.resolveCertificate(remoteFile), remoteFile);
        fs.writeFileSync(filename, 'x'.repeat(131073));
        assert.throws(() => readPemLines(filename));
        fs.writeFileSync(filename, '-----BEGIN CERTIFICATE-----\r\nZmFrZQ==\r\n-----END CERTIFICATE-----\r\n');
        assert.deepEqual(readPemLines(filename), ['-----BEGIN CERTIFICATE-----', 'ZmFrZQ==', '-----END CERTIFICATE-----']);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('a certificate FIFO cannot block the worker waiting for another process', {
    skip: process.platform !== 'linux',
}, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pem-fifo-security-'));
    try {
        const filename = path.join(directory, 'fifo');
        assert.equal(spawnSync('mkfifo', [filename]).status, 0);
        const fixture = `const load = require(${JSON.stringify(path.join(__dirname, 'load-typescript.cjs'))});
            const { readPemLines } = load(${JSON.stringify(source)});
            try { readPemLines(${JSON.stringify(filename)}); process.exitCode = 1; }
            catch { console.log('rejected'); }`;
        const result = spawnSync(process.execPath, ['-e', fixture], { timeout: 3000, encoding: 'utf8' });
        assert.equal(result.error?.code, undefined, 'read of a special file exceeded its hard timeout');
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /rejected/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
