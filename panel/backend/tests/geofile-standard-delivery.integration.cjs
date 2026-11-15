require('reflect-metadata');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const fixture = require('./geofiles-fixture.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');

const binary = process.env.REMNACUST_AUTOPROBE_CORE;
if (['true', '1'].includes(process.env.CI))
    assert(binary, 'Set REMNACUST_AUTOPROBE_CORE for the required native geofile CI check');

const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const modules = {
    ...mocks,
    '../generators/client-pool': pool,
    '@common/config/app-config/typed-config.service': {},
    '@common/database/prisma.service': {},
    'node:https': {
        ...require('node:https'),
        request: () => assert.fail('The native geofile fixture must not access the Internet'),
    },
    'node:dns/promises': {
        ...require('node:dns/promises'),
        lookup: () => assert.fail('The native geofile fixture must not resolve remote hosts'),
    },
};
const downloads = new Map();
const network = load(path.join(root, 'download-geofile.ts'), modules);
modules['./download-geofile'] = {
    ...network,
    downloadGeofile: async (url) => {
        assert(downloads.has(url), 'Only explicit fixture downloads are available');
        return downloads.get(url);
    },
};
const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), modules);
const { compileDat, datCategories } = load(path.join(root, 'compile-dat.ts'), modules);
const { datCategory } = load(path.join(root, 'xray-geofile-delivery.ts'), modules);
const digest = (data) => createHash('sha256').update(data).digest('hex');
const sourceUrl = (kind) =>
    `https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/${kind}.dat`;
const site = (name, domain, attribute) =>
    fixture.bytes(
        1,
        Buffer.concat([
            fixture.bytes(1, name),
            fixture.bytes(2, fixture.domain(2, domain, attribute)),
        ]),
    );
const cidr = (address, prefix) =>
    fixture.bytes(2, Buffer.concat([fixture.bytes(1, address), fixture.number(2, prefix)]));
const ip = (name, entries) => fixture.bytes(1, Buffer.concat([fixture.bytes(1, name), ...entries]));

async function ownedPort() {
    const server = net.createServer();
    try {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        return server.address().port;
    } finally {
        if (server.listening) await new Promise((resolve) => server.close(resolve));
    }
}

