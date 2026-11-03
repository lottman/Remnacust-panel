const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
require('reflect-metadata');
const load = require('./load-typescript.cjs');
const headersModule = load(
    path.join(__dirname, '../src/common/axios/subscription-request-headers.ts'),
);
const { AxiosService } = load(
    path.join(__dirname, '../src/common/axios/axios.service.ts'),
    {
        '@common/config/app-config': {},
        '@common/constants': { IGNORED_HEADERS: new Set(['connection', 'transfer-encoding']) },
        './subscription-request-headers': headersModule,
    },
    { __RW_SUBPAGE_VERSION__: 'test' },
);

test('subscription metadata cannot replace gateway credentials or forward hop-by-hop headers', () => {
    assert.deepEqual(
        headersModule.subscriptionRequestHeaders({
            authorization: 'client',
            cookie: 'client',
            'x-api-key': 'client',
            'x-remnacust-geofile-origin': 'https://evil.test',
            'cf-access-client-secret': 'client',
            'x-forwarded-for': 'spoofed',
            connection: 'x-hop',
            'x-hop': 'discard',
            host: 'evil.test',
            'user-agent': 'INCY/2.6.2',
            'x-hwid': 'test-device',
            'x-custom-rule': 'keep',
        }),
        { 'user-agent': 'INCY/2.6.2', 'x-hwid': 'test-device', 'x-custom-rule': 'keep' },
    );
});

