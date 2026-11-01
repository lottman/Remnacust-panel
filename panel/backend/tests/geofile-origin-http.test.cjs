const test = require('node:test'),
    assert = require('node:assert/strict'),
    path = require('node:path');
const express = require('express'),
    http = require('node:http');
require('reflect-metadata');
const load = require('./load-typescript.cjs');
const subload = require('../../../subscription-page/backend/tests/load-typescript.cjs');
const utils = path.join(__dirname, '../src/common/utils');
const ctx = load(path.join(utils, 'geofile-request-context.ts'));
const origin = load(path.join(utils, 'public-geofile-origin.ts'));
const relay = load(path.join(utils, 'geofile-relay-origin.ts'));
const { mocks, pool } = require('./client-pool-fixture.cjs');
const { JwtService } = require('@nestjs/jwt');
const { GeofilesService } = load(
    path.join(__dirname, '../src/modules/subscription-template/geofiles/geofiles.service.ts'),
    {
        ...mocks,
        '../generators/client-pool': pool,
        '@common/config/app-config/typed-config.service': {},
        '@common/database/prisma.service': {},
        '../../../common/utils/geofile-request-context': ctx,
    },
);
const { ResponseRulesMiddleware } = load(
    path.join(
        __dirname,
        '../src/modules/subscription-response-rules/middleware/response-rules.middleware.ts',
    ),
    {
        '@common/config/app-config': {},
        '@common/exception/http-exeception-with-error-code.type': {
            HttpExceptionWithErrorCodeType: Error,
        },
        '@common/middlewares/subscription-budget.middleware': load(
            path.join(__dirname, '../src/common/middlewares/subscription-budget.middleware.ts'),
        ),
        '@common/utils/bounded-regex': {},
        '@common/utils/extract-hwid-headers/extract-hwid-headers.util': {
            extractHwidHeaders: () => null,
        },
        '@common/utils/geofile-relay-origin': relay,
        '@common/utils/geofile-request-context': ctx,
        '@common/utils/public-geofile-origin': origin,
        '@common/utils/truncate-header.util': { truncateHeader: (v) => v },
        '@libs/contracts/constants': { ERRORS: require('../libs/contract/build/backend').ERRORS, RESPONSE_RULES_RESPONSE_TYPES: {} },
        '@modules/api-tokens/queries/get-token-by-uuid/get-token-by-uuid.query': {
            GetTokenByUuidQuery: class {
                constructor(uuid) {
                    this.uuid = uuid;
                }
            },
        },
        '@modules/subscription-settings/queries/get-cached-subscrtipion-settings': {
            GetCachedSubscriptionSettingsQuery: class {},
        },
        '@modules/subscription-template/constants': { isExtendedClient: () => true },
        '../services/response-rules-matcher.service': {},
    },
);
const pageRoot = path.join(__dirname, '../../../subscription-page/backend');
const pageContext = subload(path.join(pageRoot, 'src/common/utils/subscription-domain-context.ts'));
const { subscriptionDomainGateway } = subload(path.join(pageRoot, 'src/common/middlewares/subscription-domain-gateway.middleware.ts'), {
    '../utils/subscription-domain-context': pageContext,
});
const ignored = subload(path.join(pageRoot, 'src/common/constants/ignored-headers.constant.ts'));
const { headerFilterMiddleware } = subload(
    path.join(pageRoot, 'src/common/middlewares/header-filter.middleware.ts'),
    { '@common/constants': ignored },
);
const headers = subload(path.join(pageRoot, 'src/common/axios/subscription-request-headers.ts'));
const { AxiosService } = subload(
    path.join(pageRoot, 'src/common/axios/axios.service.ts'),
    {
        '@common/config/app-config': {},
        '@common/constants': ignored,
        './subscription-request-headers': headers,
    },
    { __RW_SUBPAGE_VERSION__: 'test' },
);
const { SubscriptionService } = subload(
    path.join(pageRoot, 'src/modules/subscription/subscription.service.ts'),
    { '@common/axios/axios.service': {}, '../../common/utils/public-geofile-origin': origin,
      '../../common/utils/subscription-domain-context': pageContext },
);
const { GeofilesController } = subload(
    path.join(pageRoot, 'src/modules/subscription/geofiles.controller.ts'),
    { '@common/axios/axios.service': { AxiosService } },
);
const { XrayGeofileDelivery } = load(
    path.join(__dirname, '../src/modules/subscription-template/geofiles/xray-geofile-delivery.ts'),
    { ...mocks, '../generators/client-pool': pool },
);
const { bundleDat } = load(
    path.join(__dirname, '../src/modules/subscription-template/geofiles/bundle-dat.ts'),
    { ...mocks, '../generators/client-pool': pool },
);
const fixture = require('./geofiles-fixture.cjs');

