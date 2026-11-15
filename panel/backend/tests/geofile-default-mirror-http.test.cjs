const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
require('reflect-metadata');
const { Module, Inject } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const load = require('./load-typescript.cjs');
const fixture = require('./geofiles-fixture.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = {
    ...mocks,
    '../generators/client-pool': pool,
    '@libs/contracts/constants': { ROLE: { ADMIN: 'ADMIN' } },
    '@common/config/app-config/typed-config.service': {},
    '@common/database/prisma.service': {},
    '@common/decorators/admin-only-endpoint': { AdminOnlyEndpoint: () => () => {} },
    '@common/decorators/roles/roles': { Roles: () => () => {} },
    '@common/guards/jwt-guards/def-jwt-guard': { JwtDefaultGuard: class {} },
    '@common/guards/roles': { RolesGuard: class {} },
};
const network = load(path.join(root, 'download-geofile.ts'), modules);
const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), {
    ...modules,
    './download-geofile': {
        ...network,
        downloadGeofile: async (url) =>
            url.endsWith('/geoip.dat') ? fixture.geoip : fixture.geosite,
    },
});
const { PublicGeofilesController } = load(path.join(root, 'geofiles.controller.ts'), {
    ...modules,
    './geofiles.service': { GeofilesService },
});
Inject(GeofilesService)(PublicGeofilesController, undefined, 0);
class Upstream {}
const { GeofilesController: Proxy } = load(
    path.join(
        __dirname,
        '../../../subscription-page/backend/src/modules/subscription/geofiles.controller.ts',
    ),
    {
        '@common/axios/axios.service': { AxiosService: Upstream },
        '@nestjs/common': require('@nestjs/common'),
    },
);
Inject(Upstream)(Proxy, undefined, 0);
const sha = (data) => createHash('sha256').update(data).digest('hex');

test('real panel and subscription-page HTTP deliver full defaults and matching path/query checksum sidecars', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-standard-http-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    t.after(async () => {
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    });
    const service = new GeofilesService(
        { getOrThrow: (key) => (key === 'APP_SECRET' ? 'synthetic-secret' : 'sub.example.test') },
        { getAllTemplates: async () => [] },
        { $transaction: async (fn) => fn({ $executeRaw: async () => 1 }) },
    );
    const geoip = await service.importUrl(
        'Standard GeoIP',
        'geoip',
        'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat',
    );
    const geosite = await service.importUrl(
        'Standard GeoSite',
        'geosite',
        'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat',
    );
    for (const file of [geoip, geosite])
        await service.configureRefresh(file.id, {
            enabled: true,
            sourceUrl: `https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/${file.kind}.dat`,
            intervalSeconds: 172800,
        });
    class TestModule {}
    Module({
        controllers: [PublicGeofilesController],
        providers: [{ provide: GeofilesService, useValue: service }],
    })(TestModule);
    const app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    t.after(() => app.close());
    const upstream = await app.getUrl();
    class ProxyModule {}
    Module({
        controllers: [Proxy],
        providers: [
            {
                provide: Upstream,
                useValue: {
                    geofileAxiosInstance: require('axios').create({
                        baseURL: upstream,
                        proxy: false,
                    }),
                },
            },
        ],
    })(ProxyModule);
    const proxy = await NestFactory.create(ProxyModule, { logger: false });
    await proxy.listen(0, '127.0.0.1');
    t.after(() => proxy.close());
    const publicBase = await proxy.getUrl();
    const defaults = await service.standardSources();
    assert.equal(defaults.intervalSeconds, 172800);
    const bundle = await service.bundleUrl('geosite', [geosite.id], { [geosite.id]: ['example'] });
    for (const url of [defaults.geoip.url, defaults.geosite.url, bundle + '?revision=1790000000']) {
        const target = new URL(url);
        const original = await fetch(publicBase + target.pathname + target.search);
        assert.equal(original.status, 200);
        const data = Buffer.from(await original.arrayBuffer());
        const checksumPath = new URL(target);
        checksumPath.pathname += '.sha256';
        for (const checksumUrl of [checksumPath, new URL(target.href + '.sha256')]) {
            for (const [base, prefix] of [
                [publicBase, ''],
                [upstream, '/api/sub'],
            ]) {
                const response = await fetch(
                    base + prefix + checksumUrl.pathname + checksumUrl.search,
                );
                assert.equal(response.status, 200, checksumUrl.href);
                assert.match(response.headers.get('content-type'), /text\/plain/);
                assert.equal(await response.text(), sha(data));
                assert.match(response.headers.get('cache-control'), /must-revalidate/);
            }
        }
    }
    const invalid = await fetch(publicBase + `/geofiles/${geosite.id}/..%2fsecret.dat.sha256`);
    assert.equal(invalid.status, 404);
});