test(
    'actual GeofilesService standard/custom bundles resolve plain and hashed GeoSite/GeoIP through native Core -test',
    {
        skip:
            !binary &&
            'Set REMNACUST_AUTOPROBE_CORE to an owned native Core executable; no Core is started automatically',
        timeout: 90_000,
    },
    async (t) => {
        assert(path.isAbsolute(binary), 'The native Core path must be absolute');
        assert((await fs.stat(binary)).isFile(), 'The native Core path must be a file');
        const version = spawnSync(binary, ['version'], {
            encoding: 'utf8',
            timeout: 5000,
            maxBuffer: 65_536,
            windowsHide: true,
        });
        assert.ifError(version.error);
        assert.equal(version.status, 0, version.stdout + version.stderr);
        assert.match(version.stdout + version.stderr, /Remnacust/);
        t.diagnostic(version.stdout.split(/\r?\n/)[0]);

        const prefix = 'rc-standard-native-';
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
        const previous = process.env.XERA_BACKUPS_DIR;
        t.after(async () => {
            if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
            else process.env.XERA_BACKUPS_DIR = previous;
            const absolute = path.resolve(directory);
            assert.equal(path.dirname(absolute), path.resolve(os.tmpdir()));
            assert(path.basename(absolute).startsWith(prefix));
            const info = await fs.lstat(absolute);
            assert(info.isDirectory() && !info.isSymbolicLink());
            await fs.rm(absolute, { recursive: true, force: true });
        });
        process.env.XERA_BACKUPS_DIR = directory;
        const assets = path.join(directory, 'native-assets');
        await fs.mkdir(assets);
        const configPath = path.join(directory, 'native-probe.json');
        const service = new GeofilesService(
            {
                getOrThrow: (key) =>
                    key === 'APP_SECRET'
                        ? 'isolated-geofile-native-fixture-secret'
                        : 'sub.example.test',
            },
            { getAllTemplates: async () => [] },
            {
                $transaction: async (action) =>
                    action({
                        $executeRaw: async (strings) => {
                            assert.match(strings.join('?'), /pg_advisory_xact_lock/);
                            return 0;
                        },
                    }),
            },
        );
        const standardSite = Buffer.concat([
            site('CATEGORY-RU', 'standard.example.ru', 'ru'),
            site('FULL-STANDARD-ONLY', 'full-standard.example'),
        ]);
        const customSiteData = Buffer.concat([
            site('CUSTOM', 'custom.example'),
            site('OMITTED-CUSTOM', 'omitted.example'),
        ]);
        const standardIp = Buffer.concat([
            ip('RU', [
                cidr(Buffer.from([203, 0, 113, 0]), 24),
                cidr(Buffer.from('20010db8100000000000000000000000', 'hex'), 48),
            ]),
            ip('PRIVATE', [
                cidr(Buffer.from([10, 0, 0, 0]), 8),
                cidr(Buffer.from('fc000000000000000000000000000000', 'hex'), 7),
            ]),
        ]);
        const customIpData = Buffer.concat([
            ip('CUSTOM', [
                cidr(Buffer.from([198, 51, 100, 0]), 24),
                cidr(Buffer.from('20010db8cafe00000000000000000000', 'hex'), 48),
            ]),
            ip('OMITTED-CUSTOM', [cidr(Buffer.from([192, 0, 2, 0]), 24)]),
        ]);
        const customSite = await service.ingest(
            'Custom sites',
            'geosite',
            async () => customSiteData,
        );
        const customIp = await service.ingest('Custom IPs', 'geoip', async () => customIpData);
        const siteTag = datCategory(customSite.id, 'custom');
        const ipTag = datCategory(customIp.id, 'custom');
        async function delivered(kind, file) {
            const value = await service.bundleUrl(kind, [file.id], { [file.id]: ['custom'] });
            const url = new URL(value);
            const filename = url.pathname.split('/').at(-1);
            const selection = url.pathname.split('/').at(-2);
            const data = await service.bundle(file.id, filename, selection);
            const checksum = await service.bundle(file.id, filename + '.sha256', selection);
            assert.equal(checksum.toString(), digest(data));
            return { url: value, data };
        }
        const legacySite = await delivered('geosite', customSite);
        const legacyIp = await delivered('geoip', customIp);
        assert.deepEqual(datCategories(legacySite.data), [siteTag]);
        assert.deepEqual(datCategories(legacyIp.data), [ipTag]);
        downloads.set(sourceUrl('geosite'), standardSite);
        downloads.set(sourceUrl('geoip'), standardIp);
        const fullSite = await service.importUrl(
            'Protected standard sites',
            'geosite',
            sourceUrl('geosite'),
        );
        const fullIp = await service.importUrl(
            'Protected standard IPs',
            'geoip',
            sourceUrl('geoip'),
        );
        for (const [kind, file] of [
            ['geosite', fullSite],
            ['geoip', fullIp],
        ]) {
            const configured = await service.configureRefresh(file.id, {
                sourceUrl: sourceUrl(kind),
                enabled: true,
                intervalSeconds: 172_800,
            });
            assert.equal(configured.origin, 'preset');
            assert.equal(configured.editPolicy, 'copy');
            assert.equal(configured.refresh.sourceUrl, sourceUrl(kind));
            assert.ok(configured.refresh.lastSuccessAt);
        }
        const currentSite = await delivered('geosite', customSite);
        const currentIp = await delivered('geoip', customIp);
        assert.notEqual(currentSite.url, legacySite.url);
        assert.notEqual(currentIp.url, legacyIp.url);
        assert.deepEqual(
            new Set(datCategories(currentSite.data)),
            new Set(['category-ru', 'full-standard-only', siteTag]),
        );
        assert.deepEqual(new Set(datCategories(currentIp.data)), new Set(['ru', 'private', ipTag]));
        assert.deepEqual(compileDat(currentSite.data, 'geosite', ['category-ru@ru']).domains, [
            { type: 2, value: 'standard.example.ru' },
        ]);
        assert.deepEqual(compileDat(currentSite.data, 'geosite', [siteTag]).domains, [
            { type: 2, value: 'custom.example' },
        ]);
        assert.deepEqual(compileDat(currentIp.data, 'geoip', ['ru']).ips, [
            '203.0.113.0/24',
            '2001:db8:1000::/48',
        ]);
        assert.deepEqual(compileDat(currentIp.data, 'geoip', ['private']).ips, [
            '10.0.0.0/8',
            'fc00::/7',
        ]);
        assert.deepEqual(compileDat(currentIp.data, 'geoip', [ipTag]).ips, [
            '198.51.100.0/24',
            '2001:db8:cafe::/48',
        ]);

        const port = await ownedPort();
        const base = {
            log: { loglevel: 'error' },
            inbounds: [
                {
                    tag: 'owned-loopback-http',
                    listen: '127.0.0.1',
                    port,
                    protocol: 'http',
                    settings: {},
                },
            ],
            outbounds: [
                { tag: 'direct', protocol: 'freedom' },
                { tag: 'unused-fallback', protocol: 'blackhole' },
            ],
        };
        const siteRule = {
            type: 'field',
            domain: ['geosite:category-ru', 'geosite:' + siteTag],
            outboundTag: 'direct',
        };
        const ipRule = {
            type: 'field',
            ip: ['geoip:ru', 'geoip:private', 'geoip:' + ipTag],
            outboundTag: 'direct',
        };
        async function native(siteData, ipData, rules) {
            await fs.writeFile(path.join(assets, 'geosite.dat'), siteData);
            await fs.writeFile(path.join(assets, 'geoip.dat'), ipData);
            assert.deepEqual((await fs.readdir(assets)).sort(), ['geoip.dat', 'geosite.dat']);
            await fs.writeFile(
                configPath,
                JSON.stringify({ ...base, routing: { domainStrategy: 'AsIs', rules } }),
            );
            const result = spawnSync(binary, ['run', '-test', '-config', configPath], {
                cwd: assets,
                encoding: 'utf8',
                timeout: 15_000,
                maxBuffer: 131_072,
                windowsHide: true,
                env: { ...process.env, XRAY_LOCATION_ASSET: assets, 'xray.location.asset': assets },
            });
            assert.ifError(result.error);
            assert.equal(result.signal, null);
            return { status: result.status, output: result.stdout + result.stderr };
        }
        await t.test(
            'defaultless legacy GeoSite bundle fails the plain CATEGORY-RU lookup',
            async () => {
                const result = await native(legacySite.data, currentIp.data, [siteRule]);
                assert.notEqual(result.status, 0);
                assert.match(result.output, /CATEGORY-RU/i);
                assert.match(result.output, /geosite\.dat|geodata/i);
            },
        );
        await t.test('defaultless legacy GeoIP bundle fails plain RU/PRIVATE lookups', async () => {
            const result = await native(currentSite.data, legacyIp.data, [ipRule]);
            assert.notEqual(result.status, 0);
            assert.match(result.output, /RU|PRIVATE/i);
            assert.match(result.output, /geoip\.dat|GeoIP|geodata/i);
        });
        await t.test(
            'actual standard/custom bundles validate plain aliases, hashed custom selectors and IPv6 CIDRs together',
            async () => {
                const result = await native(currentSite.data, currentIp.data, [
                    siteRule,
                    {
                        type: 'field',
                        domain: ['geosite:category-ru@ru', 'geosite:full-standard-only'],
                        outboundTag: 'direct',
                    },
                    ipRule,
                    { type: 'field', network: 'tcp,udp', outboundTag: 'unused-fallback' },
                ]);
                assert.equal(result.status, 0, result.output);
                assert.match(result.output, /Configuration OK/);
            },
        );
        await t.test(
            'explicit manual geodata and ordinary/ext selectors pass through service preparation unchanged',
            async () => {
                const manual = {
                    geodata: {
                        cron: '0 4 * * *',
                        outbound: 'direct',
                        assets: [
                            { url: 'https://manual.example.test/sites.dat', file: 'geosite.dat' },
                            { url: 'https://manual.example.test/ips.dat', file: 'geoip.dat' },
                        ],
                    },
                    outbounds: [{ tag: 'direct', protocol: 'freedom' }],
                    routing: {
                        rules: [
                            {
                                type: 'field',
                                domain: ['geosite:category-ru', 'ext:manual-sites.dat:example'],
                                outboundTag: 'direct',
                            },
                            {
                                type: 'field',
                                ip: ['geoip:private', 'ext:manual-ips.dat:example'],
                                outboundTag: 'direct',
                            },
                        ],
                    },
                };
                const snapshot = structuredClone(manual);
                assert.deepEqual(await service.prepare(manual, 'XRAY_JSON'), snapshot);
                assert.deepEqual(manual, snapshot);
            },
        );
    },
);
