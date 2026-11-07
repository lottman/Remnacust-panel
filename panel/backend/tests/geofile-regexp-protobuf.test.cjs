const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const load = require('./load-typescript.cjs');
const f = require('./geofiles-fixture.cjs');
const { mocks, pool } = require('./client-pool-fixture.cjs');
const modules = { ...mocks, '../generators/client-pool': pool };
const root = path.join(__dirname, '../src/modules/subscription-template/geofiles');
const { validateGeofile, validateDatSteps } = load(path.join(root, 'validate-geofile.ts'), modules);
const { compileDat, datCategories } = load(path.join(root, 'compile-dat.ts'), modules);
const { createGoRegexpValidator } = load(path.join(root, 'go-regexp.ts'));
const entry = (name, ...records) =>
    f.bytes(1, Buffer.concat([f.bytes(1, name), ...records.map((record) => f.bytes(2, record))]));
const check = (data, kind) => {
    validateGeofile(data, kind);
    for (const _ of validateDatSteps(data, kind)) {
    }
};
const patterns = [
    ['[', false],
    ['(', false],
    ['(?=a)', false],
    ['(?<=a)b', false],
    [String.raw`(a)\1`, false],
    [String.raw`\u0061`, false],
    [String.raw`\C`, false],
    [String.raw`\p{Ascii}`, true],
    [String.raw`\p{Assigned}`, true],
    [String.raw`\p{Lc}`, true],
    [String.raw`\p{Unknown}`, false],
    [String.raw`\p{sc=Latin}`, false],
    ['a{1001}', false],
    ['a++', false],
    ['a{3,2}', false],
    ['(?i)example\\.com$', true],
    ['(?s:foo.*bar)', true],
    ['(?U)a+', true],
    [String.raw`\A(?:foo|bar)\z`, true],
    [String.raw`\x{1F600}`, true],
    [String.raw`\123`, true],
    [String.raw`\p{Greek}+\pL`, true],
    [String.raw`[[:alpha:][:digit:]]+`, true],
    [String.raw`\Q(?=literal)[\E`, true],
    ['(?P<name>a)(?<second>b)', true],
    ['(?P<1>a)', true],
    ['(?P<same>a)(?P<same>b)', false],
];

test('Go regexp validation rejects malformed/JS-only constructs and accepts Go-only constructs', () => {
    const validate = createGoRegexpValidator();
    for (const [pattern, expected] of patterns) {
        if (expected) assert.doesNotThrow(() => validate(pattern), pattern);
        else assert.throws(() => validate(pattern), /geofile-regexp/, pattern);
    }
});

test('regexp resource bounds reject expansion/depth/byte exhaustion before compilation', () => {
    const validate = createGoRegexpValidator();
    for (const pattern of [
        'a'.repeat(4097),
        '('.repeat(65) + 'a' + ')'.repeat(65),
        '(?:ab{1000}){1000}',
        '\ud800',
    ])
        assert.throws(() => validate(pattern), /geofile-regexp/);
    for (let n = 0; n < 20_000; n++) validate('(?i)cached');
    const file = createGoRegexpValidator();
    for (let n = 0; n < 10_000; n++) file('domain' + n);
    assert.throws(() => file('one-more-unique'), /complexity/);
});

test('shared synchronous/cooperative DAT validation rejects invalid regexp before commit', () => {
    for (const pattern of ['[', '(?=a)', String.raw`\p{Unknown}`]) {
        const data = entry('EXAMPLE', f.domain(1, pattern));
        assert.throws(() => validateGeofile(data, 'geosite'), /geofile-regexp/);
        assert.throws(() => {
            for (const _ of validateDatSteps(data, 'geosite')) {
            }
        }, /geofile-regexp/);
    }
    check(entry('EXAMPLE', f.domain(1, '(?i)^example\\.com$')), 'geosite');
});

test('native sing-box and mihomo domain regex payloads use the same Go syntax gate', () => {
    for (const pattern of ['[', '(?=a)']) {
        assert.throws(
            () =>
                validateGeofile(
                    Buffer.from(
                        JSON.stringify({
                            version: 3,
                            rules: [{ domain_regex: [pattern] }],
                        }),
                    ),
                    'singbox-json',
                ),
            /regexp/,
        );
        assert.throws(
            () =>
                validateGeofile(
                    Buffer.from(
                        JSON.stringify({
                            payload: ['DOMAIN-REGEX,' + pattern],
                        }),
                    ),
                    'mihomo-classical',
                ),
            /regexp/,
        );
    }
    validateGeofile(
        Buffer.from(
            JSON.stringify({
                version: 3,
                rules: [{ domain_regex: ['(?i)example'] }],
            }),
        ),
        'singbox-json',
    );
});

