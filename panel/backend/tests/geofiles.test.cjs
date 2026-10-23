const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { deflateSync } = require('node:zlib');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const fixtures = require('./geofiles-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = { ...mocks, '../generators/client-pool': pool };
const { validateGeofile } = load(path.join(root, 'validate-geofile.ts'), modules);
const { compileDat, datCategories } = load(path.join(root, 'compile-dat.ts'), modules);
const { materializeGeofiles } = load(path.join(root, 'materialize-geofiles.ts'), modules);
const { isPublicGeofileAddress, geofileUrl } = load(
    path.join(root, 'download-geofile.ts'),
    modules,
);

test('binary DAT validates by content and extracts categories and attribute-filtered rules', () => {
    validateGeofile(fixtures.geoip, 'geoip');
    validateGeofile(fixtures.geosite, 'geosite');
    assert.deepEqual(datCategories(fixtures.geosite), ['example']);
    assert.deepEqual(compileDat(fixtures.geoip, 'geoip', ['ru']).ips, ['203.0.113.0/24']);
    assert.deepEqual(compileDat(fixtures.geosite, 'geosite', ['example@ads']).domains, [
        { type: 3, value: 'ads.example.com' },
    ]);
    assert.throws(() => compileDat(fixtures.geosite, 'geosite', ['missing']), /empty/);
    for (const input of [
        Buffer.from('<html>error</html>'),
        Buffer.from('PK\x03\x04archive'),
        fixtures.geosite.subarray(0, -1),
        Buffer.from([10, 255]),
    ])
        assert.throws(() => validateGeofile(input, 'geoip'));
    assert.throws(() => validateGeofile(fixtures.geoip, 'geosite'));
    assert.throws(() => validateGeofile(fixtures.geosite, 'geoip'));
});

test('text rules and SRS containers enforce format, nesting, compression and size boundaries', () => {
    validateGeofile(Buffer.from('payload:\n  - example.com\n'), 'mihomo-domain');
    validateGeofile(
        Buffer.from('{"version":3,"rules":[{"domain_suffix":["example.com"]}]}'),
        'singbox-json',
    );
    validateGeofile(
        Buffer.concat([Buffer.from('SRS\x03'), deflateSync(Buffer.from([1, 0, 255, 0]))]),
        'singbox-srs',
    );
    for (const input of ['<script>alert(1)</script>', 'payload:\n - 15', 'payload: &a [*a]'])
        assert.throws(() => validateGeofile(Buffer.from(input), 'mihomo-domain'));
    assert.throws(() =>
        validateGeofile(Buffer.from('{"version":3,"rules":[{"__proto__":{}}]}'), 'singbox-json'),
    );
    assert.throws(
        () => validateGeofile(Buffer.alloc(8 * 1024 * 1024 + 1), 'singbox-json'),
        /text-size/,
    );
    assert.throws(() =>
        validateGeofile(
            Buffer.concat([
                Buffer.from('SRS\x03'),
                deflateSync(Buffer.alloc(64 * 1024 * 1024 + 1)),
            ]),
            'singbox-srs',
        ),
    );
});

test('URL import rejects private, mapped, nonstandard and reserved addresses before connecting', () => {
    for (const value of [
        '127.0.0.1',
        '10.0.0.1',
        '100.100.100.200',
        '169.254.169.254',
        '172.16.1.1',
        '192.168.1.1',
        '198.18.0.1',
        '203.0.113.10',
        '224.0.0.1',
        '::1',
        '::ffff:127.0.0.1',
        'fc00::1',
        'fe80::1',
        '2001:db8::1',
        '2002:7f00:1::',
    ])
        assert.equal(isPublicGeofileAddress(value), false, value);
    assert.equal(isPublicGeofileAddress('8.8.8.8'), true);
    assert.equal(isPublicGeofileAddress('2606:4700:4700::1111'), true);
    for (const url of [
        'file:///etc/passwd',
        'http://example.com/a',
        'https://user:pass@example.com/a',
        'https://example.com:8443/a',
        'https://2130706433/a',
        'https://0x7f000001/a',
        'https://[::ffff:127.0.0.1]/a',
    ])
        assert.throws(() => geofileUrl(url), url);
    assert.equal(geofileUrl('https://example.com/a.dat').hostname, 'example.com');
});

test('HTTP import pins validated DNS, sends no credentials and rechecks redirects before connecting', async () => {
    let lookups = 0,
        connections = 0;
    const calls = [];
    const transport = (status, headers, data) => ({
        request: (url, options, callback) => {
            connections++;
            calls.push({ url, options });
            const req = new EventEmitter();
            req.end = () =>
                setImmediate(() => {
                    const response = Readable.from([data]);
                    response.statusCode = status;
                    response.headers = headers;
                    callback(response);
                });
            req.destroy = (error) => req.emit('error', error);
            return req;
        },
    });
    const resolve = {
        lookup: async () => {
            lookups++;
            return [{ address: '8.8.8.8', family: 4 }];
        },
    };
    const successful = load(path.join(root, 'download-geofile.ts'), {
        'node:dns/promises': resolve,
        'node:https': transport(
            200,
            { 'content-length': String(fixtures.geoip.length) },
            fixtures.geoip,
        ),
    });
    assert.deepEqual(
        await successful.downloadGeofile('https://example.test/file.dat'),
        fixtures.geoip,
    );
    assert.equal(lookups, 1);
    assert.equal(connections, 1);
    assert.equal(calls[0].options.agent, false);
    calls[0].options.lookup('example.test', {}, (error, address, family) => {
        assert.equal(error, null);
        assert.equal(address, '8.8.8.8');
        assert.equal(family, 4);
    });
    assert.equal(calls[0].options.headers.Authorization, undefined);
    assert.equal(calls[0].options.headers.Cookie, undefined);
    const redirect = load(path.join(root, 'download-geofile.ts'), {
        'node:dns/promises': resolve,
        'node:https': transport(
            302,
            { location: 'https://169.254.169.254/latest/meta-data/' },
            Buffer.alloc(0),
        ),
    });
    const previous = connections;
    await assert.rejects(() => redirect.downloadGeofile('https://example.test/file.dat'));
    assert.equal(connections, previous + 1, 'Redirect to metadata never opens a second connection');
    const mixed = load(path.join(root, 'download-geofile.ts'), {
        'node:dns/promises': {
            lookup: async () => [
                { address: '8.8.8.8', family: 4 },
                { address: '10.0.0.1', family: 4 },
            ],
        },
        'node:https': {
            request: () => {
                throw new Error('must not connect');
            },
        },
    });
    await assert.rejects(
        () => mixed.downloadGeofile('https://mixed.example.test/file.dat'),
        /private-address/,
    );
});

test('datasets become native rules, preserve restrictions and do not leak server directives', async () => {
    const file = {
        id: '00' + 'a'.repeat(32),
        kind: 'geosite',
        url: 'https://sub.example.test/geofiles/file',
    };
    const base = {
        remnacust: { geofiles: [{ id: file.id, categories: ['example'], target: 'DIRECT' }] },
        outbounds: [],
        routing: {
            rules: [
                { type: 'field', domain: ['full:blocked.test'], outboundTag: 'block' },
                { type: 'field', network: 'tcp,udp', outboundTag: 'proxy' },
            ],
        },
    };
    const result = await materializeGeofiles(
        base,
        'XRAY_JSON',
        async () => file,
        async () => compileDat(fixtures.geosite, 'geosite', ['example']),
    );
    assert.equal(result.remnacust, undefined);
    assert.equal(base.outbounds.length, 0);
    assert.deepEqual(result.routing.rules[0], base.routing.rules[0]);
    assert.deepEqual(result.routing.rules.at(-1), base.routing.rules.at(-1));
    assert.deepEqual(result.routing.rules[1].domain, [
        'domain:example.com',
        'full:ads.example.com',
    ]);
    assert.equal(result.outbounds[0].protocol, 'freedom');
    const sing = await materializeGeofiles(
        { remnacust: base.remnacust },
        'SINGBOX',
        async () => file,
        async () => compileDat(fixtures.geosite, 'geosite', ['example']),
    );
    assert.equal(sing.route.rules[0].action, 'route');
    assert.equal(sing.outbounds[0].type, 'direct');
    const yaml = await materializeGeofiles(
        { remnacust: base.remnacust, rules: ['DOMAIN,keep.test,REJECT', 'MATCH,DIRECT'] },
        'MIHOMO',
        async () => file,
        async () => compileDat(fixtures.geosite, 'geosite', ['example']),
    );
    assert.deepEqual(yaml.rules, [
        'DOMAIN,keep.test,REJECT',
        'DOMAIN-SUFFIX,example.com,DIRECT',
        'DOMAIN,ads.example.com,DIRECT',
        'MATCH,DIRECT',
    ]);
    const srs = { ...file, kind: 'singbox-srs' };
    const remote = await materializeGeofiles(
        { remnacust: base.remnacust },
        'SINGBOX',
        async () => srs,
        async () => {
            throw Error('not DAT');
        },
    );
    assert.equal(remote.route.rule_set[0].url, file.url);
    assert.equal(remote.route.rule_set[0].format, 'binary');
    await assert.rejects(
        () =>
            materializeGeofiles(
                base,
                'XRAY_JSON',
                async () => srs,
                async () => ({}),
            ),
        /format-client/,
    );
});

test('persistent library deduplicates, constrains names and IDs, preserves referenced files and checks integrity', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remnacust-geofiles-'));
    const old = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), modules);
    let templates = [];
    const service = new GeofilesService(
        { getOrThrow: () => 'sub.example.test' },
        {
            getAllTemplates: async (withContent) =>
                withContent ? templates : templates.map(() => ({})),
        },
        { $transaction: async (operation) => operation({ $executeRaw: async () => 1 }) },
    );
    try {
        const first = await service.ingest('../../some label', 'geoip', async () => fixtures.geoip);
        assert.match(first.filename, /^[a-f0-9]{64}\.dat$/);
        assert.equal(first.categories[0], 'ru');
        const duplicate = await service.ingest('another name', 'geoip', async () => fixtures.geoip);
        assert.equal(duplicate.id, first.id);
        assert.equal((await service.list()).length, 1);
        await assert.rejects(() => service.download('../etc/passwd', 'data'));
        await assert.rejects(() => service.download(first.id, '../meta.json'));
        templates = [{ templateJson: { remnacust: { geofiles: [{ id: first.id }] } } }];
        await assert.rejects(() => service.remove(first.id), /in-use/);
        const read = await service.download(first.id, first.filename);
        let body = [];
        for await (const chunk of read.stream) body.push(chunk);
        assert.deepEqual(Buffer.concat(body), fixtures.geoip);
        const prepared = await service.prepare(
            { remnacust: { geofiles: [{ id: first.id, categories: ['ru'], target: 'REJECT' }] } },
            'XRAY_JSON',
        );
        assert.equal(prepared.outbounds[0].protocol, 'blackhole');
        templates = [];
        await service.remove(first.id);
        assert.deepEqual(await service.list(), []);
    } finally {
        if (old === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = old;
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('concurrent readers see only fully committed library entries', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remnacust-geofiles-atomic-'));
    const old = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    let ready, publish;
    const waiting = new Promise((resolve) => {
        ready = resolve;
    });
    const proceed = new Promise((resolve) => {
        publish = resolve;
    });
    const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), {
        ...modules,
        'node:fs/promises': {
            ...fs,
            rename: async (...args) => {
                ready();
                await proceed;
                return fs.rename(...args);
            },
        },
    });
    const service = new GeofilesService({ getOrThrow: () => 'sub.example.test' }, {}, {
        $transaction: async operation => operation({ $executeRaw: async () => 1 }),
    });
    let uploaded;
    try {
        uploaded = service.ingest('atomic', 'geoip', async () => fixtures.geoip);
        await waiting;
        assert.deepEqual(
            await service.list(),
            [],
            'Unfinished metadata must not leak or break the library',
        );
        publish();
        const item = await uploaded;
        assert.equal((await service.list())[0].id, item.id);
    } finally {
        publish();
        if (uploaded) await uploaded.catch(() => {});
        if (old === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = old;
        await fs.rm(directory, { recursive: true, force: true });
    }
});

