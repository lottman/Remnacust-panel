const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { test } = require('node:test');
const { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } = require('@zip.js/zip.js');
const load = require('./load-typescript.cjs');
const { writeEncryptedBackupZip, verifyEncryptedBackupZip } = load(join(__dirname, '../src/modules/backups/backup-zip.ts'));

test('large backup verification uses bounded memory', {timeout:120000}, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xera-zip-memory-'));
    try {
        const target = join(directory, 'large.zip');
        const chunk = Buffer.alloc(1024 * 1024, 71);
        await writeEncryptedBackupZip(Readable.from((async function* () {
            for(let i=0;i<128;i++) yield chunk;
        })()), target, 'memory-regression-password');
        const result = require('node:child_process').spawnSync(process.execPath,
            [join(__dirname, 'backup-zip-memory.cjs'), target], {encoding:'utf8',timeout:90000});
        assert.equal(result.status, 0, result.stdout + result.stderr);
    } finally {await rm(directory, {recursive:true,force:true})}
});

test('ZIP backups round-trip with the installation password and reject tampering', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xera-zip-test-'));
    try {
        const target = join(directory, 'backup.zip');
        const password = 'Installation-password-12345';
        const original = Buffer.from('PGDMP database payload '.repeat(1000));
        await writeEncryptedBackupZip(Readable.from([original]), target, password);
        await verifyEncryptedBackupZip(target, password);
        const data = await readFile(target);
        assert.equal(data.includes(original.subarray(0, 40)), false);
        const reader = new ZipReader(new Uint8ArrayReader(data), { password });
        const [entry] = await reader.getEntries();
        assert.deepEqual(Buffer.from(await entry.getData(new Uint8ArrayWriter())), original);
        await reader.close();
        await assert.rejects(verifyEncryptedBackupZip(target, 'Incorrect-password-12345'));
        const ciphertextOffset = 30 + data.readUInt16LE(26) + data.readUInt16LE(28) + 18;
        data[ciphertextOffset + 100] ^= 1;
        await writeFile(target, data);
        await assert.rejects(verifyEncryptedBackupZip(target, password));
    } finally { await rm(directory, { recursive: true, force: true }); }
});
