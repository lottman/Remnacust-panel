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
                    geofileAxiosInstance: require('axios').create({ baseURL: base, proxy: false }),
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
            ['/invalid/content', 'GET'],
            ['/invalid/content', 'PATCH'],
            ['/invalid/copy', 'POST'],
            ['/invalid/data', 'PUT'],
            ['/invalid/copy-data', 'POST'],
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
        const editorHeaders = { ...headers, 'Content-Type': 'application/json' };
        const opened = await fetch(`${base}/api/geofiles/${item.id}/content?category=ru&limit=1`, {
            headers,
        });
        assert.equal(opened.status, 200);
        assert.equal(opened.headers.get('cache-control'), 'no-store');
        assert.equal((await opened.json()).response.records[0].value, '203.0.113.0/24');
        assert.equal(
            (await fetch(`${base}/api/geofiles/1f${'0'.repeat(32)}/content`, { headers })).status,
            404,
        );
        const missingSha = await fetch(`${base}/api/geofiles/${item.id}/content`, {
            method: 'PATCH',
            headers: editorHeaders,
            body: '{}',
        });
        assert.equal(missingSha.status, 400);
        assert.equal((await missingSha.json()).message, 'geofile-sha256-required');
        const duplicateName = await fetch(`${base}/api/geofiles/${item.id}/copy`, {
            method: 'POST',
            headers: editorHeaders,
            body: JSON.stringify({ name: ' test ', sha256: item.sha256 }),
        });
        assert.equal(duplicateName.status, 409);
        assert.equal((await duplicateName.json()).message, 'geofile-name-exists');
        const selectionRejected = await fetch(`${base}/api/geofiles/${item.id}/copy`, {
            method: 'POST',
            headers: editorHeaders,
            body: JSON.stringify({
                name: 'Rejected selection',
                sha256: item.sha256,
                selections: [{ format: 'SINGBOX', categories: ['missing'] }],
            }),
        });
        assert.equal(selectionRejected.status, 400);
        assert.equal((await selectionRejected.json()).message, 'geofile-copy-selections');
        for (const selections of [
            JSON.stringify([{ format: 'SINGBOX', categories: ['missing'] }]),
            'x'.repeat(2049),
        ]) {
            const rejected = await fetch(
                `${base}/api/geofiles/${item.id}/copy-data?name=Rejected%20raw&sha256=${item.sha256}&selections=${encodeURIComponent(selections)}`,
                { method: 'POST', headers, body: fixture.geoip },
            );
            assert.equal(rejected.status, 400);
            assert.equal((await rejected.json()).message, 'geofile-copy-selections');
        }
        const copied = await fetch(`${base}/api/geofiles/${item.id}/copy`, {
            method: 'POST',
            headers: editorHeaders,
            body: JSON.stringify({
                name: 'HTTP edited copy',
                sha256: item.sha256,
                category: 'ru',
                additions: [{ type: 'ip', value: '192.0.2.0/24' }],
            }),
        });
        assert.equal(copied.status, 201);
        const copy = (await copied.json()).response;
        const edited = await fetch(`${base}/api/geofiles/${copy.id}/content`, {
            method: 'PATCH',
            headers: editorHeaders,
            body: JSON.stringify({
                sha256: copy.sha256,
                category: 'ru',
                changes: [{ index: 1, type: 'ip', value: '198.51.100.0/24' }],
            }),
        });
        assert.equal(edited.status, 200);
        const changed = (await edited.json()).response;
        const stale = await fetch(`${base}/api/geofiles/${copy.id}/data`, {
            method: 'PUT',
            headers: { ...headers, 'If-Match': `"${copy.sha256}"` },
            body: fixture.geoip,
        });
        assert.equal(stale.status, 409);
        assert.equal((await stale.json()).message, 'geofile-stale');
        const replaced = await fetch(`${base}/api/geofiles/${copy.id}/data`, {
            method: 'PUT',
            headers: { ...headers, 'If-Match': `"${changed.sha256}"` },
            body: fixture.geoip,
        });
        assert.equal(replaced.status, 200);
        const rawCopy = await fetch(
            `${base}/api/geofiles/${item.id}/copy-data?name=HTTP%20raw%20copy&sha256=${item.sha256}`,
            {
                method: 'POST',
                headers,
                body: fixture.geoip,
            },
        );
        assert.equal(rawCopy.status, 201);
        const rawFile = (await rawCopy.json()).response;
        assert.notEqual(rawFile.id, item.id);
        const selections = Array.from({ length: 20 }, () => ({
            format: 'SINGBOX',
            categories: Array(32).fill('ru'),
        }));
        assert(Buffer.byteLength(JSON.stringify(selections)) > 2048);
        const multipartFiles = [];
        for (const reverse of [false, true]) {
            const form = new FormData();
            const metadata = JSON.stringify({ name: 'Multipart ' + reverse, selections });
            if (reverse) form.append('file', new Blob([fixture.geoip]), 'ignored.dat');
            form.append('metadata', metadata);
            if (!reverse) form.append('file', new Blob([fixture.geoip]), 'ignored.dat');
            const result = await fetch(`${base}/api/geofiles/${item.id}/copy-data`, {
                method: 'POST',
                headers: { 'x-test-role': 'ADMIN', 'If-Match': item.sha256 },
                body: form,
            });
            assert.equal(result.status, 201, await result.clone().text());
            multipartFiles.push((await result.json()).response.id);
        }
        for (const invalid of [
            'extra',
            'duplicate-file',
            'duplicate-metadata',
            'metadata-size',
            'unknown-key',
            'missing-file',
            'selection',
        ]) {
            const form = new FormData();
            form.append(
                'metadata',
                invalid === 'metadata-size'
                    ? 'x'.repeat(32 * 1024 + 1)
                    : JSON.stringify({
                          name: 'Invalid multipart',
                          selections:
                              invalid === 'selection'
                                  ? [{ format: 'SINGBOX', categories: ['missing'] }]
                                  : [],
                          ...(invalid === 'unknown-key' ? { extra: true } : {}),
                      }),
            );
            if (invalid !== 'missing-file')
                form.append('file', new Blob([fixture.geoip]), 'file.dat');
            if (invalid === 'extra') form.append('other', 'bad');
            if (invalid === 'duplicate-file')
                form.append('file', new Blob([fixture.geoip]), 'file2.dat');
            if (invalid === 'duplicate-metadata') form.append('metadata', '{}');
            const result = await fetch(`${base}/api/geofiles/${item.id}/copy-data`, {
                method: 'POST',
                headers: { 'x-test-role': 'ADMIN', 'If-Match': item.sha256 },
                body: form,
            });
            assert.equal(result.status, 400, invalid + ': ' + (await result.text()));
        }
        for (const id of [copy.id, rawFile.id, ...multipartFiles])
            assert.equal(
                (await fetch(`${base}/api/geofiles/${id}`, { method: 'DELETE', headers })).status,
                200,
            );
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
            undefined,
            'remote',
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
        assert.equal(
            incyChecksum.status,
            200,
            'INCY appends the checksum suffix to the complete URL',
        );
        assert.equal(
            await incyChecksum.text(),
            require('node:crypto').createHash('sha256').update(bytes).digest('hex'),
        );
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