test('real HTTP transport reuses connections, proxies device formats and refuses credential redirects', async () => {
    const requests = [];
    let connections = 0,
        redirected = 0;
    const target = http.createServer((_req, res) => {
        redirected++;
        res.end('unexpected');
    });
    await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
    const upstream = http.createServer((req, res) => {
        requests.push({ url: req.url, headers: req.headers });
        if (req.url.includes('redirect')) {
            res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/secret` });
            return res.end();
        }
        res.setHeader('subscription-userinfo', 'upload=1');
        res.setHeader('location', `http://127.0.0.1:${upstream.address().port}/private`);
        res.setHeader('x-upstream', `http://127.0.0.1:${upstream.address().port}/private`);
        if (req.url.includes('leak'))
            return res.end(`https://127.0.0.1:${upstream.address().port}/private`);
        res.end('[{"outbounds":[]}]');
    });
    upstream.on('connection', () => connections++);
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const values = {
        REMNAWAVE_PANEL_URL: `http://127.0.0.1:${upstream.address().port}/`,
        REMNAWAVE_API_TOKEN: 'configured-panel',
        CADDY_AUTH_API_TOKEN: 'configured-gateway',
        CLOUDFLARE_ZERO_TRUST_CLIENT_ID: 'configured-id',
        CLOUDFLARE_ZERO_TRUST_CLIENT_SECRET: 'configured-secret',
        EGAMES_COOKIE: 'configured-cookie',
    };
    const service = new AxiosService({
        getOrThrow: (key) => values[key],
        get: (key) => values[key],
    });
    try {
        const supplied = {
            authorization: 'client',
            'x-api-key': 'client',
            cookie: 'client',
            'cf-access-client-secret': 'client',
            'user-agent': 'INCY/2.6.2',
            'x-hwid': 'fixture-device',
        };
        for (const format of [undefined, 'json']) {
            const result = await service.getSubscription(
                '192.0.2.1',
                'fixture123',
                supplied,
                !!format,
                format,
                undefined,
                'device.signature',
            );
            assert.equal(result.subscription.toString(), '[{"outbounds":[]}]');
            assert.equal(result.headers.location, undefined);
            assert.equal(result.headers['x-upstream'], undefined);
        }
        assert.deepEqual(
            requests.map((r) => r.url),
            [
                '/api/sub/fixture123/device/device.signature',
                '/api/sub/fixture123/device/device.signature/json',
            ],
        );
        assert.equal(connections, 1);
        for (const { headers } of requests) {
            assert.equal(headers.authorization, undefined);
            assert.equal(headers['x-api-key'], 'configured-gateway');
            assert.equal(headers['cf-access-client-secret'], 'configured-secret');
            assert.equal(headers.cookie, 'configured-cookie');
            assert.equal(headers['x-hwid'], 'fixture-device');
            assert.equal(headers['user-agent'], 'INCY/2.6.2');
        }
        await service.getSubscription(
            '192.0.2.1',
            'fixture123',
            { ...supplied, 'x-remnacust-geofile-origin': 'https://evil.test' },
            false,
            undefined,
            undefined,
            undefined,
            'https://cdn.example.test',
        );
        assert.equal(
            requests.at(-1).headers['x-remnacust-geofile-origin'],
            'https://cdn.example.test',
        );
        assert.equal(requests.at(-1).headers.authorization, 'Bearer configured-panel');
        assert(
            requests.at(-1).headers.host.startsWith('127.0.0.1:'),
            'CDN authority must not change the actual upstream',
        );
        await assert.rejects(
            service.getSubscription('192.0.2.1', 'redirect', {}),
            /UPSTREAM_SUBSCRIPTION_UNAVAILABLE/,
        );
        await assert.rejects(
            service.getSubscription('192.0.2.1', 'leak', {}),
            /UPSTREAM_SUBSCRIPTION_UNAVAILABLE/,
        );
        assert.equal(redirected, 0);
        assert.equal(service.axiosInstance.defaults.httpAgent.maxSockets, 32);
        assert.equal(service.axiosInstance.defaults.httpAgent.maxFreeSockets, 8);
    } finally {
        service.onModuleDestroy();
        await Promise.all(
            [upstream, target].map((server) => new Promise((resolve) => server.close(resolve))),
        );
    }
});

test('cold subscription waits for node acknowledgement beyond ten seconds and still cancels disconnected clients', async () => {
    let requests=0;
    const upstream=http.createServer((req,res)=>{
        requests++;
        const timer=setTimeout(()=>res.end('[{"outbounds":[]}]'),10_200);
        res.on('close',()=>clearTimeout(timer));
    });
    await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
    const values={REMNAWAVE_PANEL_URL:`http://127.0.0.1:${upstream.address().port}/`,REMNAWAVE_API_TOKEN:'fixture'};
    const service=new AxiosService({getOrThrow:key=>values[key],get:key=>values[key]});
    try {
        const result=await service.getSubscription('192.0.2.1','cold',{});
        assert.equal(result.subscription.toString(),'[{"outbounds":[]}]');
        assert.equal(service.axiosInstance.defaults.timeout,10_000);
        const controller=new AbortController();
        const pending=service.getSubscription('192.0.2.1','cancelled',{},false,undefined,controller.signal);
        while(requests<2)await new Promise(r=>setImmediate(r));
        controller.abort();
        await assert.rejects(pending,/UPSTREAM_SUBSCRIPTION_UNAVAILABLE/);
    } finally {
        service.onModuleDestroy();
        await new Promise(resolve=>upstream.close(resolve));
    }
});

test('device routes keep the credential in the backend path, reject malformed input and never render account HTML', async () => {
    const noop = () => () => {};
    const { SubscriptionController } = load(
        path.join(__dirname, '../src/modules/subscription/subscription.controller.ts'),
        {
            '@common/decorators/get-ip': { ClientIp: noop },
            '@common/decorators/get-resolved-short-uuid': { ResolvedShortUuid: noop },
            '@common/decorators/is-browser': { IsBrowser: noop },
            '@modules/webpage/webpage.service': {},
            './subscription.service': {},
        },
    );
    let called = 0;
    const token = 'a'.repeat(16) + '.' + 'b'.repeat(43);
    const controller = new SubscriptionController(
        {
            serveSubscriptionPage: async (...args) => {
                called++;
                return args;
            },
        },
        {
            serveWebpage: () => {
                throw Error('device credential must never render HTML');
            },
        },
    );
    const response = () => ({
        headers: {},
        set(k, v) {
            this.headers[k] = v;
            return this;
        },
        status(code) {
            this.code = code;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
    });
    for (const format of [undefined, 'json']) {
        const res = response();
        const args = await controller.personal(
            '192.0.2.1',
            { headers: {} },
            res,
            'fixture123',
            token,
            format,
        );
        assert.equal(args[3], 'fixture123');
        assert.equal(args[4], format);
        assert.equal(args[5], token);
        assert.equal(res.headers['Cache-Control'], 'private, no-store');
    }
    for (const [uuid, key, format] of [
        ['short', token],
        ['fixture123', '../bad'],
        ['fixture123', token, 'unknown'],
    ]) {
        const res = response();
        await controller.personal('192.0.2.1', {}, res, uuid, key, format);
        assert.equal(res.code, 404);
    }
    assert.equal(called, 2);
    assert.deepEqual(Reflect.getMetadata('path', SubscriptionController.prototype.personal), [
        ':shortUuid/device/:token',
        ':shortUuid/device/:token/:clientType',
    ]);
});
