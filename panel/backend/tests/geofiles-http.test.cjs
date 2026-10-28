const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
require('reflect-metadata');
const { Module, Inject, UnauthorizedException } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const load = require('./load-typescript.cjs');
const fixture = require('./geofiles-fixture.cjs');
const { mocks: poolMocks, pool } = require('./client-pool-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const ROLE = { ADMIN: 'ADMIN', API: 'API', AUDITOR: 'AUDITOR' };
const mocks = {
    ...poolMocks,
    '../generators/client-pool': pool,
    '@libs/contracts/constants': {
        ROLE,
        ERRORS: {
            FORBIDDEN_ROLE_ERROR: { message: 'Forbidden', code: 'forbidden', httpCode: 403 },
        },
    },
    '@common/config/app-config/typed-config.service': {},
    '@common/database/prisma.service': {},
    '@common/decorators/scopes': { SCOPE_ENDPOINT: 'scope' },
};
const roles = load(path.join(__dirname, '../src/common/decorators/roles/roles.ts'), mocks);
mocks['@common/decorators/roles/roles'] = roles;
const admin = load(path.join(__dirname, '../src/common/decorators/admin-only-endpoint.ts'), mocks);
mocks['@common/decorators/admin-only-endpoint'] = admin;
const { RolesGuard } = load(path.join(__dirname, '../src/common/guards/roles/roles.guard.ts'), {
    ...mocks,
    '@common/exception/http-exeception-with-error-code.type': load(
        path.join(__dirname, '../src/common/exception/http-exeception-with-error-code.type.ts'),
    ),
});
mocks['@common/guards/roles'] = { RolesGuard };
Inject(Reflector)(RolesGuard, undefined, 0);
// Only authentication transport is replaced. The controller decorators and role guard are real.
class TestAuthentication {
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        if (!request.headers['x-test-role']) throw new UnauthorizedException();
        request.user = { role: request.headers['x-test-role'] };
        return true;
    }
}
mocks['@common/guards/jwt-guards/def-jwt-guard'] = { JwtDefaultGuard: TestAuthentication };
const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), mocks);
const { XrayGeofileDelivery, datCategory } = load(
    path.join(root, 'xray-geofile-delivery.ts'),
    mocks,
);
const { compileDat } = load(path.join(root, 'compile-dat.ts'), mocks);
mocks['./geofiles.service'] = { GeofilesService };
const { GeofilesController, PublicGeofilesController } = load(
    path.join(root, 'geofiles.controller.ts'),
    mocks,
);
for (const Controller of [GeofilesController, PublicGeofilesController])
    Inject(GeofilesService)(Controller, undefined, 0);
class UpstreamAxios {}
const { GeofilesController: SubscriptionPageGeofiles } = load(
    path.join(
        __dirname,
        '../../../subscription-page/backend/src/modules/subscription/geofiles.controller.ts',
    ),
    {
        '@common/axios/axios.service': { AxiosService: UpstreamAxios },
        '@nestjs/common': require('@nestjs/common'),
    },
);
Inject(UpstreamAxios)(SubscriptionPageGeofiles, undefined, 0);

