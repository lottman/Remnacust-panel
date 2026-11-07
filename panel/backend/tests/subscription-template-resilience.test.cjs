const test = require('node:test');
const assert = require('node:assert/strict');
const {
    templateService,
    subscriptionService,
    httpController,
    regex,
    generators,
} = require('./subscription-delivery-fixture.cjs');
test.after(() => regex.configuredRegex.close());

for (const type of ['SINGBOX', 'MIHOMO', 'STASH', 'CLASH', 'XRAY_JSON']) {
    for (const failure of ['get', 'set', 'both']) {
        test(`${type}: cache ${failure} failure preserves repository template and HTTP success`, async () => {
            let reads = 0;
            const expected =
                type === 'SINGBOX'
                    ? { outbounds: [{ type: 'direct', tag: 'direct' }] }
                    : type === 'XRAY_JSON'
                      ? { outbounds: [] }
                      : { 'proxy-groups': [] };
            const templates = templateService(
                {
                    getTemplateByNameAndTypeOrGetDefault: async () => {
                        reads++;
                        return {
                            templateType: type,
                            templateJson: expected,
                            templateYaml: 'proxy-groups: []\n',
                        };
                    },
                },
                {
                    templateSnapshot: async () => {
                        if (failure !== 'set') throw new Error('fixture cache read');
                        return { generation: 'a'.repeat(32), value: null };
                    },
                    setTemplateSnapshot: async () => {
                        if (failure !== 'get') throw new Error('fixture cache write');
                    },
                },
            );
            const { service, settings } = subscriptionService(templates);
            const { app, base } = await httpController(service, settings);
            try {
                const response = await fetch(`${base}/api/sub/fixture123/${type}`);
                assert.equal(response.status, 200);
                const body = await response.text();
                assert.match(body, /fixture-password/);
                assert.equal(reads, 1);
                assert.equal(response.headers.get('cache-control'), 'private, no-store');
            } finally {
                await app.close();
            }
        });
    }
}

test('cache hits keep the normal fast path; repository failures and missing templates reject', async () => {
    const cached = { outbounds: [{ type: 'direct', tag: 'cached' }] };
    const hit = templateService(
        {
            getTemplateByNameAndTypeOrGetDefault: async () =>
                assert.fail('unexpected database access'),
        },
        { templateSnapshot: async () => ({ generation: 'a'.repeat(32), value: cached }) },
    );
    assert.equal(await hit.getCachedTemplateByType('SINGBOX'), cached);
    for (const repository of [
        async () => null,
        async () => {
            throw new Error('fixture database');
        },
    ]) {
        const templates = templateService(
            { getTemplateByNameAndTypeOrGetDefault: repository },
            {
                templateSnapshot: async () => {
                    throw new Error('fixture cache');
                },
                setTemplateSnapshot: async () =>
                    assert.fail('failed repository result must not be cached'),
            },
        );
        await assert.rejects(
            templates.getCachedTemplateByType('SINGBOX'),
            /Template not found|fixture database/,
        );
    }
});

test('repository errors become existing HTTP 503 responses for every template generator', async () => {
    const templates = templateService(
        {
            getTemplateByNameAndTypeOrGetDefault: async () => {
                throw new Error('fixture database unavailable');
            },
        },
        {
            templateSnapshot: async () => ({ generation: 'a'.repeat(32), value: null }),
            setTemplateSnapshot: async () => true,
        },
    );
    const { service, settings } = subscriptionService(templates);
    const { app, base } = await httpController(service, settings);
    try {
        for (const type of ['SINGBOX', 'MIHOMO', 'STASH', 'CLASH', 'XRAY_JSON']) {
            const response = await fetch(`${base}/api/sub/fixture123/${type}`);
            assert.equal(response.status, 503, type);
            assert.equal(response.headers.get('retry-after'), '30');
            assert.match(response.headers.get('cache-control'), /no-store/);
            const body = await response.text();
            assert.notEqual(body, '');
            assert.doesNotMatch(body, /fixture database/);
        }
    } finally {
        await app.close();
    }
});

