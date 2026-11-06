const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const load = require('./load-typescript.cjs');
const source = path.join(__dirname, '../src/common/utils/certs/resolve-pem-certs.util.ts');

test('certificate reads cannot disclose valid PEM outside the allowed directory or through symlinks', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pem-boundary-'));
    const allowed = path.join(directory, 'allowed');
    fs.mkdirSync(allowed);
    const pem = '-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----\n';
    const filename = path.join(directory, 'private.pem');
    fs.writeFileSync(filename, pem);
    const bounded = load(source, { 'node:fs': { ...fs,
        realpathSync: value => fs.realpathSync(value === '/var/lib/remnawave' ? allowed : value),
    } });
    try {
        assert.throws(() => bounded.readPemLines(filename), bounded.UnsafePemFileError);
        fs.writeFileSync(path.join(allowed, 'valid.pem'), pem);
        assert.deepEqual(bounded.readPemLines(path.join(allowed, 'valid.pem')), pem.trim().split('\n'));
        fs.symlinkSync(directory, path.join(allowed, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
        assert.throws(() => bounded.readPemLines(path.join(allowed, 'escape/private.pem')), bounded.UnsafePemFileError);
        const sibling = allowed + '-sibling';
        fs.mkdirSync(sibling);
        fs.writeFileSync(path.join(sibling, 'private.pem'), pem);
        assert.throws(() => bounded.readPemLines(path.join(sibling, 'private.pem')), bounded.UnsafePemFileError);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('certificate resolution rejects ordinary data and oversized regular files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pem-security-'));
    const certs = load(source, { 'node:fs': { ...fs,
        realpathSync: value => fs.realpathSync(value === '/var/lib/remnawave' ? directory : value),
    } });
    const { readPemLines } = certs;
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
            const fs = require('node:fs');
            const { readPemLines } = load(${JSON.stringify(source)}, {'node:fs': {...fs,
                realpathSync: value => fs.realpathSync(value === '/var/lib/remnawave' ? ${JSON.stringify(directory)} : value)}});
            try { readPemLines(${JSON.stringify(filename)}); process.exitCode = 1; }
            catch { console.log('rejected'); }`;
        const result = spawnSync(process.execPath, ['-e', fixture], { timeout: 3000, encoding: 'utf8' });
        assert.equal(result.error?.code, undefined, 'read of a special file exceeded its hard timeout');
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /rejected/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