test('real HTTP binary upload, admin-only roles, public byte stream and in-use deletion protection', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remnacust-geo-http-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    let templates = [];
    const files = new GeofilesService(
        { getOrThrow: () => 'sub.example.test' },
        {
            getAllTemplates: async (withContent) =>
                withContent ? templates : templates.map(() => ({})),
        },
        { $transaction: async (fn) => fn({ $executeRaw: async () => 1 }) },
    );
    class TestModule {}
    Module({
        controllers: [GeofilesController, PublicGeofilesController],
        providers: [
            { provide: GeofilesService, useValue: files },
            { provide: RolesGuard, useValue: new RolesGuard(new Reflector()) },
            TestAuthentication,
        ],
    })(TestModule);
    const app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    class ProxyModule {}
    Module({
        controllers: [SubscriptionPageGeofiles],
        providers: [
            {
                provide: UpstreamAxios,
                useValue: {
                    axiosInstance: require('axios').create({ baseURL: base, proxy: false }),
                },
            },
        ],
    })(ProxyModule);
    const proxy = await NestFactory.create(ProxyModule, { logger: false });
    await proxy.listen(0, '127.0.0.1');
    const proxyBase = await proxy.getUrl();
    try {
        for (const [route, method] of [
            ['', 'GET'],
            ['/upload?name=IP&kind=geoip', 'POST'],
            ['/import', 'POST'],
            ['/invalid', 'DELETE'],
            ['/invalid/refresh', 'PATCH'],
            ['/invalid/refresh', 'POST'],
        ]) {
            assert.equal((await fetch(base + '/api/geofiles' + route, { method })).status, 401);
            for (const role of ['API', 'AUDITOR'])
                assert.equal(
                    (
                        await fetch(base + '/api/geofiles' + route, {
                            method,
                            headers: { 'x-test-role': role },
                        })
                    ).status,
                    403,
                );
        }
        const headers = { 'x-test-role': 'ADMIN', 'Content-Type': 'application/octet-stream' };
        const uploaded = await fetch(base + '/api/geofiles/upload?name=Test&kind=geoip', {
            method: 'POST',
            headers,
            body: fixture.geoip,
        });
        assert.equal(uploaded.status, 201);
        const item = (await uploaded.json()).response;
        assert.match(item.id, /^[a-f0-9]{34}$/);
        const downloaded = await fetch(`${base}/api/sub/geofiles/${item.id}/${item.filename}`);
        assert.equal(downloaded.status, 200);
        assert.equal(downloaded.headers.get('content-type'), 'application/octet-stream');
        assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
        assert.match(downloaded.headers.get('content-security-policy'), /sandbox/);
        assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), fixture.geoip);
        const proxied = await fetch(`${proxyBase}/geofiles/${item.id}/${item.filename}`);
        assert.equal(proxied.status, 200);
        assert.equal(proxied.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(Buffer.from(await proxied.arrayBuffer()), fixture.geoip);
        const latest = await fetch(`${proxyBase}/geofiles/${item.id}/latest.dat`);
        assert.equal(latest.status, 200);
        assert.doesNotMatch(latest.headers.get('cache-control'), /immutable/);
        assert.deepEqual(Buffer.from(await latest.arrayBuffer()), fixture.geoip);
        const prepared = await files.prepare(
            {
                remnacust: {
                    geofiles: [
                        {
                            id: item.id,
                            categories: ['ru'],
                            target: 'DIRECT',
                            downloadToClient: true,
                            clientRefreshIntervalSeconds: 1200,
                        },
                    ],
                },
            },
            'SINGBOX',
        );
        const derivedPath = new URL(prepared.route.rule_set[0].url).pathname;
        const derived = await fetch(proxyBase + derivedPath);
        assert.equal(derived.status, 200);
        assert.doesNotMatch(derived.headers.get('cache-control'), /immutable/);
        assert.deepEqual((await derived.json()).rules, [{ ip_cidr: ['203.0.113.0/24'] }]);
        assert.equal(
            (await fetch(proxyBase + derivedPath.replace('rules-', 'rules-A'))).status,
            404,
        );
        const happ = new XrayGeofileDelivery();
        const xray = await files.prepare(
            {
                remnacust: {
                    geofiles: [
                        {
                            id: item.id,
                            categories: ['ru'],
                            target: 'REJECT',
                            downloadToClient: true,
                            clientRefreshIntervalSeconds: 1800,
                        },
                    ],
                },
            },
            'XRAY_JSON',
            happ,
        );
        const routing = await happ.header(JSON.stringify([xray]), 'http-user');
        const profile = JSON.parse(
            Buffer.from(routing.slice('happ://routing/onadd/'.length), 'base64').toString(),
        );
        const bundleUrl = new URL(profile.Geoipurl);
        const bundlePath = bundleUrl.pathname + bundleUrl.search;
        const directBundle = await fetch(base + '/api/sub' + bundlePath);
        assert.equal(directBundle.status, 200);
        assert.match(directBundle.headers.get('content-disposition'), /\.dat"$/);
        await directBundle.arrayBuffer();
        const bundled = await fetch(proxyBase + bundlePath);
        assert.equal(bundled.status, 200);
        assert.ok(
            bundleUrl.pathname.split('/').at(-1).length < 128,
            'Stable short DAT filename for client download managers',
        );
        assert.doesNotMatch(bundled.headers.get('cache-control'), /immutable/);
        assert.match(bundled.headers.get('content-security-policy'), /sandbox/);
        const bytes = Buffer.from(await bundled.arrayBuffer());
        const checksumUrl = new URL(proxyBase + bundlePath);
        checksumUrl.pathname += '.sha256';
        const checksum = await fetch(checksumUrl);
        assert.equal(checksum.status, 200);
        assert.match(checksum.headers.get('content-type'), /^text\/plain/);
        assert.doesNotMatch(checksum.headers.get('cache-control'), /immutable/);
        assert.equal(
            await checksum.text(),
            require('node:crypto').createHash('sha256').update(bytes).digest('hex'),
        );
        const checksumDirect = await fetch(
            base + '/api/sub' + checksumUrl.pathname + checksumUrl.search,
        );
        assert.equal(checksumDirect.status, 200);
        assert.match(checksumDirect.headers.get('content-disposition'), /\.dat\.sha256"$/);
        assert.equal(
            await checksumDirect.text(),
            require('node:crypto').createHash('sha256').update(bytes).digest('hex'),
        );
        assert.equal((await fetch(proxyBase + checksumUrl.pathname)).status, 200);
        assert.equal(
            (await fetch(checksumUrl.href.replace('/bundles/', '/bundles/A'))).status,
            404,
        );
        assert.deepEqual(compileDat(bytes, 'geoip', [datCategory(item.id, 'ru')]).ips, [
            '203.0.113.0/24',
        ]);
        assert.deepEqual(xray.routing.rules[0].ip, ['geoip:' + datCategory(item.id, 'ru')]);
        assert.equal(xray.outbounds[0].protocol, 'blackhole');
        const legacySelection = Buffer.from(
            JSON.stringify({ kind: 'geoip', ids: [item.id] }),
        ).toString('base64url');
        const legacySignature = require('node:crypto')
            .createHmac('sha256', 'sub.example.test')
            .update(`remnacust-xray-dat-v1:${item.id}:${legacySelection}`)
            .digest('hex');
        const legacyPath = `/geofiles/${item.id}/bundle-${legacySignature}.dat?selection=${legacySelection}`;
        const legacy = await fetch(proxyBase + legacyPath);
        assert.equal(legacy.status, 200, 'Already imported v1 bundle URLs stay usable');
        const legacyBytes = Buffer.from(await legacy.arrayBuffer());
        assert.deepEqual(compileDat(legacyBytes, 'geoip', [datCategory(item.id, 'ru', 1)]).ips, [
            '203.0.113.0/24',
        ]);
        assert.notEqual(datCategory(item.id, 'ru'), datCategory(item.id, 'ru', 1));
        const currentAgain = await fetch(proxyBase + bundlePath);
        assert.deepEqual(
            Buffer.from(await currentAgain.arrayBuffer()),
            bytes,
            'Namespace caches stay isolated',
        );
        assert.equal(
            (await fetch(proxyBase + bundlePath.replace('bundle-', 'bundle-A'))).status,
            404,
        );
        assert.equal(
            (await fetch(proxyBase + bundlePath.replace('/bundles/', '/bundles/A'))).status,
            404,
        );
        assert.equal((await fetch(proxyBase + bundleUrl.pathname)).status, 200);
        const incyChecksum = await fetch(proxyBase + bundleUrl.pathname + '.sha256');
        assert.equal(incyChecksum.status, 200, 'INCY appends the checksum suffix to the complete URL');
        assert.equal(await incyChecksum.text(), require('node:crypto').createHash('sha256').update(bytes).digest('hex'));
        const configured = await fetch(`${base}/api/geofiles/${item.id}/refresh`, {
            method: 'PATCH',
            headers: { 'x-test-role': 'ADMIN', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourceUrl: 'https://example.com/geoip.dat',
                enabled: false,
                intervalSeconds: 1800,
            }),
        });
        assert.equal(configured.status, 200);
        assert.equal((await configured.json()).response.refresh.intervalSeconds, 1800);
        assert.equal((await fetch(`${proxyBase}/geofiles/${item.id}/wrong.dat`)).status, 404);
        assert.equal((await fetch(`${base}/api/sub/geofiles/${item.id}/wrong.dat`)).status, 404);
        const invalid = await fetch(base + '/api/geofiles/upload?name=Test&kind=geoip', {
            method: 'POST',
            headers,
            body: '<html>not a dataset</html>',
        });
        assert.equal(invalid.status, 400);
        const listing = await fetch(base + '/api/geofiles', { headers });
        assert.equal((await listing.json()).response.length, 1);
        templates = [
            {
                templateJson: {
                    remnacust: {
                        geofiles: [{ id: item.id, target: 'REJECT', categories: ['ru'] }],
                    },
                },
            },
        ];
        assert.equal(
            (await fetch(base + '/api/geofiles/' + item.id, { method: 'DELETE', headers })).status,
            409,
        );
        templates = [];
        assert.equal(
            (await fetch(base + '/api/geofiles/' + item.id, { method: 'DELETE', headers })).status,
            200,
        );
        assert.equal(
            (await fetch(`${base}/api/sub/geofiles/${item.id}/${item.filename}`)).status,
            404,
        );
        assert.equal(
            (await fetch(proxyBase + bundlePath)).status,
            404,
            'Bundle cache cannot expose deleted library files',
        );
        assert.equal((await fetch(checksumUrl)).status, 404, 'Deleted files also revoke checksums');
    } finally {
        await proxy.close();
        await app.close();
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    }
});
