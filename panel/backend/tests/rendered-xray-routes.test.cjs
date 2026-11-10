const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { pool, mocks, regex } = require('./client-pool-fixture.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const { host } = require('./subscription-delivery-fixture.cjs');

const directory = path.join(__dirname, '../src/modules/subscription-template/generators');
const { assertRenderedXrayRoutes } = load(path.join(directory, 'rendered-xray-routes.ts'), {
    './client-pool': pool,
});
const { materializePriority } = load(path.join(directory, 'priority-failover.ts'), {
    './client-pool': pool,
});
test.after(() => regex.configuredRegex.close());

function invalid(error) {
    return error instanceof pool.ClientPoolError && error.message === 'xray-route-reference';
}

function template() {
    return {
        outbounds: ['proxy', 'pool-eu', 'pool-eu-2', 'actual-host', 'direct'].map((tag) => ({
            tag,
            protocol: 'freedom',
        })),
        routing: {
            balancers: [{ tag: 'auto', selector: ['pool-eu'], fallbackTag: 'direct' }],
            rules: [
                ...['proxy', 'pool-eu', 'pool-eu-2', 'actual-host'].map((outboundTag) => ({
                    type: 'field',
                    network: 'tcp,udp',
                    outboundTag,
                })),
                { type: 'field', network: 'tcp,udp', balancerTag: 'auto' },
            ],
        },
    };
}

test('exact actual tags allow proxy, dynamic names, numeric names and balancers without mutation', () => {
    const config = template();
    const before = structuredClone(config);
    assert.doesNotThrow(() => assertRenderedXrayRoutes(config));
    assert.deepEqual(config, before);
    assert.doesNotThrow(() => assertRenderedXrayRoutes({ outbounds: [{ protocol: 'freedom' }] }));
    const optional = template();
    optional.routing.balancers[0].fallbackTag = '';
    optional.routing.rules.at(-1).outboundTag = '';
    assert.doesNotThrow(() => assertRenderedXrayRoutes(optional));
});

for (const field of ['outboundTag', 'balancerTag']) {
    test(`dangling ${field} fails closed with a stable error and preserves the input`, () => {
        for (const value of ['removed-pool', 'pool-eu-3', 1, null, {}, []]) {
            const config = template();
            config.routing.rules = [{ type: 'field', network: 'tcp,udp', [field]: value }];
            const before = structuredClone(config);
            assert.throws(() => assertRenderedXrayRoutes(config), invalid);
            assert.deepEqual(config, before);
        }
    });
}

test('outbound and balancer namespaces remain distinct; proxy is never guessed', () => {
    for (const [field, value] of [
        ['outboundTag', 'auto'],
        ['balancerTag', 'direct'],
    ]) {
        const config = template();
        config.routing.rules = [{ type: 'field', network: 'tcp,udp', [field]: value }];
        assert.throws(() => assertRenderedXrayRoutes(config), invalid);
    }
    const config = template();
    config.outbounds = config.outbounds.filter((outbound) => outbound.tag !== 'proxy');
    assert.throws(() => assertRenderedXrayRoutes(config), invalid);
});

test('every balancer strategy rejects a missing or non-string fallback', () => {
    for (const type of ['leastPing', 'leastLoad', 'random', 'roundRobin', 'priority']) {
        for (const fallbackTag of ['removed-pool', 'auto', 1, null]) {
            const config = template();
            config.routing.balancers.push({
                tag: 'last',
                selector: ['direct'],
                strategy: { type },
                fallbackTag,
            });
            assert.throws(() => assertRenderedXrayRoutes(config), invalid);
        }
    }
});

test('malformed route tables fail closed without including input values in the error', () => {
    for (const config of [
        { routing: null },
        { routing: [] },
        { routing: { rules: {} } },
        { routing: { rules: [null] } },
        { routing: { balancers: {} } },
        { routing: { balancers: [null] } },
        { routing: {}, outbounds: {} },
        { routing: {}, outbounds: [null] },
    ])
        assert.throws(() => assertRenderedXrayRoutes(config), invalid);
});

test('priority-generated loopbacks, fallback and routing references pass after materialization', () => {
    const config = template();
    config.routing.balancers[0].strategy = { type: 'priority' };
    const rendered = materializePriority(config);
    assert(rendered.outbounds.some((outbound) => outbound.protocol === 'loopback'));
    assert.doesNotThrow(() => assertRenderedXrayRoutes(rendered));
});

test('large route tables read each tag once instead of rescanning outputs per reference', () => {
    const count = 20_000;
    let reads = 0;
    const outbounds = Array.from({ length: count }, (_, index) => ({
        get tag() {
            reads++;
            return 'host-' + index;
        },
    }));
    const rules = Array.from({ length: count }, (_, index) => ({ outboundTag: 'host-' + index }));
    assertRenderedXrayRoutes({ outbounds, routing: { rules } });
    assert.equal(reads, count);
});

function generator(config) {
    const { XrayJsonGeneratorService } = load(
        path.join(directory, 'xray-json.generator.service.ts'),
        {
            ...mocks,
            './client-pool': pool,
            '@common/utils': {
                isNonEmptyObject: (value) => !!value && Object.keys(value).length > 0,
            },
            '../host-mapper': {
                applyHostMapper: source(
                    'modules/subscription-template/host-mapper/apply-host-mapper.util.ts',
                ).applyHostMapper,
            },
        },
    );
    const service = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => config });
    service.logger = { error() {}, warn() {} };
    return service;
}