test('ingest, refresh, manual edit and raw replacement all retain the last valid DAT on regexp failure', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remnacust-regexp-commit-'));
    const previous = process.env.XERA_BACKUPS_DIR;
    process.env.XERA_BACKUPS_DIR = directory;
    try {
        const invalid = entry('EXAMPLE', f.domain(1, '['));
        const network = load(path.join(root, 'download-geofile.ts'), modules);
        const { GeofilesService } = load(path.join(root, 'geofiles.service.ts'), {
            ...modules,
            './download-geofile': { ...network, downloadGeofile: async () => invalid },
        });
        const service = new GeofilesService(
            { getOrThrow: (key) => (key === 'APP_SECRET' ? 'a'.repeat(64) : 'sub.example.test') },
            { getAllTemplates: async () => [] },
            { $transaction: async (work) => work({ $executeRaw: async () => 1 }) },
        );
        const source = await service.ingest('Retained', 'geosite', async () => f.geosite);
        await assert.rejects(
            () => service.ingest('Invalid', 'geosite', async () => invalid),
            /invalid/,
        );
        await assert.rejects(
            () =>
                service.editContent(source.id, {
                    sha256: source.sha256,
                    category: 'example',
                    changes: [{ index: 0, type: 'regexp', value: '[' }],
                }),
            /invalid/,
        );
        await assert.rejects(
            () => service.replaceData(source.id, source.sha256, async () => invalid),
            /invalid/,
        );
        await assert.rejects(
            () =>
                service.replaceData(
                    source.id,
                    source.sha256,
                    async () => invalid,
                    'Invalid copy',
                    [],
                ),
            /invalid/,
        );
        await service.configureRefresh(source.id, {
            sourceUrl: 'https://example.com/geosite.dat',
            enabled: true,
        });
        assert.equal(await service.refreshNow(source.id), false);
        const files = await service.list();
        assert.equal(files.length, 1);
        assert.equal(files[0].sha256, source.sha256);
        const { stream } = await service.download(source.id, 'latest.dat');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        assert.deepEqual(Buffer.concat(chunks), f.geosite);
    } finally {
        if (previous === undefined) delete process.env.XERA_BACKUPS_DIR;
        else process.env.XERA_BACKUPS_DIR = previous;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('new DAT rejects duplicate known singular fields including attribute keys/oneof', () => {
    const domain = f.domain(3, 'first.test');
    const data = [
        f.bytes(1, Buffer.concat([f.bytes(1, 'FIRST'), f.bytes(1, 'LAST'), f.bytes(2, domain)])),
        entry('EXAMPLE', Buffer.concat([domain, f.number(1, 1)])),
        entry('EXAMPLE', Buffer.concat([domain, f.bytes(2, '[')])),
        entry(
            'EXAMPLE',
            Buffer.concat([
                domain,
                f.bytes(3, Buffer.concat([f.bytes(1, 'first'), f.bytes(1, 'last')])),
            ]),
        ),
        entry(
            'EXAMPLE',
            Buffer.concat([
                domain,
                f.bytes(3, Buffer.concat([f.bytes(1, 'attr'), f.number(2, 1), f.number(3, 1)])),
            ]),
        ),
    ];
    for (const item of data) assert.throws(() => check(item, 'geosite'), /duplicate/);
    const ip = Buffer.concat([f.bytes(1, Buffer.from([203, 0, 113, 0])), f.number(2, 24)]);
    assert.throws(
        () => check(entry('EXAMPLE', Buffer.concat([ip, f.number(2, 16)])), 'geoip'),
        /duplicate/,
    );
    assert.throws(
        () =>
            check(
                f.bytes(
                    1,
                    Buffer.concat([
                        f.bytes(1, 'EXAMPLE'),
                        f.bytes(2, ip),
                        f.number(3, 1),
                        f.number(3, 0),
                    ]),
                ),
                'geoip',
            ),
        /duplicate/,
    );
});

test('known wrong wire types reject while repeated attributes and unknown fields survive', () => {
    for (const tail of [f.bytes(1, 'wrong'), Buffer.from([13, 0, 0, 0, 0])])
        assert.throws(() =>
            check(entry('EXAMPLE', Buffer.concat([f.domain(3, 'test'), tail])), 'geosite'),
        );
    const unknown = Buffer.concat([f.number(12, 3), Buffer.from([117, 1, 2, 3, 4])]);
    const data = entry(
        'EXAMPLE',
        Buffer.concat([f.domain(3, 'test', 'first'), f.bytes(3, f.bytes(1, 'second')), unknown]),
    );
    const original = Buffer.from(data);
    check(data, 'geosite');
    assert.deepEqual(data, original);
    assert.deepEqual(compileDat(data, 'geosite', ['example@first']).domains, [
        { type: 3, value: 'test' },
    ]);
    assert.deepEqual(compileDat(data, 'geosite', ['example@second']).domains, [
        { type: 3, value: 'test' },
    ]);
});

test('legacy reading selects last category/type/value/attribute key and reverse flag', () => {
    const record = Buffer.concat([
        f.domain(0, 'shown.test'),
        f.number(1, 3),
        f.bytes(2, 'effective.test'),
        f.bytes(3, Buffer.concat([f.bytes(1, 'old'), f.bytes(1, 'new')])),
    ]);
    const data = f.bytes(
        1,
        Buffer.concat([f.bytes(1, 'OLD'), f.bytes(1, 'NEW'), f.bytes(2, record)]),
    );
    assert.deepEqual(datCategories(data), ['new']);
    assert.deepEqual(compileDat(data, 'geosite', ['new@new']).domains, [
        { type: 3, value: 'effective.test' },
    ]);
    assert.throws(() => compileDat(data, 'geosite', ['old']), /empty/);
    assert.throws(() => compileDat(data, 'geosite', ['new@old']), /empty/);
    const upperAttribute = entry('EXAMPLE', f.domain(3, 'upper.test', 'ADS'));
    assert.throws(() => compileDat(upperAttribute, 'geosite', ['example@ads']), /empty/);
    const ip = Buffer.concat([
        f.bytes(1, Buffer.from([1, 2, 3, 4])),
        f.bytes(1, Buffer.from([203, 0, 113, 0])),
        f.number(2, 16),
        f.number(2, 24),
    ]);
    const ipData = f.bytes(
        1,
        Buffer.concat([f.bytes(1, 'EXAMPLE'), f.bytes(2, ip), f.number(3, 1), f.number(3, 0)]),
    );
    assert.deepEqual(compileDat(ipData, 'geoip', ['example']).ips, ['203.0.113.0/24']);
});

test(
    'Go/Core oracle agrees with every accepted expression and legacy protobuf decoding',
    {
        skip: !process.env.GEOFILE_TEST_GO || !process.env.GEOFILE_TEST_CORE_SOURCE,
        timeout: 90_000,
    },
    () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'remnacust-regexp-core-'));
        try {
            const corpus = patterns.map(([pattern]) => pattern);
            const atoms = [
                'a',
                '.',
                '[a-z]',
                '[[:alpha:]]',
                String.raw`\p{Greek}`,
                String.raw`\x{10000}`,
                String.raw`\Q[a](?=x)\E`,
                String.raw`\b`,
                String.raw`\d`,
                '(?P<n>a)',
                '(?i:a)',
            ];
            const suffixes = ['', '?', '*', '+', '{0,3}', '{2}', '|b', '(?:x|y)$'];
            for (const atom of atoms)
                for (const suffix of suffixes)
                    corpus.push(atom + suffix, '(?:' + atom + ')' + suffix);
            const source = path.join(directory, 'oracle.go');
            fs.writeFileSync(
                source,
                `package main
import("encoding/json";"os";"encoding/hex";"github.com/xtls/xray-core/common/geodata";"github.com/xtls/xray-core/common/geodata/strmatcher";"google.golang.org/protobuf/proto")
func main(){var patterns []string;json.NewDecoder(os.Stdin).Decode(&patterns);valid:=[]bool{};for _,p:=range patterns{_,err:=strmatcher.Regex.New(p);valid=append(valid,err==nil)};raw,_:=hex.DecodeString("0803120d73686f776e2e6578616d706c6512116566666563746976652e6578616d706c65");var d geodata.Domain;if err:=proto.Unmarshal(raw,&d);err!=nil{panic(err)};json.NewEncoder(os.Stdout).Encode(struct{Valid []bool;Value string}{valid,d.Value})}`,
            );
            const result = spawnSync(
                process.env.GEOFILE_TEST_GO,
                ['run', '-mod=readonly', source],
                {
                    cwd: process.env.GEOFILE_TEST_CORE_SOURCE,
                    input: JSON.stringify(corpus),
                    encoding: 'utf8',
                    env: { ...process.env, GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off' },
                    timeout: 80_000,
                },
            );
            assert.equal(result.status, 0, result.stderr);
            const oracle = JSON.parse(result.stdout);
            assert.equal(oracle.Value, 'effective.example');
            patterns.forEach(([pattern, expected], index) => {
                if (expected) assert.equal(oracle.Valid[index], true, pattern);
                else if (!pattern.includes('(?P<same>'))
                    assert.equal(oracle.Valid[index], false, pattern);
            });
            const validate = createGoRegexpValidator();
            corpus.forEach((pattern, index) => {
                let accepted = true;
                try {
                    validate(pattern);
                } catch {
                    accepted = false;
                }
                if (accepted) assert.equal(oracle.Valid[index], true, pattern);
            });
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    },
);
