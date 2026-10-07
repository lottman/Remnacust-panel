const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes, scryptSync, createHmac, createDecipheriv } = require('node:crypto');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

test('upgrade migrates the existing backup password only after verifying its old key', () => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'xera-password-migration-'));
    try {
        const keyPath = path.join(directory, '.backup-key');
        const password = 'Existing-password-12345';
        const salt = randomBytes(16);
        fs.writeFileSync(keyPath, Buffer.concat([salt, scryptSync(password, salt, 32)]));
        const installer = fs.readFileSync(path.join(__dirname, '../../upgrade_panel.sh'), 'utf8');
        const start = installer.indexOf('backup_envelope="$(');
        assert.ok(start > 0);
        const codeStart = installer.indexOf("node -e '\n", start) + "node -e '\n".length;
        const codeEnd = installer.indexOf("\n')\"", codeStart);
        assert.ok(codeEnd > codeStart);
        const code = installer.slice(codeStart, codeEnd).replace('"/opt/app/backups/.backup-key"', JSON.stringify(keyPath));
        const secret = 'test-application-secret';
        const run = (input) => spawnSync(process.execPath, ['-e', code], { input, encoding: 'utf8', env: { ...process.env, APP_SECRET: secret } });
        const result = run(password);
        assert.equal(result.status, 0, result.stderr);
        assert.ok(result.stdout.startsWith('xera1:'));
        const raw = Buffer.from(result.stdout.slice(6), 'base64');
        const key = createHmac('sha256', secret).update('xera-keyring-v1').digest();
        const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        assert.equal(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString(), password);
        const wrong = run('Incorrect-password-12345');
        assert.notEqual(wrong.status, 0);
        assert.equal(wrong.stdout, '');
        assert.equal(wrong.stderr.includes('Incorrect-password-12345'), false);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