for (const naming of ['remark', 'tag', 'numeric']) {
    test(`actual generator accepts resolved ${naming} names and rejects dangling routes`, async () => {
        const recipient = host(0);
        const candidates = [host(1, 'actual-host'), host(2, 'second-host')];
        for (const candidate of candidates) {
            candidate.metadata.isHidden = true;
            candidate.metadata.tags = ['EU'];
        }
        const entry = {
            mode: 'all',
            selectFrom: 'ALL',
            selector: { type: 'tags', values: ['EU'] },
            ...(naming === 'remark'
                ? { useHostRemarkAsTag: true }
                : naming === 'tag'
                  ? { useHostTagAsTag: true }
                  : { tagPrefix: 'pool-eu' }),
        };
        const target = naming === 'remark' ? 'actual-host' : naming === 'tag' ? 'EU' : 'pool-eu-2';
        const config = {
            outbounds: [{ tag: 'direct', protocol: 'freedom' }],
            remnawave: { injectHosts: [entry] },
            routing: { rules: [{ type: 'field', network: 'tcp,udp', outboundTag: target }] },
        };
        const params = { hosts: [recipient, ...candidates], isExtendedClient: false };
        const before = structuredClone(config);
        const rendered = JSON.parse(await generator(config).generateConfig(params))[0];
        assert(rendered.outbounds.some((outbound) => outbound.tag === target));
        assert.deepEqual(config, before);
        config.routing.rules[0].outboundTag = 'removed-pool';
        await assert.rejects(generator(config).generateConfig(params), invalid);
    });
}

test('actual generator retains the implicit proxy but rejects native balancer dangling fallback', async () => {
    const config = {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        routing: { rules: [{ type: 'field', network: 'tcp,udp', outboundTag: 'proxy' }] },
    };
    const params = { hosts: [host()], isExtendedClient: false };
    const rendered = JSON.parse(await generator(config).generateConfig(params))[0];
    assert(rendered.outbounds.some((outbound) => outbound.tag === 'proxy'));
    config.routing = {
        balancers: [
            {
                tag: 'auto',
                selector: ['direct'],
                strategy: { type: 'leastPing' },
                fallbackTag: 'removed-pool',
            },
        ],
        rules: [{ type: 'field', network: 'tcp,udp', balancerTag: 'auto' }],
    };
    await assert.rejects(generator(config).generateConfig(params), invalid);
});

