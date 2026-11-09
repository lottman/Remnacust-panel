const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
require('reflect-metadata');
const load = require('./load-typescript.cjs');
const subload = require('../../../subscription-page/backend/tests/load-typescript.cjs');
const util = path.join(__dirname, '../src/common/utils');
const pageRoot = path.join(__dirname, '../../../subscription-page/backend/src');
const { decideDomainAccess, cdnRequestProof } = load(
    path.join(util, 'subscription-domain-access.ts'),
);
const { cdnRequestHeaderName } = load(path.join(util, 'cdn-request-header.ts'));
const backendContext = load(path.join(util, 'geofile-request-context.ts'));
const relay = load(path.join(util, 'geofile-relay-origin.ts'));
const { JwtService } = require('@nestjs/jwt');
const { subscriptionDomainGateway: panelGateway } = load(
    path.join(__dirname, '../src/common/middlewares/subscription-domain-gateway.middleware.ts'),
    { '../utils/geofile-request-context': backendContext },
);
const pageContext = subload(path.join(pageRoot, 'common/utils/subscription-domain-context.ts'));
const contextMocks = {
    '../utils/subscription-domain-context': pageContext,
    '../../common/utils/subscription-domain-context': pageContext,
};
const { subscriptionDomainAccess } = subload(
    path.join(pageRoot, 'common/middlewares/subscription-domain-access.middleware.ts'),
    contextMocks,
);
const { subscriptionDomainGateway: pageGateway } = subload(
    path.join(pageRoot, 'common/middlewares/subscription-domain-gateway.middleware.ts'),
    contextMocks,
);
const ignored = subload(path.join(pageRoot, 'common/constants/ignored-headers.constant.ts'));
const { AxiosService } = subload(
    path.join(pageRoot, 'common/axios/axios.service.ts'),
    { ...contextMocks, '@common/config/app-config': {}, '@common/constants': ignored },
    { __RW_SUBPAGE_VERSION__: 'fixture' },
);
const { GeofilesController } = subload(
    path.join(pageRoot, 'modules/subscription/geofiles.controller.ts'),
    { ...contextMocks, '@common/axios/axios.service': {} },
);
const key = 'isolated-domain-http-fixture-key';
const primary = {
    uuid: '11111111-1111-4111-8111-111111111111',
    domain: 'sub.example.test',
    path: '',
    kind: 'PRIMARY',
    parentUuid: null,
    isDefault: true,
    accessMode: 'CDN_ONLY',
    redirectDomainUuid: null,
};
const cdn = {
    uuid: '22222222-2222-4222-8222-222222222222',
    domain: 'cdn.example.test',
    path: '',
    kind: 'CDN',
    parentUuid: primary.uuid,
    isDefault: false,
};
const cdn2 = { ...cdn, uuid: '33333333-3333-4333-8333-333333333333', domain: 'edge.example.test' };
const headers = (row) => ({
    [cdnRequestHeaderName(row.uuid, key)]: row.uuid + '.' + cdnRequestProof(row.uuid, key),
});
const origin = (row) => 'https://' + row.domain + row.path;
async function listen(app) {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return server;
}
function request(server, url, head = {}, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port: server.address().port,
                path: url,
                method,
                headers: { host: primary.domain, 'user-agent': 'Happ/6.3.0/ios', ...head },
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () =>
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                    }),
                );
            },
        );
        req.on('error', reject);
        req.end();
    });
}

