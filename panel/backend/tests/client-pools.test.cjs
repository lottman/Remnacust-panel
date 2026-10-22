const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { load: yaml } = require('js-yaml');
const load = require('./load-typescript.cjs');
const { pool, mocks } = require('./client-pool-fixture.cjs');
test.after(() => require('./client-pool-fixture.cjs').regex.configuredRegex.close());
const folder = path.join(__dirname, '../src/modules/subscription-template/generators');
function host(index, tags, hidden = false, remark = 'node-' + index) {
    return {
        protocol: 'shadowsocks',
        protocolOptions: { password: 'synthetic-password', method: 'aes-128-gcm' },
        address: 'node.example.test',
        port: 443,
        transport: 'tcp',
        transportOptions: {},
        security: 'none',
        finalRemark: remark,
        streamOverrides: { finalMask: null, sockopt: null },
        mux: null,
        clientOverrides: { mapper: { mihomo: null, singbox: null } },
        metadata: {
            uuid: '10000000-0000-4000-8000-' + String(index).padStart(12, '0'),
            tags,
            isHidden: hidden,
            excludeFromSubscriptionTypes: [],
        },
    };
}
const hosts = [host(1, ['NL']), host(2, ['DE']), host(3, ['NL'], true)];
const schemas = [
    ['mihomo', 'MihomoGeneratorService'],
    ['clash', 'ClashGeneratorService'],
    ['singbox', 'SingBoxGeneratorService'],
];
function generator(file, name, template) {
    const exports = load(path.join(folder, file + '.generator.service.ts'), {
        ...mocks,
        './client-pool': pool,
        '@common/utils': {
            isNonEmptyObject: (value) => !!value && Object.keys(value).length > 0,
            parseIntRangeUtil: (value) => [Number(value)],
        },
        '@libs/contracts/constants': { FINGERPRINTS: [] },
        '../host-mapper': { applyHostMapper: (value) => value },
    });
    return new exports[name]({ getCachedTemplateByType: async () => structuredClone(template) });
}
function template(sing, selection) {
    const group = {
        ...(sing
            ? { tag: 'auto', type: 'urltest', outbounds: [] }
            : { name: 'auto', type: 'url-test', proxies: [] }),
        url: 'https://example.test/204',
        interval: sing ? '5m' : 300,
        remnawave: { pool: selection },
    };
    return sing
        ? { outbounds: [group, { type: 'direct', tag: 'direct' }], route: { final: 'auto' } }
        : { 'proxy-groups': [group], rules: ['MATCH,auto'] };
}

for (const [file, className] of schemas) {
    test(`${file}: real generator selects authorized hidden members and strips directives`, async () => {
        const sing = file === 'singbox';
        const source = template(sing, {
            mode: 'all',
            selectFrom: 'HIDDEN',
            selector: { type: 'tags', values: ['NL'] },
        });
        const output = await generator(file, className, source).generateConfig(hosts);
        const config = sing ? JSON.parse(output) : yaml(output);
        const group = sing
            ? config.outbounds.find((item) => item.tag === 'auto')
            : config['proxy-groups'][0];
        assert.deepEqual(group[sing ? 'outbounds' : 'proxies'], ['node-3']);
        assert.equal(group.remnawave, undefined);
        assert.equal(config.remnawave, undefined);
        assert.deepEqual(
            source,
            template(sing, {
                mode: 'all',
                selectFrom: 'HIDDEN',
                selector: { type: 'tags', values: ['NL'] },
            }),
        );
    });
    test(`${file}: an empty configured pool fails closed rather than yielding DIRECT or an empty success`, async () => {
        const source = template(file === 'singbox', {
            mode: 'all',
            selectFrom: 'ALL',
            selector: { type: 'tags', values: ['UNAVAILABLE'] },
        });
        await assert.rejects(
            () => generator(file, className, source).generateConfig(hosts),
            /No eligible hosts/,
        );
    });
    test(`${file}: duplicate host labels and group labels receive distinct stable identifiers`, async () => {
        const source = template(file === 'singbox', {
            mode: 'all',
            selectFrom: 'ALL',
            selector: { type: 'tags', values: ['NL'] },
        });
        const output = await generator(file, className, source).generateConfig([
            host(1, ['NL'], false, 'auto'),
            host(3, ['NL'], true, 'auto'),
        ]);
        const config = file === 'singbox' ? JSON.parse(output) : yaml(output);
        const group = file === 'singbox' ? config.outbounds[0] : config['proxy-groups'][0];
        const values = group[file === 'singbox' ? 'outbounds' : 'proxies'];
        assert.equal(values.length, 2);
        assert.equal(new Set(values).size, 2);
        assert.ok(values.every((value) => value !== 'auto'));
    });
}

test('selection handles UUID order, random subset, groups and regex after eligibility filtering', async () => {
    const candidates = hosts.map((host) => ({ host, name: host.finalRemark }));
    const selected = await pool.clientPoolMembers(
        {
            mode: 'all',
            selectFrom: 'ALL',
            selector: {
                type: 'uuids',
                values: [
                    hosts[2].metadata.uuid,
                    hosts[0].metadata.uuid,
                    '10000000-0000-4000-8000-000000000999',
                ],
            },
        },
        candidates,
        Date.now() + 1000,
    );
    assert.deepEqual(selected, ['node-3', 'node-1']);
    const random = await pool.clientPoolMembers(
        {
            mode: 'random',
            selectFrom: 'NOT_HIDDEN',
            selector: { type: 'tags', values: ['NL', 'DE'], expected: 1 },
        },
        candidates,
        Date.now() + 1000,
    );
    assert.equal(random.length, 1);
    assert.ok(['node-1', 'node-2'].includes(random[0]));
    const group = await pool.clientPoolMembers(
        {
            mode: 'group',
            selectFrom: 'NOT_HIDDEN',
            selector: { type: 'tags', groups: { a: ['NL'], b: ['DE'] } },
        },
        candidates,
        Date.now() + 1000,
    );
    assert.equal(group.length, 1);
    assert.ok(['node-1', 'node-2'].includes(group[0]));
    const regex = await pool.clientPoolMembers(
        { mode: 'all', selectFrom: 'ALL', selector: { type: 'remarkRegex', pattern: '^node-3$' } },
        candidates,
        Date.now() + 1000,
    );
    assert.deepEqual(regex, ['node-3']);
    assert.throws(
        () => pool.clientPool({ selector: { type: 'sameTagAsRecipient' } }),
        /no recipient/,
    );
});
