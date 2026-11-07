const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');

const { postgresAdapter } = load(path.join(__dirname, '../src/common/database/postgres-adapter.ts'), {
    '@prisma/adapter-pg': { PrismaPg: class { constructor(config, options) { Object.assign(this, { config, options }); } } },
    '@prisma/client': {},
});

test('database adapter preserves explicit pool bounds and schema independently for each client', () => {
    const adapter = postgresAdapter('postgresql://fixture:fixture@localhost/db?connection_limit=1&pool_timeout=10&connect_timeout=3&schema=isolated&sslmode=verify-full');
    assert.equal(adapter.config.max, 1);
    assert.equal(adapter.config.connectionTimeoutMillis, 3000);
    assert.equal(adapter.options.schema, 'isolated');
    assert.equal(new URL(adapter.config.connectionString).searchParams.get('sslmode'), 'verify-full');
    assert(!adapter.config.connectionString.includes('connection_limit'));
    assert(!adapter.config.connectionString.includes('schema='));
    assert.equal(postgresAdapter('postgresql://localhost/db?connection_limit=2').config.max, 2);
    assert.equal(postgresAdapter('postgresql://localhost/db').config.max, 10);
});

test('invalid pool settings fail without echoing database credentials and zero wait still has a connection deadline', () => {
    for (const option of ['connection_limit=0','connection_limit=257','connection_limit=1.5','pool_timeout=-1','connect_timeout=0']) {
        assert.throws(() => postgresAdapter('postgresql://sensitive:credential@localhost/db?' + option), error => !error.message.includes('sensitive') && !error.message.includes('credential'));
    }
    assert.throws(() => postgresAdapter('https://localhost/db'), /protocol/);
    assert.throws(() => postgresAdapter('sensitive:credential@localhost'), error => !JSON.stringify(error).includes('credential'));
    assert.equal(postgresAdapter('postgresql://localhost/db?pool_timeout=0').config.connectionTimeoutMillis, 5000);
});