test('native serialization failures reject rather than returning empty strings', async () => {
    const circular = {};
    circular.self = circular;
    const [sing, mihomo, clash] = generators({
        getCachedTemplateByType: async (type) =>
            type === 'SINGBOX' ? { outbounds: [], circular } : { padding: 1n },
    });
    await assert.rejects(sing.generateConfig([]), /circular/i);
    await assert.rejects(mihomo.generateConfig([]));
    await assert.rejects(clash.generateConfig([]));
});

test('raw template cold burst is singleflight per shared generation, while every delivery stays independent', async () => {
    let generation = 'a'.repeat(32),
        cached = null,
        reads = 0,
        prepared = 0,
        fills = 0;
    const service = templateService(
        {
            getTemplateByNameAndTypeOrGetDefault: async () => {
                reads++;
                await new Promise((r) => setTimeout(r, 10));
                return {
                    templateType: 'SINGBOX',
                    templateJson: { remnacust: {}, marker: generation },
                };
            },
        },
        {
            templateSnapshot: async () => ({ generation, value: cached }),
            setTemplateSnapshot: async (key, expected, value) => {
                fills++;
                if (generation !== expected) return false;
                cached = value;
                return true;
            },
        },
    );
    service.prepareClientTemplate = async (raw, type, delivery) => {
        prepared++;
        return { raw, delivery };
    };
    const deliveries = Array.from({ length: 100 }, () => ({}));
    const cold = await Promise.all(
        deliveries.map((delivery) => service.getCachedTemplateByType('SINGBOX', 'Saved', delivery)),
    );
    assert.equal(reads, 1);
    assert.equal(fills, 1);
    assert.equal(prepared, 100);
    cold.forEach((result, index) => assert.equal(result.delivery, deliveries[index]));
    await Promise.all(
        deliveries.map((delivery) => service.getCachedTemplateByType('SINGBOX', 'Saved', delivery)),
    );
    assert.equal(reads, 1);
    assert.equal(prepared, 200);
    generation = 'b'.repeat(32);
    cached = null;
    await Promise.all(
        deliveries.map((delivery) => service.getCachedTemplateByType('SINGBOX', 'Saved', delivery)),
    );
    assert.equal(reads, 2);
    assert.equal(prepared, 300);
    assert.equal(service.templateLoads.size, 0);
});

test('raw flight failures retry, Redis-down bypasses coalescing, and changed generation never joins an old flight', async () => {
    let generation = 'a'.repeat(32),
        fail = true,
        down = false,
        reads = 0;
    const service = templateService(
        {
            getTemplateByNameAndTypeOrGetDefault: async () => {
                reads++;
                await new Promise((r) => setTimeout(r, 10));
                if (fail) throw Error('fixture database');
                return { templateType: 'SINGBOX', templateJson: { marker: 'fresh' } };
            },
        },
        {
            templateSnapshot: async () => {
                if (down) throw Error('redis');
                return { generation, value: null };
            },
            setTemplateSnapshot: async () => true,
        },
    );
    const failures = await Promise.allSettled(
        Array.from({ length: 100 }, () => service.getCachedTemplateByType('SINGBOX')),
    );
    assert(failures.every((result) => result.status === 'rejected'));
    assert.equal(reads, 1);
    assert.equal(service.templateLoads.size, 0);
    fail = false;
    await service.getCachedTemplateByType('SINGBOX');
    assert.equal(reads, 2);
    down = true;
    await Promise.all(Array.from({ length: 5 }, () => service.getCachedTemplateByType('SINGBOX')));
    assert.equal(reads, 7);
    down = false;
    const old = service.getCachedTemplateByType('SINGBOX');
    await new Promise((r) => setImmediate(r));
    generation = 'b'.repeat(32);
    const fresh = service.getCachedTemplateByType('SINGBOX');
    await Promise.all([old, fresh]);
    assert.equal(reads, 9);
    assert.equal(service.templateLoads.size, 0);
});
