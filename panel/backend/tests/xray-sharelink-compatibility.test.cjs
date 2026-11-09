const assert = require('node:assert/strict');
const test = require('node:test');
const { source } = require('./upstream-filter-fixture.cjs');

const { XrayGeneratorService } = source(
    'modules/subscription-template/generators/xray.generator.service.ts',
);

function host(changes = {}) {
    return {
        protocol: 'vless',
        protocolOptions: { id: '00000000-0000-4000-8000-000000000001', encryption: 'none' },
        transport: 'tcp',
        transportOptions: {},
        security: 'none',
        securityOptions: {},
        address: 'node.example.test',
        port: 443,
        finalRemark: 'Working server',
        metadata: { excludeFromSubscriptionTypes: [] },
        streamOverrides: { sockopt: null, finalMask: null },
        clientOverrides: { mapper: { xrayBase64: null }, serverDescription: null },
        ...changes,
    };
}

test('share-link output omits unsupported transports without replacing or removing supported servers', () => {
    const generator = new XrayGeneratorService();
    const working = host();
    const expected = generator.generateLinks([working], false);
    for (const transport of ['xdrive', 'masque', 'future-unknown-transport']) {
        assert.deepEqual(generator.generateLinks([host({ transport }), working], false), expected);
        assert.deepEqual(generator.generateLinks([host({ transport })], false), []);
    }
});

test('unknown protocols and incompatible Hysteria transports do not become fake VLESS links', async () => {
    const generator = new XrayGeneratorService();
    const unsupported = [
        host({ protocol: 'future-unknown-protocol' }),
        host({ protocol: 'hysteria', transport: 'tcp' }),
        host({ transport: 'hysteria' }),
    ];
    const rendered = await generator.generateConfig([...unsupported, host()], true, false);
    assert.equal(
        Buffer.from(rendered, 'base64').toString(),
        generator.generateLinks([host()], false)[0],
    );
});

test('explicit Base64 exclusions stay excluded and supported Hysteria remains available', () => {
    const generator = new XrayGeneratorService();
    const excluded = host({ metadata: { excludeFromSubscriptionTypes: ['XRAY_BASE64'] } });
    const hysteria = host({
        protocol: 'hysteria',
        transport: 'hysteria',
        transportOptions: { auth: 'fixture-auth' },
    });
    const links = generator.generateLinks([excluded, hysteria], false);
    assert.equal(links.length, 1);
    assert.equal(new URL(links[0]).protocol, 'hysteria2:');
});