test('real page-to-panel HTTP keeps CDN authority for routing, JSON, DAT and checksum without changing the authenticated upstream', async () => {
    const key = 'fixture-cdn-key',
        id = 'a'.repeat(34),
        uuid = '01234567-89ab-4def-8123-456789abcdef';
    let tokenActive = true;
    const jwt = new JwtService({ secret: key }),
        apiToken = jwt.sign({ uuid, role: 'API' }, { expiresIn: 300 });
    const files = new GeofilesService(
        { getOrThrow: (k) => (k === 'SUB_PUBLIC_DOMAIN' ? 'canonical.example.test' : key) },
        {},
        {},
    );
    const dat = bundleDat([{ id, data: fixture.geosite }]);
    files.bundleContent = async () => dat;
    const domains = {
        gatewayBase: async (uuid) => {
            if (uuid === '11111111-1111-4111-8111-111111111111')
                return `https://cdn-a.example.test/cdn/${uuid}`;
            if (uuid === '22222222-2222-4222-8222-222222222222')
                return `https://cdn-b.example.test/cdn/${uuid}`;
            throw Error('Unknown domain');
        },
        resolveOrigin: async (origin) =>
            ({
                'https://cdn-a.example.test': 'https://cdn-a.example.test',
                'https://cdn-b.example.test:8443': 'https://cdn-b.example.test:8443',
            })[origin] ?? 'https://canonical.example.test',
    };
    const middleware = new ResponseRulesMiddleware(
        {
            execute: async (q) =>
                q.uuid
                    ? {
                          isOk: tokenActive,
                          response: {
                              expireAt: new Date(Date.now() + 300000),
                              scopes: ['subscriptions:subpage-config'],
                          },
                      }
                    : { responseRules: {} },
        },
        { matchRules: async () => ({ matched: true, responseType: 'XRAY_JSON' }) },
        { getOrThrow: () => key },
        domains,
    );
    const upstream = express();
    upstream.get('/api/sub/domains/:uuid/resolve', async (req, res) => {
        try {
            return res.json({ response: { uuid: req.params.uuid, publicBaseUrl: await domains.gatewayBase(req.params.uuid) } });
        } catch { res.status(404).end(); }
    });
    upstream.use((req, res, next) => middleware.use(req, res, next));
    upstream.get('/api/sub/fixture/json', async (req, res) => {
        await new Promise((r) => setTimeout(r, 3));
        const delivery = new XrayGeofileDelivery('incy', 'remote', 'Fixture');
        const refs = delivery.register(
            'geosite',
            { id, target: 'DIRECT', categories: ['example'] },
            (kind, ids) => files.bundleUrl(kind, ids),
        );
        const body = JSON.stringify([
            {
                inbounds: [],
                outbounds: [{ tag: 'direct', protocol: 'freedom' }],
                routing: { rules: [{ domain: refs, outboundTag: 'direct' }] },
            },
        ]);
        res.set('routing', await delivery.header(body, 'fixture'));
        res.type('json').send(body);
    });
    upstream.get('/api/sub/geofiles/:id/:filename', async (req, res) => {
        try {
            const content = await files.bundle(
                req.params.id,
                req.params.filename,
                req.query.selection,
            );
            res.set('Content-Length', String(content.length));
            res.send(content);
        } catch {
            res.status(404).end();
        }
    });
    upstream.use((_err, _req, res, _next) => res.status(500).end());
    const backend = http.createServer(upstream);
    await new Promise((r) => backend.listen(0, '127.0.0.1', r));
    const values = {
        REMNAWAVE_PANEL_URL: `http://127.0.0.1:${backend.address().port}`,
        REMNAWAVE_API_TOKEN: apiToken,
    };
    const axios = new AxiosService({ getOrThrow: (k) => values[k], get: () => undefined });
    const service = new SubscriptionService(axios),
        controller = new GeofilesController(axios);
    const page = express();
    page.use(headerFilterMiddleware);
    page.use(subscriptionDomainGateway(uuid => axios.resolveSubscriptionDomain(uuid)));
    page.get('/fixture/json', (req, res) =>
        service.serveSubscriptionPage('192.0.2.1', req, res, 'fixture', 'json'),
    );
    page.get('/geofiles/:id/bundles/:selection/:filename', (req, res) =>
        controller.bundleDownload(
            req.params.id,
            req.params.filename,
            req.params.selection,
            req,
            res,
        ),
    );
    const front = http.createServer(page);
    await new Promise((r) => front.listen(0, '127.0.0.1', r));
    try {
        const request = (host, url = '/fixture/json', cdnId) =>
            new Promise((resolve, reject) => {
                http.get(
                    {
                        host: '127.0.0.1',
                        port: front.address().port,
                        path: url,
                        headers: {
                            host,
                            'user-agent': 'INCY/2.6.2/iOS',
                            'x-forwarded-host': 'evil.test',
                            'x-remnacust-geofile-origin': 'https://evil.test',
                            'x-remnacust-subscription-domain': '33333333-3333-4333-8333-333333333333',
                            ...(cdnId ? { 'x-remnacust-cdn': cdnId } : {}),
                        },
                    },
                    (res) => {
                        const chunks = [];
                        res.on('data', (v) => chunks.push(v));
                        res.on('end', () =>
                            resolve({
                                status: res.statusCode,
                                headers: res.headers,
                                body: Buffer.concat(chunks),
                            }),
                        );
                    },
                ).on('error', reject);
            });
        const results = await Promise.all(
            ['cdn-a.example.test', 'cdn-b.example.test:8443'].map((host) => request(host)),
        );
        for (let i = 0; i < results.length; i++) {
            const response = results[i];
            assert.equal(response.status, 200);
            const route = JSON.parse(
                Buffer.from(response.headers.routing.split('/onadd/')[1], 'base64'),
            );
            const url = new URL(route.Geositeurl);
            assert.equal(
                url.origin,
                i ? 'https://cdn-b.example.test:8443' : 'https://cdn-a.example.test',
            );
            assert(!response.body.includes('evil.test'));
            const download = await request(url.host, url.pathname);
            assert.equal(download.status, 200);
            assert.deepEqual(download.body, dat);
            const checksum = await request(url.host, url.pathname + '.sha256');
            assert.equal(checksum.status, 200);
            assert.equal(
                checksum.body.toString().trim(),
                require('crypto').createHash('sha256').update(dat).digest('hex'),
            );
        }
        // VK rewrites the HTTP authority to the canonical origin. Only the
        // registered path ID, passed with the page's JWT, selects the CDN.
        const domainId = '11111111-1111-4111-8111-111111111111';
        const ids = [domainId, '22222222-2222-4222-8222-222222222222'];
        const viaHeader = await Promise.all(ids.map(id => request('canonical.example.test', '/fixture/json', id)));
        for (const [index, result] of viaHeader.entries()) {
            assert.equal(result.status, 200);
            const profile = JSON.parse(Buffer.from(result.headers.routing.split('/onadd/')[1], 'base64'));
            const url = new URL(profile.Geositeurl);
            assert.equal(url.hostname, index ? 'cdn-b.example.test' : 'cdn-a.example.test');
            const downloaded = await request('canonical.example.test', url.pathname + url.search, ids[index]);
            assert.equal(downloaded.status, 200);
            assert.deepEqual(downloaded.body, dat);
            const checksum = await request('canonical.example.test', url.pathname + '.sha256' + url.search, ids[index]);
            assert.equal(checksum.status, 200);
            assert.equal(checksum.body.toString().trim(), require('crypto').createHash('sha256').update(dat).digest('hex'));
        }
        const viaGateway = await Promise.all(Array.from({ length: 8 }, (_, index) =>
            request('canonical.example.test', `/cdn/${ids[index % 2]}/fixture/json`)));
        for (const [index, result] of viaGateway.entries()) {
            assert.equal(result.status, 200);
            const profile = JSON.parse(Buffer.from(result.headers.routing.split('/onadd/')[1], 'base64'));
            const url = new URL(profile.Geositeurl);
            assert.equal(url.hostname, index % 2 ? 'cdn-b.example.test' : 'cdn-a.example.test');
            assert.ok(url.pathname.startsWith(`/cdn/${ids[index % 2]}/geofiles/`));
            const download = await request('canonical.example.test', url.pathname + url.search);
            assert.equal(download.status, 200);
            assert.deepEqual(download.body, dat);
            const checksum = await request('canonical.example.test', url.pathname + '.sha256' + url.search);
            assert.equal(checksum.status, 200);
            assert.equal(checksum.body.toString().trim(), require('crypto').createHash('sha256').update(dat).digest('hex'));
        }
        for (const url of ['/cdn/not-a-uuid/fixture/json', '/cdn/33333333-3333-4333-8333-333333333333/fixture/json',
            `/cdn/${domainId}/cdn/${domainId}/fixture/json`])
            assert.equal((await request('canonical.example.test', url)).status, 404);
        tokenActive = false;
        assert.equal((await request('canonical.example.test', '/fixture/json', domainId)).status, 503);
        assert.equal((await request('canonical.example.test', `/cdn/${domainId}/fixture/json`)).status, 503);
        const revoked = await request('cdn-a.example.test');
        const profile = JSON.parse(
            Buffer.from(revoked.headers.routing.split('/onadd/')[1], 'base64'),
        );
        assert(new URL(profile.Geositeurl).hostname === 'canonical.example.test');
    } finally {
        axios.onModuleDestroy();
        await Promise.all([front, backend].map((server) => new Promise((r) => server.close(r))));
    }
});
