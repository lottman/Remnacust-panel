const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
require('reflect-metadata');
const { Controller, Get, Inject, Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { APP_CONFIG_ROUTE_WO_LEADING_PATH } = require('@remnawave/subscription-page-types');
const load = require('./load-typescript.cjs');
const context = load(path.join(__dirname, '../src/common/utils/subscription-domain-context.ts'));
const { AxiosService } = load(
    path.join(__dirname, '../src/common/axios/axios.service.ts'),
    {
        '@common/config/app-config': {},
        '@common/constants': { IGNORED_HEADERS: new Set() },
    },
    { __RW_SUBPAGE_VERSION__: 'test' },
);
const { GeofilesController } = load(
    path.join(__dirname, '../src/modules/subscription/geofiles.controller.ts'),
    {
        '@common/axios/axios.service': { AxiosService },
        '../../common/utils/subscription-domain-context': context,
    },
);
Inject(AxiosService)(GeofilesController, undefined, 0);
const main = ts.createSourceFile(
    'main.ts',
    fs.readFileSync(path.join(__dirname, '../src/main.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
);
const bootstrap = main.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'bootstrap',
);
const middlewareImports = main.statements.filter(
    (node) =>
        ts.isImportDeclaration(node) &&
        /\/middlewares\/(?:subscription-domain-(?:access|gateway)|geofile-root-alias)\.middleware$/.test(
            node.moduleSpecifier.text,
        ),
);
const middleware = Object.assign(
    {},
    ...middlewareImports.map((node) =>
        load(
            path.join(
                __dirname,
                '../src',
                node.moduleSpecifier.text.replace('@common/', 'common/'),
            ) + '.ts',
            { '../utils/subscription-domain-context': context },
        ),
    ),
);
const routeSetup = bootstrap.body.statements
    .filter(
        (node) =>
            ts.isExpressionStatement(node) &&
            ts.isCallExpression(node.expression) &&
            (node.expression.expression.getText(main) === 'app.setGlobalPrefix' ||
                (node.expression.expression.getText(main) === 'app.use' &&
                    /\b(?:subscriptionDomainAccess|subscriptionDomainGateway|geofileRootAlias)\(/.test(
                        node.getText(main),
                    ))),
    )
    .map((node) => node.getText(main))
    .join('\n');
const id = 'a'.repeat(34);
const bytes = Buffer.from('synthetic geofile bytes');
const digest = createHash('sha256').update(bytes).digest('hex');
const domainUuid = '11111111-1111-4111-8111-111111111111';
const selection = 'Y2F0ZWdvcnktcnU';
const bundle = 'bundle-' + digest + '.dat';

async function fixture(t, prefix = 'public') {
    const domains = [],
        downloads = [];
    const upstream = http.createServer(async (req, res) => {
        if (req.headers.authorization !== 'Bearer synthetic-token') {
            res.writeHead(401);
            return res.end();
        }
        if (req.url === '/api/sub/domains/access') {
            let body = '';
            for await (const chunk of req) body += chunk;
            const input = JSON.parse(body);
            domains.push(input);
            res.setHeader('Content-Type', 'application/json');
            return res.end(
                JSON.stringify({
                    response:
                        input.host === 'blocked.example.test'
                            ? { action: 'block' }
                            : input.host === 'redirect.example.test'
                              ? { action: 'redirect', location: 'https://files.example.test/safe' }
                              : {
                                    action: 'allow',
                                    domain: {
                                        uuid: domainUuid,
                                        publicBaseUrl: 'https://files.example.test',
                                    },
                                },
                }),
            );
        }
        if (req.url.startsWith(`/api/sub/domains/${domainUuid}/resolve?`)) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(
                JSON.stringify({
                    response: {
                        uuid: domainUuid,
                        publicBaseUrl: 'https://cdn.example.test/edge',
                    },
                }),
            );
        }
        const url = new URL(req.url, 'http://upstream.test');
        if (!url.pathname.startsWith(`/api/sub/geofiles/${id}/`)) {
            res.writeHead(404);
            return res.end();
        }
        downloads.push({ url: req.url, origin: req.headers['x-remnacust-geofile-origin'] });
        const checksum = url.pathname.endsWith('.sha256');
        const data = checksum ? Buffer.from(digest) : bytes;
        res.writeHead(200, { 'Content-Length': data.length, ETag: '"' + digest + '"' });
        res.end(data);
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => upstream.close(resolve)));
    const service = new AxiosService({
        getOrThrow: (key) =>
            key === 'REMNAWAVE_PANEL_URL'
                ? `http://127.0.0.1:${upstream.address().port}`
                : 'synthetic-token',
        get: () => undefined,
    });
    service.axiosInstance.defaults.proxy = false;
    service.geofileAxiosInstance.defaults.proxy = false;
    t.after(() => service.onModuleDestroy());
    class OtherRoutes {
        subscription() {
            return 'subscription';
        }
        config() {
            return 'config';
        }
    }
    Controller()(OtherRoutes);
    Get('fixture-key')(
        OtherRoutes.prototype,
        'subscription',
        Object.getOwnPropertyDescriptor(OtherRoutes.prototype, 'subscription'),
    );
    Get(APP_CONFIG_ROUTE_WO_LEADING_PATH)(
        OtherRoutes.prototype,
        'config',
        Object.getOwnPropertyDescriptor(OtherRoutes.prototype, 'config'),
    );
    class TestModule {}
    Module({
        controllers: [GeofilesController, OtherRoutes],
        providers: [
            {
                provide: AxiosService,
                useValue: {
                    geofileAxiosInstance: service.geofileAxiosInstance,
                    checkSubscriptionDomainAccess:
                        service.checkSubscriptionDomainAccess.bind(service),
                    resolveSubscriptionDomain: service.resolveSubscriptionDomain.bind(service),
                },
            },
        ],
    })(TestModule);
    const app = await NestFactory.create(TestModule, { logger: false });
    t.after(() => app.close());
    new Function(
        'app',
        'AxiosService',
        'customSubPrefix',
        'APP_CONFIG_ROUTE_WO_LEADING_PATH',
        ...Object.keys(middleware),
        routeSetup,
    )(app, AxiosService, prefix, APP_CONFIG_ROUTE_WO_LEADING_PATH, ...Object.values(middleware));
    await app.listen(0, '127.0.0.1');
    const port = app.getHttpServer().address().port;
    const request = (url, method = 'GET', host = 'files.example.test', headers = {}) =>
        new Promise((resolve, reject) => {
            const req = http.request(
                { hostname: '127.0.0.1', port, path: url, method, headers: { host, ...headers } },
                (res) => {
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () =>
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            body: Buffer.concat(chunks).toString(),
                        }),
                    );
                },
            );
            req.on('error', reject);
            req.end();
        });
    return { request, domains, downloads };
}

