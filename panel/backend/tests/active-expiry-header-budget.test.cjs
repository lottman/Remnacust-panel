const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const F = require('./active-expiry-fixture.cjs');
const { httpController } = require('./subscription-delivery-fixture.cjs');
test.after(() => F.regex.configuredRegex.close());

const cjk = '界';
function fixture(notesOnly = false) {
    const f = F.fixture({
        hosts: [F.host(1)],
        rules: [
            F.rule({
                remarks: [
                    cjk.repeat(500),
                    cjk.repeat(500),
                    cjk.repeat(450),
                    ...(notesOnly ? [] : ['{HOSTS}']),
                ],
            }),
        ],
    });
    f.settings.customRemarks.action = {
        text: cjk.repeat(500),
        buttonText: cjk.repeat(60),
        url: 'https://example.test/' + cjk.repeat(2048 - 'https://example.test/'.length),
    };
    assert(F.contract.CustomRemarksSchema.safeParse(f.settings.customRemarks).success);
    return f;
}

function read(url, maxHeaderSize = 16384) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, { maxHeaderSize }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('error', reject);
            response.on('end', () =>
                resolve({
                    status: response.statusCode,
                    headers: response.headers,
                    rawHeaders: response.rawHeaders,
                    body: Buffer.concat(chunks).toString(),
                }),
            );
        });
        request.setTimeout(15000, () => request.destroy(new Error('HTTP header fixture timeout')));
        request.on('error', reject);
    });
}

const decode = (value) => JSON.parse(Buffer.from(value, 'base64').toString());
function assertAction(response, action) {
    assert.equal(response.status, 200);
    assert.deepEqual(decode(response.headers['x-era-subscription-action']), action);
}
function assertParity(response) {
    const items = response.headers['x-era-subscription-presentation']
        ? decode(response.headers['x-era-subscription-presentation'])
        : [];
    const configs = JSON.parse(response.body);
    const expected = items.flatMap((item) => (item.kind === 'hosts' ? ['Host 1'] : [item.text]));
    assert.deepEqual(
        configs.map((config) => config.remarks),
        expected,
    );
    assert(
        response.rawHeaders.reduce((total, value) => total + Buffer.byteLength(value) + 2, 0) <
            16384,
    );
    return items;
}

test('real HTTP 16 KiB parser accepts active CJK notes and the unchanged maximum legacy HTTPS action', async () => {
    const f = fixture();
    const { app, base } = await httpController(f.service, f.settings);
    try {
        const response = await read(`${base}/api/sub/${f.user.shortUuid}/XRAY_JSON`);
        assertAction(response, f.settings.customRemarks.action);
        assert.deepEqual(
            assertParity(response).filter((item) => item.kind === 'hosts'),
            [{ kind: 'hosts' }],
        );
    } finally {
        await app.close();
    }
});

for (const type of ['MIHOMO', 'CLASH', 'STASH', 'SINGBOX'])
    test(`${type}: notes-only header compaction retains a valid notice with configured pools`, async () => {
        const pool = {
            mode: 'all',
            selectFrom: 'ALL',
            selector: { type: 'uuids', values: [F.uuid(11)] },
        };
        const group = { name: 'pool', type: 'select', proxies: [], remnawave: { pool } };
        const templates = {
            [type]:
                type === 'SINGBOX'
                    ? {
                          outbounds: [
                              { tag: 'pool', type: 'selector', outbounds: [], remnawave: { pool } },
                          ],
                          route: { final: 'pool' },
                      }
                    : { proxies: [], 'proxy-groups': [group], rules: ['MATCH,pool'] },
        };
        const source = fixture(true);
        const f = F.fixture({
            hosts: [F.host(1)],
            rules: source.settings.customRemarks.activeExpiry.rules,
            templates,
        });
        f.settings.customRemarks.action = source.settings.customRemarks.action;
        f.settings.customResponseHeaders.routing = 'r'.repeat(2800);
        const { app, base } = await httpController(f.service, f.settings);
        try {
            const response = await read(`${base}/api/sub/${f.user.shortUuid}/${type}`);
            assertAction(response, f.settings.customRemarks.action);
            const items = decode(response.headers['x-era-subscription-presentation']);
            assert(items.length > 0);
            assert(items.every((item) => item.kind === 'text'));
            const body =
                type === 'SINGBOX'
                    ? JSON.parse(response.body)
                    : require('js-yaml').load(response.body);
            const notes =
                type === 'SINGBOX'
                    ? body.outbounds.filter((entry) => entry.server).map((entry) => entry.tag)
                    : body.proxies.map((entry) => entry.name);
            assert.deepEqual(
                notes,
                items.map((item) => item.text),
            );
            assert(!response.body.includes('node-1.example.test'));
            assert(!response.body.includes('scoped-password'));
        } finally {
            await app.close();
        }
    });

