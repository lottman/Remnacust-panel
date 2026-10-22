const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Kysely, PostgresDialect } = require('kysely');
const load = require('./load-typescript.cjs');
const filename = path.join(__dirname, '../src/modules/users/repositories/users.repository.ts');
const mocks = {};
for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
    if (!['kysely', 'kysely/helpers/postgres', 'dayjs', '@nestjs/common'].includes(match[1])) mocks[match[1]] = {};
}
mocks['@nestjs-cls/transactional'] = { Transactional: () => () => {} };
const { UsersRepository } = load(filename, mocks);

test('bulk deletion binds status and limit with the real PostgreSQL compiler and returns deleted count', async () => {
    const calls = [];
    let rowCount = 2;
    const client = { query: async (sql, parameters) => { calls.push({ sql, parameters }); return { command: 'DELETE', rowCount, rows: [] }; }, release() {} };
    const database = new Kysely({ dialect: new PostgresDialect({ pool: { connect: async () => client, end: async () => {} } }) });
    try {
        const repository = new UsersRepository({}, { kysely: database }, {});
        assert.equal(await repository.deleteManyByStatus('EXPIRED', 1), 2);
        assert.deepEqual(calls[0].parameters, ['EXPIRED', 1]);
        assert.match(calls[0].sql, /delete from "users".*where "status" = \$1 limit \$2/);
        rowCount = 0;
        const input = "EXPIRED' OR 1=1 --";
        assert.equal(await repository.deleteManyByStatus(input), 0);
        assert.deepEqual(calls[1].parameters, [input, 30000]);
        assert.equal(calls[1].sql.includes(input), false);
    } finally { await database.destroy(); }
});