test('actual Page routes serve root and existing prefixed geofiles with a custom prefix', async (t) => {
    const { request, downloads } = await fixture(t);
    for (const base of ['', '/public']) {
        for (const filename of [
            'latest.dat',
            digest + '.dat',
            'latest.srs',
            'latest.json',
            'latest.yaml',
            'latest.txt',
        ]) {
            for (const method of ['GET', 'HEAD']) {
                const response = await request(`${base}/geofiles/${id}/${filename}`, method);
                assert.equal(response.status, 200, base + '/' + filename + ' ' + method);
                assert.equal(response.body, method === 'HEAD' ? '' : bytes.toString());
                assert.equal(response.headers['content-length'], String(bytes.length));
                assert.equal(response.headers.etag, '"' + digest + '"');
            }
        }
    }
    assert.ok(downloads.every((call) => call.origin === 'https://files.example.test'));
});

test('path and revision-query checksum sidecars and both bundle forms retain GET/HEAD semantics', async (t) => {
    const { request, downloads } = await fixture(t);
    for (const base of ['', '/public']) {
        for (const tail of [
            'latest.dat.sha256',
            `latest.dat?revision=${digest}.sha256`,
            `bundles/${selection}/${bundle}.sha256`,
            `bundles/${selection}/${bundle}?revision=${digest}.sha256`,
            `${bundle}.sha256?selection=${selection}`,
        ]) {
            for (const method of ['GET', 'HEAD']) {
                const response = await request(`${base}/geofiles/${id}/${tail}`, method);
                assert.equal(response.status, 200, tail + ' ' + method);
                assert.equal(response.body, method === 'HEAD' ? '' : digest);
                assert.match(response.headers['content-type'], /text\/plain/);
            }
        }
        for (const tail of [`bundles/${selection}/${bundle}`, `${bundle}?selection=${selection}`]) {
            for (const method of ['GET', 'HEAD']) {
                const response = await request(`${base}/geofiles/${id}/${tail}`, method);
                assert.equal(response.status, 200);
                assert.equal(response.body, method === 'HEAD' ? '' : bytes.toString());
            }
        }
    }
    assert.ok(
        downloads
            .filter((call) => call.url.includes('bundle-'))
            .every(
                (call) =>
                    new URL(call.url, 'http://upstream.test').searchParams.get('selection') ===
                    selection,
            ),
    );
});

