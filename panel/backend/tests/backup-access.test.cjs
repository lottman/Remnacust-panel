const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const load = require('./load-typescript.cjs');
const encryption = load(path.join(__dirname, '../src/modules/backups/backup-encryption.ts'));
const authorization = 'Bearer isolated-admin-session';
process.env.APP_SECRET = 'isolated-backup-access-test-secret';
const { BackupAccessService, BackupAccessGuard } = load(path.join(__dirname, '../src/modules/backups/backup-access.service.ts'), {
    './backup-encryption': encryption,
    '@common/raw-cache/raw-cache.service': {},
    '@common/utils/xera-crypto': load(path.join(__dirname, '../src/common/utils/xera-crypto.ts')), 
});

function cacheFixture() {
 const values=new Map(), counts=new Map();
 return {values, async incrementWithTtl(key) {const n=(counts.get(key)||0)+1;counts.set(key,n);return n}, async set(key,value,ttl) {assert.equal(ttl,1800); values.set(key,value)}, async get(key){return values.get(key)}, async del(key){values.delete(key)}};
}

test('backup visit verifies the installation password, isolates admins, expires and revokes access', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-access-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    const cache = cacheFixture();
    const service = new BackupAccessService(cache);
    try {
        process.env.XERA_BACKUPS_DIR = directory;
        const password = 'backup-test-password-2026';
        await fs.writeFile(path.join(directory, '.backup-key'), await encryption.createBackupKey(Buffer.from(password)));
        await assert.rejects(service.unlock('admin', 'wrong-password-attempt', authorization), e => e.getStatus() === 403);
        const visit = await service.unlock('admin', password, authorization);
        assert.equal(await service.password('admin', visit.token, authorization), password);
        await assert.rejects(() => service.password('other-admin', visit.token, authorization));
        await assert.rejects(() => service.password('admin', undefined, authorization));
        await service.revoke('other-admin', visit.token, authorization);
        assert.equal(await service.password('admin', visit.token, authorization), password);
        // Same administrator, different login: the old backup capability cannot be reused.
        await assert.rejects(() => service.password('admin', visit.token, 'Bearer another-login'));
        await assert.rejects(() => service.password('admin', visit.token, undefined));
        await service.revoke('admin', visit.token, 'Bearer another-login');
        assert.equal(await service.password('admin', visit.token, authorization), password);
        const otherWorker = new BackupAccessService(cache);
        assert.equal(await otherWorker.password('admin', visit.token, authorization),password);
        assert(!JSON.stringify([...cache.values.values()]).includes(password));
        await service.revoke('admin', visit.token, authorization);
        await assert.rejects(() => otherWorker.password('admin', visit.token, authorization));
        await assert.rejects(() => service.password('admin', visit.token, authorization));
        const next = await service.unlock('admin', password, authorization);
        [...cache.values.values()][0].expires = Date.now() - 1;
        await assert.rejects(() => service.password('admin', next.token, authorization));
        cache.values.clear();
        const third = await service.unlock('admin', password, authorization);
        const request = { user: { uuid: 'admin' }, headers: { 'x-backup-session': third.token, authorization } };
        const guard = new BackupAccessGuard(service, { get: () => false });
        await assert.rejects(() => guard.canActivate({
            getHandler: () => {},
            switchToHttp: () => ({
                getRequest: () => ({ user: { uuid: 'admin' }, headers: { authorization } }),
                getResponse: () => ({ setHeader: () => {} }),
            }),
        }), e => e.getStatus() === 403);
        assert.equal(await guard.canActivate({ getHandler: () => {}, switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader: (key,value) => {assert.equal(key,"Cache-Control");assert.equal(value,"no-store")} }) }) }), true);
        assert.equal(request.backupPassword, password);
    } finally {

        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR; else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('backup password attempts are bounded and missing key never creates a session', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-access-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    const cache = cacheFixture();
    const service = new BackupAccessService(cache);
    try {
        process.env.XERA_BACKUPS_DIR = directory;
        for (let i = 0; i < 5; i++) await assert.rejects(service.unlock('admin', 'wrong-password-attempt', authorization), e => e.getStatus() === 503);
        await assert.rejects(service.unlock('admin', 'wrong-password-attempt', authorization), e => e.getStatus() === 429);
        cache.values.clear();
        assert.equal(service.active, 0);
    } finally {

        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR; else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    }
});