test('host DENY preserves materialized geofile/manual rules and routing metadata', async () => {
    const { XrayJsonGeneratorService } = load(path.join(root, '../generators/xray-json.generator.service.ts'), {
        ...mocks,
        '@common/utils': { isNonEmptyObject: value => value && Object.keys(value).length > 0 },
        '../host-mapper': { applyHostMapper: value => value },
        './client-pool': pool,
    });
    const file = { id: '00' + 'a'.repeat(32), kind: 'geosite', url: 'https://example.test/geosite.dat' };
    const input = {
        outbounds: [{ tag: 'manual', protocol: 'freedom' }, { tag: 'block', protocol: 'freedom' }],
        routing: { domainStrategy: 'AsIs', balancers: [{ tag: 'auto', selector: ['proxy'] }], rules: [{ domain: ['full:manual.test'], outboundTag: 'manual' }] },
        remnacust: { geofiles: [{ id: file.id, categories: ['example'], target: 'REJECT' }] },
    };
    const prepared = await materializeGeofiles(input, 'XRAY_JSON', async () => file, async () => ({ ips: [], domains: [{ type: 3, value: 'ads.test' }] }));
    const original = JSON.stringify(prepared);
    const generator = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => prepared });
    const host = {
        protocol: 'vless', address: 'edge.test', port: 443, protocolOptions: { id: '11111111-1111-4111-8111-111111111111', flow: '' },
        transport: 'tcp', transportOptions: {}, security: 'tls', securityOptions: { serverName: 'edge.test' },
        streamOverrides: {}, mux: {}, finalRemark: 'test', metadata: { isHidden: false, excludeFromSubscriptionTypes: [], domainRules: { mode: 'DENY', domains: ['full:denied.test'] } },
        clientOverrides: { mapper: { xrayJson: null } },
    };
    const [config] = JSON.parse(await generator.generateConfig({ hosts: [host], isExtendedClient: false }));
    assert.equal(config.routing.domainStrategy, 'AsIs');
    assert.deepEqual(config.routing.balancers, input.routing.balancers);
    assert.deepEqual(config.routing.rules.slice(1), prepared.routing.rules);
    const deny = config.routing.rules[0];
    assert.deepEqual(deny.domain, ['full:denied.test']);
    assert.equal(config.outbounds.find(outbound => outbound.tag === deny.outboundTag).protocol, 'blackhole');
    assert.notEqual(deny.outboundTag, 'block', 'A manual outbound called block must not become the deny destination');
    assert.equal(JSON.stringify(prepared), original, 'Cached shared template must stay unchanged');
    host.metadata.domainRules.mode = 'ALLOW_ONLY';
    const [restricted] = JSON.parse(await generator.generateConfig({ hosts: [host], isExtendedClient: false }));
    assert.equal(restricted.routing.rules.length, 2);
    assert.equal(restricted.routing.rules[1].network, 'tcp,udp');
});