test('actual generator omits a complete invalid profile while retaining valid profiles and reporting their identities', async () => {
    const config = {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        routing: { rules: [{ type: 'field', network: 'tcp,udp', outboundTag: 'proxy' }] },
    };
    const hosts = [host(0), host(1), host(2)];
    hosts[1].clientOverrides.xrayJsonTemplate = {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        routing: { rules: [{ type: 'field', network: 'tcp,udp', outboundTag: 'removed-pool' }] },
    };
    const before = structuredClone(hosts);
    let report;
    const result = JSON.parse(await generator(config).generateConfig({ hosts, isExtendedClient: false,
        onProfileReport: value => { report = value; } }));
    assert.equal(result.length, 2);
    assert.deepEqual(result.map(value => value.remarks), [hosts[0].finalRemark, hosts[2].finalRemark]);
    assert.deepEqual(report, { renderedHostUuids: [hosts[0].metadata.uuid, hosts[2].metadata.uuid],
        invalidHostUuids: [hosts[1].metadata.uuid] });
    for (const rendered of result) assertRenderedXrayRoutes(rendered);
    assert.deepEqual(hosts, before);
});

test('invalid and valid variants remain independent and repeated route warnings are throttled without exposing configuration', async () => {
    const good = { outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        routing: { rules: [{ network: 'tcp,udp', outboundTag: 'proxy' }] } };
    const bad = { ...good, routing: { rules: [{ network: 'tcp,udp', outboundTag: 'missing-secret-value' }] } };
    const recipient = host(0);
    recipient.clientOverrides.xrayJsonVariants = [
        { key: 'bad', name: 'bad', template: bad },
        { key: 'good', name: 'good', template: good },
    ];
    const service = generator(good), warnings = [];
    service.logger = { error() {}, warn: value => warnings.push(value) };
    for (let attempt = 0; attempt < 3; attempt++) {
        let report;
        const result = JSON.parse(await service.generateConfig({ hosts: [recipient], isExtendedClient: false,
            onProfileReport: value => { report = value; } }));
        assert.equal(result.length, 1);
        assert.match(result[0].remarks, /good$/);
        assert.deepEqual(report, { renderedHostUuids: [recipient.metadata.uuid], invalidHostUuids: [recipient.metadata.uuid] });
    }
    assert.equal(warnings.length, 1);
    assert(!warnings[0].includes('missing-secret-value'));
    assert(!warnings[0].includes('protocolOptions'));
});

test('profile reports never count notice placeholders or disabled records as usable hosts', async () => {
    const config = { outbounds: [{ tag: 'direct', protocol: 'freedom' }] };
    const notice = host(0), disabled = host(1);
    notice.metadata.uuid = '00000000-0000-0000-0000-000000000000';
    disabled.metadata.isDisabled = true;
    let report;
    const result = JSON.parse(await generator(config).generateConfig({
        hosts: [notice, disabled], isExtendedClient: false, onProfileReport: value => { report = value; }
    }));
    assert.equal(result.length, 2);
    assert.deepEqual(report, { renderedHostUuids: [], invalidHostUuids: [] });
    const broken = host(2);
    broken.clientOverrides.xrayJsonTemplate = { ...config, routing: { rules: [{ outboundTag: 'missing' }] } };
    await assert.rejects(generator(config).generateConfig({ hosts: [notice, broken], isExtendedClient: false }), invalid);
});

test('shared generator fixture loads the real route guard and preserves ClientPoolError identity', async () => {
    const { XrayJsonGeneratorService } = source(
        'modules/subscription-template/generators/xray-json.generator.service.ts',
        {
            '../host-mapper': { applyHostMapper: (value) => value },
            '@common/utils': {
                isNonEmptyObject: (value) => !!value && Object.keys(value).length > 0,
            },
        },
    );
    const service = new XrayJsonGeneratorService({
        getCachedTemplateByType: async () => ({
            outbounds: [{ tag: 'direct', protocol: 'freedom' }],
            routing: {
                rules: [{ type: 'field', network: 'tcp,udp', outboundTag: 'removed-pool' }],
            },
        }),
    });
    service.logger = { error() {}, warn() {} };
    await assert.rejects(
        service.generateConfig({ hosts: [host()], isExtendedClient: false }),
        invalid,
    );
});
