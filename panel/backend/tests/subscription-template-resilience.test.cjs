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
                    get: async () => {
                        if (failure !== 'set') throw new Error('fixture cache read');
                        return null;
                    },
                    set: async () => {
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
        { get: async () => cached },
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
                get: async () => {
                    throw new Error('fixture cache');
                },
                set: async () => assert.fail('failed repository result must not be cached'),
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
        { get: async () => null },
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
