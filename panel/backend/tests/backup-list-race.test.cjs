const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const load = require('./load-typescript.cjs');

test('a backup removed by another worker does not break listing or retention', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-list-race-'));
    const old = [process.env.XERA_BACKUPS_DIR, process.env.XERA_PLAIN_DUMPS_DIR];
    try {
        process.env.XERA_BACKUPS_DIR = directory;
        process.env.XERA_PLAIN_DUMPS_DIR = path.join(directory, 'absent');
        await fs.writeFile(path.join(directory, 'removed.zip'), 'removed');
        await fs.writeFile(path.join(directory, 'kept.zip'), 'kept');
        const {BackupsService} = load(path.join(__dirname, '../src/modules/backups/backups.service.ts'), {
            'node:fs/promises': {...fs, async lstat(file) {
                if (file === path.join(directory, 'removed.zip')) await fs.unlink(file);
                return fs.lstat(file);
            }},
            '@common/types': {ok: response => ({isOk:true,response}),fail: () => ({isOk:false})},
            '@common/utils/xera-crypto': {}, '@libs/contracts/constants': {ERRORS:{}},
            '@libs/contracts/models': {}, './backup-zip': {},
        });
        const result = await new BackupsService({}).list();
        assert.equal(result.isOk, true);
        assert.deepEqual(result.response.map(item => item.filename), ['kept.zip']);
    } finally {
        for (const [i,key] of ['XERA_BACKUPS_DIR','XERA_PLAIN_DUMPS_DIR'].entries())
            if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i];
        await fs.rm(directory, {recursive:true,force:true});
    }
});