test('invalid IDs, filenames, selections and raw traversal paths never reach the geofile upstream', async (t) => {
    const { request, downloads } = await fixture(t);
    for (const base of ['', '/public']) {
        for (const tail of [
            `${id.slice(1)}/latest.dat`,
            `${id.toUpperCase()}/latest.dat`,
            `${id}/unknown.dat`,
            `${id}/../latest.dat`,
            `${id}/..%2flatest.dat`,
            `${id}/%2e%2e/latest.dat`,
            `${id}/%252e%252e%252flatest.dat`,
            `${id}/..\\latest.dat`,
            `${id}//latest.dat`,
            `${id}/latest.dat/extra`,
            `${id}/bundles/${selection}/latest.dat`,
            `${id}/${bundle}`,
            `${id}/${bundle}?selection=bad%2fselection`,
            `${id}/${bundle}?selection=a&selection=b`,
            `${id}/bundles/${'x'.repeat(2733)}/${bundle}`,
        ]) {
            const response = await request(`${base}/geofiles/${tail}`);
            assert.equal(response.status, 404, tail);
        }
    }
    assert.equal(downloads.length, 0);
});

test('domain blocking, redirects and method rejection precede root aliases and existing routes', async (t) => {
    const { request, domains, downloads } = await fixture(t);
    for (const base of ['', '/public']) {
        const url = `${base}/geofiles/${id}/latest.dat?revision=${digest}`;
        for (const method of ['GET', 'HEAD']) {
            assert.equal((await request(url, method, 'blocked.example.test')).status, 403);
            assert.equal(domains.at(-1).url, url);
            const redirect = await request(url, method, 'redirect.example.test');
            assert.equal(redirect.status, 307);
            assert.equal(redirect.headers.location, 'https://files.example.test/safe');
        }
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
            assert.equal((await request(url, method)).status, 404);
    }
    assert.equal(downloads.length, 0);
});

test('other root paths stay unaliased and existing subscription, app-config and CDN routes survive', async (t) => {
    const { request, downloads } = await fixture(t);
    assert.equal((await request('/fixture-key')).status, 404);
    assert.equal((await request('/public/fixture-key')).body, 'subscription');
    assert.equal((await request('/' + APP_CONFIG_ROUTE_WO_LEADING_PATH)).body, 'config');
    assert.equal((await request('/geofiles-other/' + id + '/latest.dat')).status, 404);
    const cdn = await request(`/edge/cdn/${domainUuid}/geofiles/${id}/latest.dat`);
    assert.equal(cdn.status, 200);
    assert.equal(cdn.body, bytes.toString());
    assert.equal(downloads.at(-1).origin, 'https://cdn.example.test');
});

test('empty, slash-padded, nested and geofiles-named prefixes preserve root and prefixed delivery', async (t) => {
    for (const prefix of ['', '/', '/custom/nested/', 'geofiles']) {
        await t.test(prefix || 'empty', async (t) => {
            const { request } = await fixture(t, prefix);
            const base = prefix.replace(/^\/+|\/+$/g, '');
            for (const root of ['', ...(base ? ['/' + base] : [])])
                assert.equal((await request(`${root}/geofiles/${id}/latest.dat`)).status, 200);
        });
    }
});

test('the alias itself preserves the original URL and query bytes and only rewrites GET/HEAD geofile shapes', () => {
    const alias = middleware.geofileRootAlias('/public/');
    const originalUrl = `/geofiles/${id}/latest.dat?revision=${digest}.sha256&value=%2F%3F&value=two`;
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        const req = { method, url: originalUrl, originalUrl };
        let nextCalls = 0;
        alias(req, {}, () => nextCalls++);
        assert.equal(
            req.url,
            ['GET', 'HEAD'].includes(method) ? '/public' + originalUrl : originalUrl,
        );
        assert.equal(req.originalUrl, originalUrl);
        assert.equal(nextCalls, 1);
    }
    for (const url of [
        '/public' + originalUrl,
        `/geofiles/${id}/..%2flatest.dat`,
        `/geofiles/${id}/../latest.dat`,
        `/geofiles/${id}/latest.dat/extra`,
        '/fixture-key',
    ]) {
        const req = { method: 'GET', url };
        alias(req, {}, () => {});
        assert.equal(req.url, url);
    }
});
