const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const load = require('./load-typescript.cjs');
process.env.APP_SECRET = 'compatibility-regression-test-only-secret';
const crypto = load(path.join(__dirname, '../src/common/utils/xera-crypto.ts'));
const { restoreUserCredentials, restoreStoredUserCredentials } = load(
    path.join(__dirname, '../src/common/utils/restore-user-credentials.ts'),
    { './xera-crypto': crypto },
);

test('credential envelopes reject tampering instead of becoming invalid client passwords', () => {
    const encrypted = crypto.encryptSecret('original-password');
    assert.equal(crypto.decryptSecret(encrypted), 'original-password');
    assert.equal(crypto.decryptSecret('plain-password'), 'plain-password');
    const bytes = Buffer.from(encrypted.slice(6), 'base64');
    bytes[bytes.length - 1] ^= 1;
    assert.throws(() => crypto.decryptSecret('xera1:' + bytes.toString('base64')), /original APP_SECRET/);
    assert.throws(() => crypto.decryptSecret('xera1:invalid'), /original APP_SECRET/);
});

test('repair preserves plaintext fields and processes the next page without offset skips', async () => {
    const pages = [
        [{ id: 1n, trojanPassword: crypto.encryptSecret('trojan'), ssPassword: 'plain-ss' }],
        [{ id: 9n, trojanPassword: 'plain-trojan', ssPassword: crypto.encryptSecret('ss') }],
        [],
    ];
    const writes = [], queries = [];
    const count = await restoreUserCredentials({
        users: { findMany: async query => { queries.push(query); return pages.shift(); } },
        $executeRaw: async statement => { writes.push(statement); return 1; },
    });
    assert.equal(count, 2);
    assert.equal(writes.length, 2);
    assert.equal(writes[0].values[0], 1n);
    assert.equal(writes[0].values[2], 'trojan');
    assert.equal(writes[0].values[4], 'plain-ss');
    assert.equal(writes[1].values[2], 'plain-trojan');
    assert.equal(writes[1].values[4], 'ss');
    assert.match(writes[0].sql, /u\.trojan_password = v\.old_trojan/);
    assert.ok(!writes[0].sql.includes('plain-ss'), 'Credentials must be SQL parameters');
    assert.deepEqual(queries[1].where.id, { gt: 1n });
    assert.deepEqual(queries[2].where.id, { gt: 9n });
    assert.equal(queries[0].take, 250);
});

test('one broken envelope prevents any writes from its batch', async () => {
    let writes = 0;
    await assert.rejects(() => restoreUserCredentials({ users: {
        findMany: async () => [
            { id: 1n, trojanPassword: crypto.encryptSecret('good'), ssPassword: 'plain' },
            { id: 2n, trojanPassword: 'xera1:broken', ssPassword: 'plain' },
        ],
    }, $executeRaw: async () => writes++ }), /original APP_SECRET/);
    assert.equal(writes, 0);
});

test('startup repair wraps all pages in one transaction and does not rewrite repaired users', async () => {
    let transactions = 0;
    const count = await restoreStoredUserCredentials({ $transaction: async (operation, options) => {
        transactions++;
        assert.equal(options.timeout, 300000);
        return operation({ users: { findMany: async () => [], update: () => assert.fail('unexpected write') } });
    } });
    assert.equal(count, 0);
    assert.equal(transactions, 1);
});
