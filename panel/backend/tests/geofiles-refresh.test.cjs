const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const load = require('./load-typescript.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const fixtures = require('./geofiles-fixture.cjs');
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = { ...mocks, '../generators/client-pool': pool };
const { materializeGeofiles, geofileReferences } = load(
    path.join(root, 'materialize-geofiles.ts'),
    modules,
);
const { compileDat } = load(path.join(root, 'compile-dat.ts'), modules);
const { geofileInterval } = load(path.join(root, 'geofile-delivery.ts'), modules);
const { XrayGeofileDelivery, datCategory } = load(
    path.join(root, 'xray-geofile-delivery.ts'),
    modules,
);

test('inline DAT keeps DIRECT, REJECT and configured targets in all five formats', async () => {
    const file = { id: '00' + 'a'.repeat(32), kind: 'geosite' };
    const dat = async () => compileDat(fixtures.geosite, 'geosite', ['example']);
    for (const format of ['XRAY_JSON', 'SINGBOX', 'MIHOMO', 'CLASH', 'STASH']) {
        for (const target of ['DIRECT', 'REJECT', 'custom']) {
            const config = {
                remnacust: {
                    geofiles: [
                        { id: file.id, categories: ['example'], target, downloadToClient: false },
                    ],
                },
                ...(format === 'XRAY_JSON'
                    ? { routing: { balancers: [{ tag: 'custom', selector: ['p'] }] } }
                    : format === 'SINGBOX'
                      ? {
                            outbounds: [
                                { tag: 'custom', type: 'selector', outbounds: ['direct'] },
                                { tag: 'direct', type: 'direct' },
                            ],
                        }
                      : {
                            'proxy-groups': [
                                { name: 'custom', type: 'select', proxies: ['DIRECT'] },
                            ],
                        }),
            };
            const output = await materializeGeofiles(config, format, async () => file, dat);
            assert.equal(output.remnacust, undefined);
            assert.equal(config.remnacust.geofiles[0].target, target, 'source is not mutated');
            if (format === 'XRAY_JSON') {
                const rule = output.routing.rules[0];
                if (target === 'custom') assert.equal(rule.balancerTag, target);
                else
                    assert.equal(
                        output.outbounds.find((item) => item.tag === rule.outboundTag).protocol,
                        target === 'DIRECT' ? 'freedom' : 'blackhole',
                    );
            } else if (format === 'SINGBOX') {
                const rule = output.route.rules[0];
                assert.equal(rule.action, target === 'REJECT' ? 'reject' : 'route');
                if (target === 'custom') assert.equal(rule.outbound, target);
                if (target === 'DIRECT')
                    assert.equal(
                        output.outbounds.find((item) => item.tag === rule.outbound).type,
                        'direct',
                    );
                assert.equal(output.route.rule_set, undefined);
            } else {
                assert.ok(output.rules.length > 0);
                assert.ok(output.rules.every((rule) => rule.endsWith(',' + target)));
                assert.equal(output['rule-providers'], undefined);
            }
        }
        await assert.rejects(
            () =>
                materializeGeofiles(
                    {
                        remnacust: {
                            geofiles: [{ id: file.id, target: 'missing', downloadToClient: false }],
                        },
                    },
                    format,
                    async () => file,
                    dat,
                ),
            /geofile-target/,
        );
    }
    for (const target of ['', ' ', null, {}, 'DIRECT,REJECT', 'DIRECT\nREJECT', 'a'.repeat(256)]) {
        assert.throws(
            () =>
                geofileReferences({
                    remnacust: { geofiles: [{ id: file.id, target, downloadToClient: false }] },
                }),
            /geofile-reference/,
        );
    }
});

test('delivery preserves routing actions and remote mode carries the configured interval', async () => {
    const file = {
        id: '00' + 'a'.repeat(32),
        kind: 'geosite',
        url: 'https://sub.test/geosite.dat',
    };
    const ref = { id: file.id, categories: ['example'], target: 'REJECT' };
    assert.throws(() =>
        geofileReferences({
            remnacust: { geofiles: [{ ...ref, downloadToClient: false, target: { bad: true } }] },
        }),
    );
    assert.equal(
        geofileReferences({
            remnacust: { geofiles: [{ id: file.id, downloadToClient: false }] },
        })[0].target,
        'DIRECT',
    );
    const dat = async () => compileDat(fixtures.geosite, 'geosite', ['example']);
    const legacy = await materializeGeofiles(
        { remnacust: { geofiles: [ref] } },
        'XRAY_JSON',
        async () => file,
        dat,
    );
    assert.equal(legacy.outbounds[0].protocol, 'blackhole');
    const inline = await materializeGeofiles(
        { remnacust: { geofiles: [{ ...ref, downloadToClient: false }] } },
        'XRAY_JSON',
        async () => file,
        dat,
    );
    assert.equal(inline.outbounds[0].protocol, 'blackhole');
    for (const format of ['SINGBOX', 'MIHOMO', 'CLASH', 'STASH']) {
        const remote = await materializeGeofiles(
            {
                remnacust: {
                    geofiles: [
                        { ...ref, downloadToClient: true, clientRefreshIntervalSeconds: 1800 },
                    ],
                },
            },
            format,
            async () => file,
            dat,
            { read: async () => fixtures.geosite, datUrl: () => 'https://sub.test/rules/signed' },
            undefined,
            'remote',
        );
        if (format === 'SINGBOX') {
            assert.equal(remote.route.rule_set[0].url, 'https://sub.test/rules/signed');
            assert.equal(remote.route.rule_set[0].update_interval, '1800s');
        } else {
            assert.equal(remote['rule-providers']['geo_' + file.id].interval, 1800);
            assert.match(remote.rules[0], /,REJECT$/);
        }
    }
    const fallback = await materializeGeofiles(
        { remnacust: { geofiles: [{ ...ref, downloadToClient: true }] } },
        'XRAY_JSON',
        async () => file,
        dat,
        { read: async () => fixtures.geosite, datUrl: () => '' },
    );
    assert.equal(fallback.outbounds[0].protocol, 'blackhole');
    assert.deepEqual(fallback.routing.rules[0].domain, [
        'domain:example.com',
        'full:ads.example.com',
    ]);
    for (const value of [0, 299, 2592001, '600', Infinity])
        assert.throws(() => geofileInterval(value));
    assert.equal(geofileInterval(300), 300);
});

test('native JSON and YAML can be embedded without a URL; binary SRS cannot pretend to be inline', async () => {
    const id = '00' + 'a'.repeat(32),
        ref = { id, target: 'REJECT', downloadToClient: false };
    const data = Buffer.from('{"version":3,"rules":[{"domain_suffix":["example.com"]}]}');
    const sing = await materializeGeofiles(
        { remnacust: { geofiles: [ref] } },
        'SINGBOX',
        async () => ({ id, kind: 'singbox-json' }),
        async () => {},
        { read: async () => data, datUrl: () => '' },
    );
    assert.deepEqual(sing.route.rule_set[0], {
        type: 'inline',
        tag: 'geo_' + id,
        rules: [{ domain_suffix: ['example.com'] }],
    });
    assert.equal(sing.route.rules[0].action, 'reject');
    assert.equal(sing.outbounds, undefined);
    for (const format of ['MIHOMO', 'CLASH', 'STASH']) {
        const yaml = await materializeGeofiles(
            { remnacust: { geofiles: [ref] } },
            format,
            async () => ({ id, kind: 'mihomo-domain', url: 'https://sub.test/domains.yaml' }),
            async () => {},
            { read: async () => Buffer.from('payload: ["+.example.com"]'), datUrl: () => '' },
        );
        if (format === 'CLASH') assert.equal(yaml['rule-providers']['geo_' + id].url, 'https://sub.test/domains.yaml');
        else assert.deepEqual(yaml['rule-providers']['geo_' + id], {
            type: 'inline',
            behavior: 'domain',
            payload: ['+.example.com'],
        });
        assert.match(yaml.rules[0], /,REJECT$/);
    }
    const binary = await materializeGeofiles(
                { remnacust: { geofiles: [ref] } },
                'SINGBOX',
                async () => ({ id, kind: 'singbox-srs', url: 'https://sub.test/rules.srs' }),
                async () => {},
                { read: async () => { throw Error('binary is never inlined'); }, datUrl: () => '' },
            );
    assert.equal(binary.route.rule_set[0].type, 'remote');
    assert.equal(binary.route.rule_set[0].format, 'binary');
    assert.equal(binary.route.rule_set[0].url, 'https://sub.test/rules.srs');
});

test('refresh survives restart, keeps immutable bytes, honors cooldown and retains the last valid version on source failure', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remnacust-geo-refresh-')),
        previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    let reads = 0,
        body = fixtures.geosite,
        templates = [],
        lock = Promise.resolve();
    const network = load(path.join(root, 'download-geofile.ts'), modules);
    const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), {
        ...modules,
        './download-geofile': {
            ...network,
            downloadGeofile: async () => {
                reads++;
                await new Promise((r) => setTimeout(r, 10));
                return body;
            },
        },
    });
    const prisma = {
        $transaction: (operation) => {
            const result = lock.then(() => operation({ $executeRaw: async () => 1 }));
            lock = result.catch(() => {});
            return result;
        },
    };
    const create = () =>
        new GeofilesService(
            { getOrThrow: (key) => (key === 'APP_SECRET' ? 's'.repeat(64) : 'sub.test') },
            { getAllTemplates: async () => templates },
            prisma,
        );
    const read = async (stream) => {
        const data = [];
        for await (const chunk of stream) data.push(chunk);
        return Buffer.concat(data);
    };
    let service = create();
    try {
        const file = await service.ingest('Sites', 'geosite', async () => fixtures.geosite);
        const happ = new XrayGeofileDelivery();
        const native = await service.prepare(
            {
                remnacust: {
                    geofiles: [
                        {
                            id: file.id,
                            categories: ['example@ads'],
                            target: 'REJECT',
                            downloadToClient: true,
                        },
                    ],
                },
            },
            'XRAY_JSON',
            happ,
        );
        const header = await happ.header(JSON.stringify([native]), 'refresh-user');
        const profile = JSON.parse(
            Buffer.from(header.slice('happ://routing/onadd/'.length), 'base64').toString(),
        );
        const bundleUrl = new URL(profile.Geositeurl);
        const bundleName = bundleUrl.pathname.split('/').at(-1);
        const bundleSelection = bundleUrl.pathname.split('/').at(-2);
        const category = datCategory(file.id, 'example@ads');
        assert.equal(
            compileDat(await service.bundle(file.id, bundleName, bundleSelection), 'geosite', [
                category,
            ]).domains[0].value,
            'ads.example.com',
        );
        templates = [
            {
                templateType: 'XRAY_JSON',
                templateJson: {
                    remnacust: {
                        geofiles: [
                            {
                                id: file.id,
                                categories: ['example'],
                                target: 'DIRECT',
                                downloadToClient: true,
                            },
                        ],
                    },
                },
            },
        ];
        const slot = path.join(directory, 'geofiles', '00'),
            stateFile = path.join(slot, 'refresh.json');
        const due = async () => {
            const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
            state.nextRefreshAt = new Date(0).toISOString();
            await fs.writeFile(stateFile, JSON.stringify(state));
        };
        await service.configureRefresh(file.id, {
            sourceUrl: 'https://example.com/rules.dat',
            enabled: true,
            intervalSeconds: 900,
        });
        body = Buffer.from(
            fixtures.geosite
                .toString('hex')
                .replace(
                    Buffer.from('ads.example.com').toString('hex'),
                    Buffer.from('new.example.com').toString('hex'),
                ),
            'hex',
        );
        assert.equal(await service.refreshNow(file.id), true);
        assert.equal(
            compileDat(await service.bundle(file.id, bundleName, bundleSelection), 'geosite', [
                category,
            ]).domains[0].value,
            'new.example.com',
            'Bundle cache follows the active source hash',
        );
        assert.equal(reads, 1);
        assert.deepEqual(
            await read((await service.download(file.id, file.filename)).stream),
            fixtures.geosite,
        );
        assert.deepEqual(await read((await service.download(file.id, 'latest.dat')).stream), body);
        assert.equal(await service.refreshNow(file.id), false);
        service = create();
        await service.refreshDue();
        assert.equal(reads, 1, 'Restart does not reset persisted cooldown');
        const expected = body;
        await due();
        body = Buffer.from('<html>error</html>');
        assert.equal(await service.refreshNow(file.id), false);
        assert.deepEqual(
            await read((await service.download(file.id, 'latest.dat')).stream),
            expected,
        );
        assert.equal((await service.list())[0].refresh.lastError, 'geofile-refresh-failed');
        assert.equal(
            compileDat(await service.bundle(file.id, bundleName, bundleSelection), 'geosite', [
                category,
            ]).domains[0].value,
            'new.example.com',
            'Failed refresh keeps the last usable bundle',
        );
        assert.equal(reads, 2);
        assert.equal(await service.refreshNow(file.id), false);
        assert.equal(reads, 2);
        await due();
        body = fixtures.bytes(
            1,
            Buffer.concat([
                fixtures.bytes(1, 'REMOVED'),
                fixtures.bytes(2, fixtures.domain(2, 'removed.test')),
            ]),
        );
        assert.equal(
            await service.refreshNow(file.id),
            false,
            'Removing a category used by an active template cannot replace the file',
        );
        assert.deepEqual(
            await read((await service.download(file.id, 'latest.dat')).stream),
            expected,
        );
        await due();
        body = Buffer.concat([fixtures.geosite, fixtures.geosite]);
        assert.equal(
            await service.refreshNow(file.id),
            false,
            'Ambiguous native categories cannot replace an active Happ dataset',
        );
        assert.deepEqual(
            await read((await service.download(file.id, 'latest.dat')).stream),
            expected,
        );
        await due();
        body = fixtures.geosite;
        const other = create(),
            before = reads;
        await Promise.all([service.refreshNow(file.id), other.refreshNow(file.id)]);
        assert.equal(reads, before + 1, 'Cross-process lease permits only one download');
        const prepared = await service.prepare(
            {
                remnacust: {
                    geofiles: [
                        {
                            id: file.id,
                            categories: ['example'],
                            target: 'DIRECT',
                            downloadToClient: true,
                        },
                    ],
                },
            },
            'SINGBOX',
            undefined,
            'remote',
        );
        const url = new URL(prepared.route.rule_set[0].url),
            filename = url.pathname.split('/').at(-1);
        const payload = JSON.parse((await service.derived(file.id, filename)).toString());
        assert.ok(payload.rules.some((rule) => rule.domain_suffix?.includes('example.com')));
        await assert.rejects(() => service.derived(file.id, filename.replace('rules-', 'rules-A')));
        await assert.rejects(() =>
            service.configureRefresh(file.id, {
                sourceUrl: 'http://127.0.0.1/a',
                enabled: true,
                intervalSeconds: 900,
            }),
        );
        await assert.rejects(() => service.configureRefresh(file.id, { intervalSeconds: 60 }));
        await service.configureRefresh(file.id, { enabled: false });
        await due();
        const stopped = reads;
        await service.refreshDue();
        assert.equal(reads, stopped);
    } finally {
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        await fs.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
});
