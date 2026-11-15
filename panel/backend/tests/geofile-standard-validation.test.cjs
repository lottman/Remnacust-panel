const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
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
const network = load(path.join(root, 'download-geofile.ts'), modules);
const { XrayGeofileDelivery } = load(path.join(root, 'xray-geofile-delivery.ts'), modules);
const categories = ['category-ru', ...Array.from({ length: 32 }, (_, i) => `category-${i}`)];
const site = (suffix) =>
    Buffer.concat(
        categories.map((category) =>
            fixture.bytes(
                1,
                Buffer.concat([
                    fixture.bytes(1, category.toUpperCase()),
                    fixture.bytes(2, fixture.domain(2, `${category}.${suffix}.example`)),
                ]),
            ),
        ),
    );

test('33 native categories share one cooperative DAT read per source revision, including concurrent requests', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-geofile-validation-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    t.after(async () => {
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    });
    let siteData = site('old');
    const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), {
        ...modules,
        './download-geofile': {
            ...network,
            downloadGeofile: async (url) => (url.endsWith('/geoip.dat') ? fixture.geoip : siteData),
        },
    });
    const service = new GeofilesService(
        {
            getOrThrow: (key) =>
                key === 'APP_SECRET' ? 'synthetic-private-key' : 'sub.example.test',
        },
        { getAllTemplates: async () => [] },
        { $transaction: async (fn) => fn({ $executeRaw: async () => 1 }) },
    );
    for (const kind of ['geoip', 'geosite'])
        await service.importUrl(
            `Standard ${kind}`,
            kind,
            `https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/${kind}.dat`,
        );
    const source = (await service.list()).find((file) => file.kind === 'geosite');
    assert.equal(source.refresh.intervalSeconds, 172800);
    let reads = 0;
    const original = service.readActive.bind(service);
    service.readActive = async (file) => {
        reads++;
        return original(file);
    };
    const standards = await service.standardSources();
    assert(standards);
    const run = async (context) => {
        const delivery = new XrayGeofileDelivery(
            'happ',
            'remote',
            'Provider',
            undefined,
            false,
            context,
        );
        const custom = delivery.register(
            'geosite',
            { id: '1f' + 'a'.repeat(32), categories: ['custom'], target: 'DIRECT' },
            async () => 'https://sub.example.test/custom.dat',
        );
        return delivery.header(
            JSON.stringify([
                {
                    routing: {
                        rules: [
                            { domain: custom },
                            { domain: categories.map((category) => `geosite:${category}`) },
                        ],
                    },
                },
            ]),
            'user',
        );
    };
    const headers = await Promise.all(Array.from({ length: 16 }, () => run(standards)));
    assert.ok(headers.every((header) => header === headers[0]));
    assert.equal(reads, 1, 'Native category validation reread the full DAT for every category');
    await run(standards);
    assert.equal(reads, 1);
    await assert.rejects(standards.validate('geosite', ['missing']), /category/);
    await assert.rejects(standards.validate('geosite', ['missing']), /category/);
    assert.equal(reads, 3, 'Invalid selections must not become successful cached validations');
    siteData = site('new');
    assert.equal(await service.refreshNow(source.id), true);
    await run(await service.standardSources());
    assert.equal(reads, 4, 'A source hash change reused a preceding validation');
});
