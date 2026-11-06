const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
    generators,
    subscriptionService,
    httpController,
    host,
    pool,
    mocks,
    regex,
    generatorRoot,
    load,
} = require('./subscription-delivery-fixture.cjs');
const { MAX_SUBSCRIPTION_BYTES, boundedSubscriptionOutput, SubscriptionExpansionBudget } = load(
    path.join(generatorRoot, 'subscription-output.ts'),
    { './client-pool': pool },
);
const { validateClientTemplate } = load(
    path.join(generatorRoot, 'validate-client-template.ts'),
    mocks,
);
test.after(() => regex.configuredRegex.close());

test('shared output budget accepts exactly 16 MiB and rejects one more UTF-8 byte', () => {
    assert.equal(MAX_SUBSCRIPTION_BYTES, 16 * 1024 * 1024);
    const exact = '界' + 'x'.repeat(MAX_SUBSCRIPTION_BYTES - 3);
    assert.equal(boundedSubscriptionOutput(exact), exact);
    assert.throws(() => boundedSubscriptionOutput(exact + 'x'), /subscription-size-limit/);
});

for (const type of ['SINGBOX', 'MIHOMO', 'STASH']) {
    test(`${type}: actual serializer enforces the inclusive UTF-8 byte boundary`, async () => {
        const chunk = '界' + 'x'.repeat(1000);
        const template =
            type === 'SINGBOX'
                ? { outbounds: [], padding: [chunk] }
                : { padding: [chunk], 'proxy-groups': [] };
        const [sing, mihomo] = generators({ getCachedTemplateByType: async () => template });
        const generate = () =>
            type === 'SINGBOX'
                ? sing.generateConfig([])
                : mihomo.generateConfig([], type === 'STASH');
        const one = Buffer.byteLength(await generate());
        template.padding.push(chunk);
        const perEntry = Buffer.byteLength(await generate()) - one;
        const count = Math.floor((MAX_SUBSCRIPTION_BYTES - one - 4096) / perEntry) + 1;
        template.padding = [...Array(count).fill(chunk), 'x'];
        const base = Buffer.byteLength(await generate());
        template.padding[count] += 'x'.repeat(MAX_SUBSCRIPTION_BYTES - base);
        const output = await generate();
        assert.equal(Buffer.byteLength(output), MAX_SUBSCRIPTION_BYTES);
        template.padding[count] += 'x';
        await assert.rejects(
            generate(),
            (error) =>
                error instanceof pool.ClientPoolError &&
                error.message === 'subscription-size-limit',
        );
    });
}

test('accepted group expansion is rejected through HTTP 503 before oversized content is sent', async () => {
    const hosts = Array.from({ length: 100 }, (_, index) =>
        host(index, `node-${index}-` + 'x'.repeat(190)),
    );
    let selected;
    const singTemplate = {
        outbounds: Array.from({ length: 1000 }, (_, index) => ({
            tag: 'group-' + index,
            type: 'selector',
            outbounds: [],
        })),
    };
    const yamlTemplate = {
        'proxy-groups': Array.from({ length: 1000 }, (_, index) => ({
            name: 'group-' + index,
            type: 'select',
            proxies: [],
        })),
    };
    validateClientTemplate(singTemplate, 'SINGBOX');
    validateClientTemplate(yamlTemplate, 'MIHOMO');
    assert(Buffer.byteLength(JSON.stringify(singTemplate)) < 64 * 1024);
    assert(Buffer.byteLength(JSON.stringify(yamlTemplate)) < 64 * 1024);
    const { service, settings } = subscriptionService(
        {
            getCachedTemplateByType: async (type) => {
                selected = type;
                return type === 'SINGBOX' ? singTemplate : yamlTemplate;
            },
        },
        hosts,
    );
    const { app, base } = await httpController(service, settings);
    try {
        for (const type of ['SINGBOX', 'MIHOMO', 'STASH']) {
            const response = await fetch(`${base}/api/sub/fixture123/${type}`);
            assert.equal(response.status, 503, type);
            assert.equal(selected, type);
            assert.equal(response.headers.get('retry-after'), '30');
            assert.match(response.headers.get('cache-control'), /no-store/);
            assert((await response.text()).length < 1000);
        }
    } finally {
        await app.close();
    }
});

for (const type of ['SINGBOX', 'MIHOMO', 'STASH', 'CLASH']) {
    test(`${type}: large fanout stops during append before final serialization or later groups`, async () => {
        const hosts = Array.from({ length: 1000 }, (_, index) =>
            host(index, `node-${index}-` + 'x'.repeat(190)),
        );
        const singbox = type === 'SINGBOX';
        let expanded = 0;
        let serialized = 0;
        const groups = Array.from({ length: 1000 }, (_, index) => ({
            [singbox ? 'tag' : 'name']: 'group-' + index,
            type: singbox ? 'selector' : 'select',
            get [singbox ? 'outbounds' : 'proxies']() {
                expanded++;
                if (index === 999) throw new Error('later group was expanded');
                return [];
            },
        }));
        const template = {
            [singbox ? 'outbounds' : 'proxy-groups']: groups,
            sentinel: {
                get value() {
                    serialized++;
                    throw new Error('final serializer ran');
                },
            },
        };
        const [sing, mihomo, clash] = generators({ getCachedTemplateByType: async () => template });
        const generate = () =>
            singbox
                ? sing.generateConfig(hosts)
                : type === 'CLASH'
                  ? clash.generateConfig(hosts)
                  : mihomo.generateConfig(hosts, type === 'STASH');
        await assert.rejects(
            generate(),
            (error) =>
                error instanceof pool.ClientPoolError &&
                error.message === 'subscription-size-limit',
        );
        assert(expanded > 1 && expanded < 100, `expanded ${expanded} groups`);
        assert.equal(serialized, 0);
    });
}

test('expansion deduplicates before charging and preserves member order across repeated calls', async () => {
    const budget = new SubscriptionExpansionBudget('json');
    const name = '界'.repeat(100);
    const repeated = Array(100000).fill(name);
    for (let index = 0; index < 2; index++) {
        const result = await pool.renderClientGroups(
            [{ tag: 'group-' + index, outbounds: ['first', name] }],
            [],
            () => repeated,
            true,
            budget,
        );
        assert.deepEqual(result[0].outbounds, ['first', name]);
    }
});
