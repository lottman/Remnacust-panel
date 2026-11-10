const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
    generators,
    templateService,
    host,
    mocks,
    pool,
    regex,
    load,
} = require('./subscription-delivery-fixture.cjs');
const dat = require('./geofiles-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = { ...mocks, '../generators/client-pool': pool };
const { automaticXrayDelivery } = load(path.join(root, 'automatic-xray-delivery.ts'), modules);
const { materializeGeofiles } = load(path.join(root, 'materialize-geofiles.ts'), modules);
const { compileDat } = load(path.join(root, 'compile-dat.ts'), modules);
const { xrayProfilesFit } = load(path.join(root, 'incy-config.ts'), modules);
test.after(() => regex.configuredRegex.close());
const decode = (header) => JSON.parse(Buffer.from(header.split('/onadd/')[1], 'base64'));
const id = (value) => value.toString(16).padStart(34, '0');
const template = (value) => ({
    inbounds: [],
    outbounds: [],
    routing: { rules: [] },
    remnacust: { geofiles: [{ id: id(value), categories: ['example'], target: 'DIRECT' }] },
});

function setup(counts, profiles = counts.map((_, i) => i)) {
    const files = counts.map((count) =>
        dat.bytes(
            1,
            Buffer.concat([
                dat.bytes(1, 'EXAMPLE'),
                ...Array.from({ length: count }, (_, i) => dat.bytes(2, dat.domain(0, String(i)))),
            ]),
        ),
    );
    const calls = [],
        bundles = [];
    const raw = template(0);
    const templates = templateService(
        {},
        { templateSnapshot: async () => ({ value: raw, generation: '1' }) },
    );
    templates.geofiles = {
        prepare: (config, type, delivery, _mode, limit) => {
            calls.push([config.remnacust.geofiles[0].id, delivery?.mode]);
            return materializeGeofiles(
                config,
                type,
                async (key) => ({ id: key, kind: 'geosite', sha256: 'a'.repeat(64) }),
                async (file, categories) =>
                    compileDat(files[parseInt(file.id, 16)], 'geosite', categories),
                {
                    read: async (file) => files[parseInt(file.id, 16)],
                    validateDat: async (file, categories) =>
                        compileDat(files[parseInt(file.id, 16)], 'geosite', categories, true),
                    datUrl: () => '',
                    datBundleUrl: async (_kind, ids) => {
                        bundles.push(ids);
                        return 'https://subscription.example.test/rules.dat';
                    },
                },
                delivery,
                undefined,
                limit,
            );
        },
    };
    const generator = generators(templates)[3];
    const hosts = profiles.map((file, index) => {
        const value = host(index);
        if (file) value.clientOverrides.xrayJsonTemplate = template(file);
        return value;
    });
    let renders = 0;
    const render = (client = 'happ', limit = 20000) =>
        automaticXrayDelivery({
            client,
            manualRouting: false,
            title: 'Fixture',
            profileKey: 'fixture',
            inlineRuleLimit: limit,
            generate: (delivery) => {
                renders++;
                return generator.generateConfig({
                    hosts,
                    geofileDelivery: delivery,
                    geofilesEnabled: true,
                    geofilesInlineRuleLimit: limit,
                });
            },
        });
    return {
        render,
        calls,
        bundles,
        raw,
        hosts,
        templates,
        get renders() {
            return renders;
        },
    };
}

test('actual generator keeps each 10,001-condition host inline when the subscription total exceeds 20,000', async () => {
    for (const client of ['happ', 'incy']) {
        const fixture = setup([10001], [0, 0, 0]);
        const result = await fixture.render(client);
        assert.equal(result.inline, true);
        assert.equal(fixture.renders, 1);
        assert.equal(JSON.parse(result.subscription).length, 3);
        assert(fixture.calls.every(([, mode]) => mode === 'inline'));
        assert.deepEqual(fixture.bundles, []);
        assert.equal(decode(result.header).Geositeurl, '');
        assert(xrayProfilesFit(result.subscription));
        assert.deepEqual(fixture.raw, template(0));
    }
});

test('actual generator switches only the oversized host and collects only its categories', async () => {
    for (const client of ['happ', 'incy']) {
        const fixture = setup([2000, 20001]);
        const result = await fixture.render(client);
        const configs = JSON.parse(result.subscription);
        assert.equal(result.inline, false);
        assert.equal(fixture.renders, 1);
        assert(!String(configs[0].routing.rules[0].domain).includes('geosite:'));
        assert.equal(String(configs[0].routing.rules[0].domain).split(',').length, 2000);
        assert.match(String(configs[1].routing.rules[0].domain), /^geosite:/);
        assert.deepEqual(fixture.calls, [
            [id(0), 'inline'],
            [id(1), 'inline'],
            [id(1), 'remote'],
        ]);
        assert.deepEqual(fixture.bundles, [[id(1)]]);
        assert.match(decode(result.header).Geositeurl, /rules.dat/);
        assert(xrayProfilesFit(result.subscription));
    }
});

test('actual generator accepts exactly 20,000 conditions and refreshes inline/DAT transitions per request', async () => {
    const fixture = setup([20000]);
    for (const [limit, inline] of [
        [20000, true],
        [19999, false],
        [250000, true],
    ]) {
        const result = await fixture.render('happ', limit);
        assert.equal(result.inline, inline);
        assert.equal(decode(result.header).Geositeurl === '', inline);
    }
});

test('final generated host additions count toward its own threshold', async () => {
    const fixture = setup([8]);
    fixture.hosts[0].metadata.domainRules = { mode: 'DENY', domains: ['blocked.example.test'] };
    const result = await fixture.render('happ', 8);
    const rules = JSON.parse(result.subscription)[0].routing.rules;
    assert.equal(result.inline, false);
    assert.deepEqual(rules[0].domain, ['domain:blocked.example.test']);
    assert.match(rules[1].domain[0], /^geosite:/);
});

test('unrelated errors are never retried as DAT or returned as partial subscriptions', async () => {
    const fixture = setup([2, 2]);
    fixture.hosts[1].clientOverrides.xrayJsonTemplate.routing.rules = [{ outboundTag: 'removed' }];
    await assert.rejects(fixture.render(), /xray-route-reference/);
    assert.deepEqual(fixture.bundles, []);
    assert(fixture.calls.every(([, mode]) => mode === 'inline'));
});

test('variants of the same host have independent budgets and preserve the raw templates', async () => {
    const fixture = setup([8, 9], [0]);
    const variants = [0, 1].map((value) => ({
        key: String(value),
        name: 'variant-' + value,
        template: template(value),
    }));
    const before = structuredClone(variants);
    fixture.hosts[0].clientOverrides.xrayJsonVariants = variants;
    const result = await fixture.render('happ', 8);
    const configs = JSON.parse(result.subscription);
    assert.equal(configs.length, 2);
    assert.equal(configs[0].routing.rules[0].domain.length, 8);
    assert.match(configs[1].routing.rules[0].domain[0], /^geosite:/);
    assert.deepEqual(fixture.bundles, [[id(1)]]);
    assert.deepEqual(variants, before);
});

test('final profile byte limits remain independent even below the configured condition threshold', async () => {
    const fixture = setup([2000, 2000]);
    fixture.hosts[1].clientOverrides.xrayJsonTemplate.extra = 'x'.repeat(870000);
    const result = await fixture.render('happ', 250000);
    const configs = JSON.parse(result.subscription);
    assert.equal(configs[0].routing.rules[0].domain.length, 2000);
    assert.match(configs[1].routing.rules[0].domain[0], /^geosite:/);
    assert.deepEqual(fixture.bundles, [[id(1)]]);
    assert(xrayProfilesFit(result.subscription));
});

test('an undeliverable later profile rejects the complete response without publishing a partial bundle', async () => {
    const fixture = setup([2, 2]);
    fixture.hosts[1].clientOverrides.xrayJsonTemplate.extra = 'x'.repeat(910000);
    await assert.rejects(fixture.render(), /geofile-client-config-size-limit/);
    assert.deepEqual(fixture.bundles, []);
});
