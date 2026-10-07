const assert = require('node:assert/strict');
const { test } = require('node:test');
const { source, database, userFilter, reportFilter } = require('./upstream-filter-fixture.cjs');
const { XrayJsonGeneratorService } = source(
    'modules/subscription-template/generators/xray-json.generator.service.ts',
    {
        '../host-mapper': { applyHostMapper: (outbound) => outbound },
        '@common/utils': { isNonEmptyObject: (value) => value && Object.keys(value).length > 0 },
    },
);

for (const multiMode of [true, false]) {
    test(`gRPC subscription serializes multiMode=${multiMode} for Xray clients`, async () => {
        const generator = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => ({}) });
        const output = await generator.generateConfig({
            hosts: [{
                protocol: 'vless', address: 'grpc.example.com', port: 443,
                protocolOptions: { id: 'e2f7f158-fdd9-45ef-a675-c31db741030d', flow: '' },
                transport: 'grpc', transportOptions: { serviceName: 'tunnel', authority: 'grpc.example.com', multiMode },
                security: 'none', streamOverrides: {}, mux: {}, finalRemark: 'gRPC',
                metadata: { excludeFromSubscriptionTypes: [] },
                clientOverrides: { mapper: { xrayJson: null } },
            }],
            isExtendedClient: false,
        });
        const configs = JSON.parse(output);
        assert.equal(configs.length, 1);
        assert.deepEqual(configs[0].outbounds[0].streamSettings.grpcSettings, {
            serviceName: 'tunnel', authority: 'grpc.example.com', multiMode,
        });
    });
}

test('user ID filter uses an exact bigint parameter without losing precision', () => {
    const db = database();
    for (const value of ['12', '9007199254740993']) {
        const query = userFilter(db, 'id', value).compile();
        assert.match(query.sql, /where "users"\."id" = \$1$/);
        assert.deepEqual(query.parameters, [BigInt(value)]);
    }
});

test('invalid user ID never turns a filtered request into the entire user list', () => {
    const db = database();
    for (const value of ['invalid', '1.5', "1 OR 1=1", '12%']) {
        const query = userFilter(db, 'id', value).compile();
        assert.match(query.sql, /where false$/);
        assert.deepEqual(query.parameters, []);
    }
});

test('invalid Telegram ID returns no users rather than accounts without a Telegram ID', () => {
    const query = userFilter(database(), 'telegramId', 'invalid').compile();
    assert.match(query.sql, /where false$/);
    assert.deepEqual(query.parameters, []);
});

test('valid partial Telegram ID search keeps the existing contains behavior', () => {
    const query = userFilter(database(), 'telegramId', '123').compile();
    assert.match(query.sql, /CAST\(telegram_id AS TEXT\) like \$1$/);
    assert.deepEqual(query.parameters, ['%123%']);
});

for (const [id, column] of [['id', 'id'], ['userId', 'user_id'], ['nodeId', 'node_id']]) {
    test(`torrent report ${id} filter matches one bigint rather than a digit substring`, () => {
        const query = reportFilter(database(), id, '9007199254740993').compile();
        assert.ok(query.sql.endsWith(`where "torrent_blocker_reports"."${column}" = $1`), query.sql);
        assert.deepEqual(query.parameters, [9007199254740993n]);
    });
}

test('invalid numeric torrent filters produce an empty result without invalid SQL columns', () => {
    const db = database();
    for (const id of ['id', 'userId', 'nodeId']) {
        for (const value of ['invalid', '1.5', '12%']) {
            const query = reportFilter(db, id, value).compile();
            assert.match(query.sql, /where false$/);
            assert.deepEqual(query.parameters, []);
        }
    }
});