test('plain active notes and a legacy maximum action remain compatible independently', async () => {
    const f = fixture();
    const action = f.settings.customRemarks.action;
    delete f.settings.customRemarks.action;
    const { app, base } = await httpController(f.service, f.settings);
    try {
        const plain = await read(`${base}/api/sub/${f.user.shortUuid}/XRAY_JSON`);
        assert.equal(plain.status, 200);
        assert.equal(assertParity(plain).length, 4);
        f.settings.customRemarks.action = action;
        delete f.settings.customRemarks.activeExpiry;
        const legacy = await read(`${base}/api/sub/${f.user.shortUuid}/XRAY_JSON`);
        assertAction(legacy, action);
        assert.equal(legacy.headers['x-era-subscription-presentation'], undefined);
    } finally {
        await app.close();
    }
});

test('aggregate budget preserves explicit routing, full action URLs and notes-only host suppression', async () => {
    for (const notesOnly of [false, true]) {
        const f = fixture(notesOnly);
        f.settings.customResponseHeaders.routing = 'r'.repeat(2500);
        const { app, base } = await httpController(f.service, f.settings);
        try {
            const response = await read(`${base}/api/sub/${f.user.shortUuid}/XRAY_JSON`);
            assertAction(response, f.settings.customRemarks.action);
            assert.equal(response.headers.routing, f.settings.customResponseHeaders.routing);
            const items = assertParity(response);
            assert(items.some((item) => item.kind !== 'hosts'));
            assert.equal(
                items.some((item) => item.kind === 'hosts'),
                !notesOnly,
            );
            if (notesOnly)
                assert(
                    !JSON.parse(response.body).some((config) =>
                        config.outbounds.some((outbound) =>
                            JSON.stringify(outbound).includes('node-1.example.test'),
                        ),
                    ),
                );
        } finally {
            await app.close();
        }
    }
});

test('long title and maximum action retain at least one warning beside the host marker', async () => {
    const f = fixture();
    f.settings.customResponseHeaders['profile-title'] = 't'.repeat(3000);
    const { app, base } = await httpController(f.service, f.settings);
    try {
        const response = await read(`${base}/api/sub/${f.user.shortUuid}/XRAY_JSON`);
        assertAction(response, f.settings.customRemarks.action);
        assert.equal(
            response.headers['profile-title'],
            f.settings.customResponseHeaders['profile-title'],
        );
        const items = assertParity(response);
        assert(items.some((item) => item.kind !== 'hosts'));
        assert.equal(items.filter((item) => item.kind === 'hosts').length, 1);
    } finally {
        await app.close();
    }
});

test('raw active delivery uses the same aggregate-bounded plan and intact global action', async () => {
    const f = fixture();
    const result = await f.service.getRawSubscriptionByShortUuid(
        f.user.shortUuid,
        false,
        null,
        'fixture',
    );
    assert(result.isOk);
    const response = result.response;
    assert.deepEqual(
        decode(response.headers['x-era-subscription-action']),
        f.settings.customRemarks.action,
    );
    const items = decode(response.headers['x-era-subscription-presentation']);
    assert.deepEqual(
        response.resolvedProxyConfigs.map((config) => config.finalRemark),
        items.flatMap((item) => (item.kind === 'hosts' ? ['Host 1'] : [item.text])),
    );
    assert.equal(items.filter((item) => item.kind === 'hosts').length, 1);
});
