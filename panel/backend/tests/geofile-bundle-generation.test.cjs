const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const load = require('./load-typescript.cjs');
const fixture = require('./geofiles-fixture.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = {
    ...mocks,
    '../generators/client-pool': pool,
    '@common/config/app-config/typed-config.service': {},
    '@common/database/prisma.service': {},
};
const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), modules);
const { compileDat, datCategories } = load(path.join(root, 'compile-dat.ts'), modules);
const { datCategory } = load(path.join(root, 'xray-geofile-delivery.ts'), modules);
const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');

test('DAT content changes rotate the signed download path while unchanged renders and old links remain valid', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-dat-generation-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    try {
        const service = new GeofilesService(
            {
                getOrThrow: (key) =>
                    key === 'APP_SECRET' ? 'test-private-key' : 'sub.example.test',
            },
            {},
            {},
        );
        const id = '00' + 'a'.repeat(32);
        let data = fixture.geosite;
        service.fileById = async () => ({
            id,
            kind: 'geosite',
            size: data.length,
            sha256: digest(data),
        });
        service.readActive = async () => data;
        await fs.mkdir(service.directory(id), { recursive: true });
        const selected = { [id]: ['example'] };
        const before = await service.bundleUrl('geosite', [id], selected);
        assert.equal(await service.bundleUrl('geosite', [id], selected), before);
        data = fixture.bytes(
            1,
            Buffer.concat([
                fixture.bytes(1, 'EXAMPLE'),
                fixture.bytes(2, fixture.domain(2, 'updated.example')),
            ]),
        );
        const after = await service.bundleUrl('geosite', [id], selected);
        assert.notEqual(after, before, 'A client caching by URL must not retain the old DAT');
        assert.equal(await service.bundleUrl('geosite', [id], selected), after);
        for (const value of [before, after]) {
            const url = new URL(value);
            const parts = url.pathname.split('/');
            const selection = parts.at(-2),
                filename = parts.at(-1);
            const dat = await service.bundle(id, filename, selection);
            assert.deepEqual(datCategories(dat), [datCategory(id, 'example')]);
            assert.deepEqual(compileDat(dat, 'geosite', [datCategory(id, 'example')]).domains, [
                { type: 2, value: 'updated.example' },
            ]);
            assert.equal(
                (await service.bundle(id, filename + '.sha256', selection)).toString(),
                digest(dat),
            );
            await assert.rejects(
                service.bundle(id, 'bundle-' + '0'.repeat(64) + '.dat', selection),
            );
        }
    } finally {
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    }
});
