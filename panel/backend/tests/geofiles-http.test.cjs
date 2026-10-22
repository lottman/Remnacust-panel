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
    } finally {
        await proxy.close();
        await app.close();
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    }
});
