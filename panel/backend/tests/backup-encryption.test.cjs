const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { chmod, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { Readable, Writable } = require('node:stream')
const { test } = require('node:test')
const ts = require('typescript')

test('backup encryption round-trips and rejects wrong passwords or tampering', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xera-backup-test-'))
    try {
        const source = await readFile(join(__dirname, '..', 'src', 'modules', 'backups', 'backup-encryption.ts'), 'utf8')
        const compiled = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
        }).outputText
        const modulePath = join(directory, 'backup-encryption.cjs')
        await writeFile(modulePath, compiled)
        const { createBackupKey, encryptBackup, decryptBackupWithPassword, matchesBackupPassword, verifyBackup } = require(modulePath)
        const original = Buffer.from('PGDMP\0test backup payload '.repeat(10000))
        const password = Buffer.from('correct-horse-battery-staple')
        const key = await createBackupKey(password)
        assert.equal(await matchesBackupPassword(password, key), true)
        assert.equal(await matchesBackupPassword(Buffer.from('different-password-123'), key), false)
        const path = join(directory, 'test.dump.enc')
        await encryptBackup(Readable.from([original]), path, key)
        const encrypted = await readFile(path)
        assert.equal(encrypted.subarray(0, 8).toString(), 'XRBKP002')
        assert.equal(encrypted.includes(original.subarray(0, 32)), false)
        await verifyBackup(path, key)
        const restored = []
        await decryptBackupWithPassword(path, new Writable({
            write(chunk, _encoding, callback) {
                restored.push(Buffer.from(chunk))
                callback()
            }
        }), password)
        assert.deepEqual(Buffer.concat(restored), original)
        const passwordPath = join(directory, 'password.txt')
        await writeFile(passwordPath, password, { mode: 0o600 })
        await chmod(passwordPath, 0o600)
        const cli = join(__dirname, '..', '..', 'backup-decrypt.mjs')
        execFileSync('node', [cli, 'verify', path, passwordPath])
        assert.deepEqual(execFileSync('node', [cli, 'decrypt', path, passwordPath]), original)
        await assert.rejects(() => decryptBackupWithPassword(path, new Writable({ write(_chunk, _encoding, callback) { callback() } }), Buffer.from('different-password-123')))
        encrypted[60] ^= 1
        await writeFile(path, encrypted)
        await assert.rejects(() => verifyBackup(path, key))
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})
