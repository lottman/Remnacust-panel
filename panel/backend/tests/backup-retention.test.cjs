const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const load = require('./load-typescript.cjs');

test('backup cleanup enforces seven days, preserves keys and never descends into nested backups', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xera-retention-'));
    const previous = [process.env.XERA_BACKUPS_DIR, process.env.XERA_PLAIN_DUMPS_DIR, process.env.XERA_BACKUP_RETENTION_DAYS];
    try {
        const plain = path.join(directory, 'dumps');
        await fs.mkdir(plain);
        process.env.XERA_BACKUPS_DIR = directory;
        process.env.XERA_PLAIN_DUMPS_DIR = plain;
        delete process.env.XERA_BACKUP_RETENTION_DAYS;
        const { BackupsService } = load(path.join(__dirname, '../src/modules/backups/backups.service.ts'), {
            '@common/types': { ok: (response) => ({ isOk: true, response }), fail: () => ({ isOk: false }) },
            '@common/utils/xera-crypto': {}, '@libs/contracts/constants': { ERRORS: {} },
            '@libs/contracts/models': {}, './backup-zip': {},
        });
        const service = new BackupsService({});
        service.readSettings = async () => ({ retentionDays: 7 });
        for (const file of ['old.zip', 'fresh.zip', '.backup-key', 'manual-old.dump']) {
            const target = path.join(file.startsWith('manual-') ? plain : directory, file);
            await fs.writeFile(target, 'fixture');
            const age = file === 'fresh.zip' ? 86400000 : 8 * 86400000;
            await fs.utimes(target, new Date(Date.now() - age), new Date(Date.now() - age));
        }
        await fs.mkdir(path.join(directory, 'nested.zip'));
        await fs.writeFile(path.join(directory, 'nested.zip', 'valuable'), 'keep');
        await service.cleanup();
        await assert.rejects(fs.access(path.join(directory, 'old.zip')));
        await assert.rejects(fs.access(path.join(plain, 'manual-old.dump')));
        assert.equal(await fs.readFile(path.join(directory, '.backup-key'), 'utf8'), 'fixture');
        assert.equal(await fs.readFile(path.join(directory, 'fresh.zip'), 'utf8'), 'fixture');
        assert.equal(await fs.readFile(path.join(directory, 'nested.zip', 'valuable'), 'utf8'), 'keep');
    } finally {
        for (const [index, key] of ['XERA_BACKUPS_DIR', 'XERA_PLAIN_DUMPS_DIR', 'XERA_BACKUP_RETENTION_DAYS'].entries()) {
            if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
        }
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('chosen shorter retention removes both encrypted and plain dumps by age', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xera-retention-choice-'));
    const previous = [process.env.XERA_BACKUPS_DIR, process.env.XERA_PLAIN_DUMPS_DIR];
    try {
        process.env.XERA_BACKUPS_DIR = directory;
        process.env.XERA_PLAIN_DUMPS_DIR = directory;
        const { BackupsService } = load(path.join(__dirname, '../src/modules/backups/backups.service.ts'), {
            '@common/types': { ok: (response) => ({ isOk: true, response }), fail: () => ({ isOk: false }) },
            '@common/utils/xera-crypto': {}, '@libs/contracts/constants': { ERRORS: {} },
            '@libs/contracts/models': {}, './backup-zip': {},
        });
        const service = new BackupsService({});
        service.readSettings = async () => ({ retentionDays: 2 });
        for (const name of ['old.zip', 'manual-old.dump', 'fresh.zip', '.backup-key']) {
            const file = path.join(directory, name);
            await fs.writeFile(file, 'fixture');
            const age = name.startsWith('old') || name === 'manual-old.dump' ? 3 : 1;
            await fs.utimes(file, new Date(Date.now() - age * 86400000), new Date(Date.now() - age * 86400000));
        }
        await service.cleanup();
        await assert.rejects(fs.access(path.join(directory, 'old.zip')));
        await assert.rejects(fs.access(path.join(directory, 'manual-old.dump')));
        await fs.access(path.join(directory, 'fresh.zip'));
        await fs.access(path.join(directory, '.backup-key'));
    } finally {
        for (const [i, key] of ['XERA_BACKUPS_DIR', 'XERA_PLAIN_DUMPS_DIR'].entries()) {
            if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
        }
        await fs.rm(directory, { recursive: true, force: true });
    }
});