test('real Page and Panel enforce origin policy on HTML, JSON, info, DAT, checksum and legacy paths without leaking proof', async (t) => {
    const rows = [{ ...primary }, cdn, cdn2];
    const jwt = new JwtService({ secret: key });
    const token = jwt.sign({ uuid: primary.uuid, role: 'API' }, { expiresIn: 300 });
    let activeToken = true;
    const resolve = async (uuid) => {
        const row = rows.find((row) => row.uuid === uuid && row.kind === 'CDN');
        if (!row) throw new Error('missing');
        return origin(row);
    };
    const upstream = express();
    upstream.use(
        panelGateway(
            resolve,
            async (uuid) => cdnRequestHeaderName(uuid, key),
            async (input, req) => {
                const relayed = await relay.relayGeofileContext(
                    req.headers,
                    (token) => jwt.verifyAsync(token),
                    async () =>
                        activeToken
                            ? {
                                  expireAt: new Date(Date.now() + 300000),
                                  scopes: ['subscriptions:subpage-config'],
                              }
                            : undefined,
                );
                return decideDomainAccess(
                    rows,
                    {
                        ...input,
                        ...(relayed?.origin ? { host: new URL(relayed.origin).host } : {}),
                    },
                    key,
                );
            },
        ),
    );
    upstream.use(express.json({ limit: '16kb' }));
    upstream.post('/api/sub/domains/access', (req, res) =>
        res.json({ response: decideDomainAccess(rows, req.body, key) }),
    );
    upstream.get('/api/sub/domains/:uuid/resolve', async (req, res) =>
        res.json({
            response: {
                uuid: req.params.uuid,
                publicBaseUrl: await resolve(req.params.uuid),
                requestHeaderName: cdnRequestHeaderName(req.params.uuid, key),
            },
        }),
    );
    const id = 'a'.repeat(34),
        filename = 'b'.repeat(64) + '.dat',
        bytes = Buffer.from('fixture-dat-bytes');
    upstream.get('/api/sub/geofiles/:id/:filename', (req, res) =>
        res
            .set({ 'Content-Length': String(bytes.length), ETag: '"' + 'c'.repeat(64) + '"' })
            .send(bytes),
    );
    upstream.get('/api/sub/:uuid/info', (req, res) =>
        res.json({ response: { username: 'fixture' } }),
    );
    upstream.get('/api/sub/:uuid/json', (req, res) =>
        res.json({ origin: backendContext.currentGeofileOrigin(), ok: true }),
    );
    const panelServer = await listen(upstream);
    const panelUrl = 'http://127.0.0.1:' + panelServer.address().port;
    const values = { REMNAWAVE_PANEL_URL: panelUrl, REMNAWAVE_API_TOKEN: token };
    const axios = new AxiosService({ getOrThrow: (k) => values[k], get: () => undefined });
    const files = new GeofilesController(axios);
    const page = express();
    page.use(subscriptionDomainAccess((input) => axios.checkSubscriptionDomainAccess(input)));
    page.use(pageGateway((uuid) => axios.resolveSubscriptionDomain(uuid)));
    page.get('/geofiles/:id/:filename', async (req, res) =>
        files.download(req.params.id, req.params.filename, undefined, req, res),
    );
    page.get('/key/json', async (req, res, next) => {
        try {
            const ctx = pageContext.currentSubscriptionDomain();
            const result = await axios.getSubscription(
                '127.0.0.1',
                'key',
                req.headers,
                true,
                'json',
                undefined,
                undefined,
                ctx ? new URL(ctx.publicBaseUrl).origin : undefined,
                ctx?.requestHeaderName ? ctx.uuid : undefined,
            );
            res.set(result.headers).send(result.subscription);
        } catch (err) {
            next(err);
        }
    });
    page.get('/key', async (req, res) => {
        const result = await axios.getSubscriptionInfo('127.0.0.1', 'key');
        res.status(result.isOk ? 200 : 503)
            .type('html')
            .send('fixture-page');
    });
    const pageServer = await listen(page);
    t.after(async () => {
        axios.onModuleDestroy();
        panelServer.closeAllConnections();
        pageServer.closeAllConnections();
        await Promise.all([
            new Promise((r) => panelServer.close(r)),
            new Promise((r) => pageServer.close(r)),
        ]);
    });
    for (const url of ['/key', '/key/json', `/geofiles/${id}/${filename}`]) {
        assert.equal((await request(pageServer, url)).status, 403);
        assert.equal((await request(pageServer, url, { host: cdn.domain })).status, 403);
        const result = await request(pageServer, url, headers(cdn));
        assert.equal(result.status, 200, result.body.toString());
        assert.equal(result.headers[cdnRequestHeaderName(cdn.uuid, key).toLowerCase()], undefined);
        assert.ok(!result.body.toString().includes(cdnRequestProof(cdn.uuid, key)));
    }
    const rendered = JSON.parse((await request(pageServer, '/key/json', headers(cdn))).body);
    assert.equal(rendered.origin, origin(cdn));
    const dat = await request(pageServer, `/geofiles/${id}/${filename}`, headers(cdn));
    assert.deepEqual(dat.body, bytes);
    assert.equal(
        (
            await request(pageServer, '/key/json', {
                [cdnRequestHeaderName(cdn.uuid, key)]: cdn.uuid,
            })
        ).status,
        403,
    );
    assert.equal((await request(pageServer, `/cdn/${cdn.uuid}/key/json`)).status, 403);
    assert.equal((await request(panelServer, '/API/SUB/key/json')).status, 403);
    assert.equal(
        (
            await request(panelServer, '/api/sub/key/json', {
                'x-remnacust-geofile-origin': origin(cdn),
                authorization: 'Bearer forged',
            })
        ).status,
        403,
    );
    const parallel = await Promise.all(
        Array.from({ length: 24 }, (_, i) => {
            const row = i % 2 ? cdn : cdn2;
            return request(pageServer, '/key/json', headers(row)).then((result) => [row, result]);
        }),
    );
    for (const [row, result] of parallel) {
        assert.equal(result.status, 200);
        assert.equal(JSON.parse(result.body).origin, origin(row));
    }
    rows[0].accessMode = 'REDIRECT';
    rows[0].redirectDomainUuid = cdn.uuid;
    for (const url of [
        '/key',
        '/key/json',
        `/geofiles/${id}/${filename}`,
        `/geofiles/${id}/bundle-${'d'.repeat(64)}.dat.sha256?revision=4`,
    ]) {
        const redirected = await request(pageServer, url);
        assert.equal(redirected.status, 307);
        assert.equal(redirected.headers.location, origin(cdn) + url);
        assert.equal(redirected.headers['cache-control'], 'private, no-store');
        assert.equal(redirected.headers['referrer-policy'], 'no-referrer');
    }
    assert.equal((await request(pageServer, '/key/json', { host: cdn.domain })).status, 403);
    assert.equal(
        (await request(pageServer, '/key/json', { host: cdn.domain, ...headers(cdn) })).status,
        200,
    );
    rows[0].accessMode = 'OPEN';
    rows[0].redirectDomainUuid = null;
    assert.equal((await request(pageServer, '/key/json')).status, 200);
    rows[0].accessMode = 'BLOCKED';
    for (const url of [
        '/key',
        '/key/json',
        `/geofiles/${id}/${filename}`,
        `/geofiles/${id}/bundle-${'d'.repeat(64)}.dat.sha256?revision=4`,
        `/cdn/${cdn.uuid}/key/json`,
    ]) {
        for (const head of [{}, headers(cdn), headers(cdn2)]) {
            const result = await request(pageServer, url, head);
            const conflicting =
                url.startsWith(`/cdn/${cdn.uuid}/`) &&
                Object.hasOwn(head, cdnRequestHeaderName(cdn2.uuid, key));
            assert.equal(result.status, conflicting ? 404 : 403);
            assert.equal(result.headers.location, undefined);
        }
    }
    assert.equal((await request(panelServer, '/api/sub/key/json', headers(cdn))).status, 403);
    rows[0].accessMode = 'OPEN';
    cdn.accessMode = 'BLOCKED';
    assert.equal((await request(pageServer, '/key/json', headers(cdn))).status, 403);
    assert.equal((await request(pageServer, '/key/json', headers(cdn2))).status, 200);
    cdn.accessMode = 'OPEN';
    activeToken = false;
    rows[0].accessMode = 'CDN_ONLY';
    assert.equal(
        (
            await request(panelServer, '/api/sub/key/json', {
                'x-remnacust-geofile-origin': origin(cdn),
                authorization: 'Bearer ' + token,
            })
        ).status,
        403,
    );
});