test('signed category subsets survive the real subscription-page proxy and reject tampered manifests', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remnacust-subset-http-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    const files = new GeofilesService(
        { getOrThrow: () => 'sub.example.test' },
        { getAllTemplates: async () => [] },
        { $transaction: async (fn) => fn({ $executeRaw: async () => 1 }) },
    );
    let app, proxy;
    try {
        const extra = fixture.bytes(
            1,
            Buffer.concat([
                fixture.bytes(1, 'UNUSED'),
                fixture.bytes(2, fixture.domain(2, 'unused.test')),
            ]),
        );
        const item = await files.ingest('Subset fixture', 'geosite', async () =>
            Buffer.concat([fixture.geosite, extra]),
        );
        const beforeSelection = await fs.readdir(files.directory(item.id));
        await assert.rejects(
            files.bundleUrl('geosite', [item.id], { [item.id]: ['missing'] }),
            /empty/,
        );
        assert.deepEqual(
            await fs.readdir(files.directory(item.id)),
            beforeSelection,
            'Invalid category selections cannot write manifests',
        );
        class SubsetModule {}
        Module({
            controllers: [PublicGeofilesController],
            providers: [{ provide: GeofilesService, useValue: files }],
        })(SubsetModule);
        app = await NestFactory.create(SubsetModule, { logger: false });
        app.setGlobalPrefix('api');
        await app.listen(0, '127.0.0.1');
        class SubsetProxy {}
        Module({
            controllers: [SubscriptionPageGeofiles],
            providers: [
                {
                    provide: UpstreamAxios,
                    useValue: {
                        geofileAxiosInstance: require('axios').create({
                            baseURL: await app.getUrl(),
                            proxy: false,
                        }),
                    },
                },
            ],
        })(SubsetProxy);
        proxy = await NestFactory.create(SubsetProxy, { logger: false });
        await proxy.listen(0, '127.0.0.1');
        const issued = new URL(
            await files.bundleUrl('geosite', [item.id], { [item.id]: ['example'] }),
        );
        assert.match(issued.pathname, /\/bundles\/m-[a-f0-9]{64}\//);
        const url = (await proxy.getUrl()) + issued.pathname;
        const response = await fetch(url);
        assert.equal(response.status, 200);
        const body = Buffer.from(await response.arrayBuffer());
        assert.deepEqual(
            compileDat(body, 'geosite', [datCategory(item.id, 'example') + '@ads']).domains,
            [{ type: 3, value: 'ads.example.com' }],
        );
        assert.throws(() => compileDat(body, 'geosite', [datCategory(item.id, 'unused')]), /empty/);
        assert.equal(
            await (await fetch(url + '.sha256')).text(),
            require('node:crypto').createHash('sha256').update(body).digest('hex'),
        );
        const restarted = new GeofilesService({ getOrThrow: () => 'sub.example.test' }, {}, {});
        const [, , owner, , selection, filename] = issued.pathname.split('/');
        assert.deepEqual(await restarted.bundle(owner, filename, selection), body);
        assert.equal(
            (await fetch(url.replace(/bundle-[a-f0-9]{64}/, 'bundle-' + '0'.repeat(64)))).status,
            404,
        );
        await fs.writeFile(
            path.join(files.directory(item.id), 'selection-' + selection.slice(2) + '.json'),
            '{}',
        );
        const tampered = await fetch(url);
        assert.equal(tampered.status, 404);
        assert(!JSON.stringify([...tampered.headers]).includes('sub.example.test'));
        assert.equal(await tampered.text(), '');
    } finally {
        if (proxy) await proxy.close();
        if (app) await app.close();
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('transient upstream failures cannot become cached missing geofiles or leak private responses', async () => {
    const http = require('node:http');
    let status = 503,
        received,
        holdOpen = false,
        closed = false,
        length = fixture.geoip.length;
    const upstream = http.createServer((request, response) => {
        received = request.headers;
        response.writeHead(status, {
            'Content-Length': String(length),
            'X-Private-Upstream': 'private-panel.example.test',
        });
        if (holdOpen) {
            response.write(fixture.geoip.subarray(0, 3));
            response.once('close', () => {
                closed = true;
            });
        } else response.end(fixture.geoip);
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    class AvailabilityProxy {}
    Module({
        controllers: [SubscriptionPageGeofiles],
        providers: [
            {
                provide: UpstreamAxios,
                useValue: {
                    geofileAxiosInstance: require('axios').create({
                        baseURL: 'http://127.0.0.1:' + upstream.address().port,
                        proxy: false,
                    }),
                },
            },
        ],
    })(AvailabilityProxy);
    const app = await NestFactory.create(AvailabilityProxy, { logger: false });
    await app.listen(0, '127.0.0.1');
    try {
        const url = (await app.getUrl()) + '/geofiles/' + 'a'.repeat(34) + '/latest.dat';
        for (const failure of [503, 502, 500, 504, 429, 404]) {
            status = failure;
            const response = await fetch(url, {
                headers: { Authorization: 'Bearer client-fixture-do-not-forward' },
            });
            assert.equal(response.status, failure === 404 ? 404 : 503);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            assert.equal(response.headers.get('retry-after'), failure === 404 ? null : '2');
            assert.equal(response.headers.get('x-private-upstream'), null);
            assert.equal(await response.text(), '');
            assert.equal(received.authorization, undefined);
        }
        status = 200;
        const recovered = await fetch(url);
        assert.equal(recovered.status, 200);
        assert.deepEqual(Buffer.from(await recovered.arrayBuffer()), fixture.geoip);
        status = 503;
        holdOpen = true;
        assert.equal((await fetch(url)).status, 503);
        for (let i = 0; i < 50 && !closed; i++)
            await new Promise((resolve) => setTimeout(resolve, 10));
        assert(closed, 'Rejected upstream streams must be closed immediately');
        closed = false;
        status = 200;
        length = 64 * 1024 * 1024 + 1;
        assert.equal((await fetch(url)).status, 404);
        for (let i = 0; i < 50 && !closed; i++)
            await new Promise((resolve) => setTimeout(resolve, 10));
        assert(closed, 'Oversized upstream responses must be closed before body consumption');
    } finally {
        await app.close();
        upstream.closeAllConnections();
        await new Promise((resolve) => upstream.close(resolve));
    }
});
