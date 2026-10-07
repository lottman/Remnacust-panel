const fs = require('node:fs');
const path = require('node:path');
const k = require('kysely');
const load = require('./load-typescript.cjs');

function source(relative, overrides = {}) {
    const root = process.env.REMNACUST_TEST_SOURCE_ROOT ?? path.join(__dirname, '../src');
    const filename = path.join(root, relative);
    const mocks = {};
    for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
        if (match[1].startsWith('@common/') || match[1].startsWith('@modules/') ||
            match[1].startsWith('@libs/') || match[1].startsWith('@contract/') ||
            match[1].startsWith('prisma/') || match[1].startsWith('.')) {
            mocks[match[1]] = {};
        }
    }
    return load(filename, { ...mocks, ...overrides });
}

const { UsersRepository } = source('modules/users/repositories/users.repository.ts');
const { TorrentBlockerReportsRepository } = source(
    'modules/node-plugins/repositories/torrent-blocker-report.repository.ts',
);

function database() {
    return new k.Kysely({
        dialect: {
            createDriver: () => new k.DummyDriver(),
            createAdapter: () => new k.PostgresAdapter(),
            createIntrospector: (db) => new k.PostgresIntrospector(db),
            createQueryCompiler: () => new k.PostgresQueryCompiler(),
        },
        plugins: [new k.CamelCasePlugin()],
    });
}

function userFilter(db, id, value) {
    const repository = Object.create(UsersRepository.prototype);
    return repository.applyUsersFilters(db.selectFrom('users').select('users.id'), [{ id, value }]);
}

function reportFilter(db, id, value) {
    const repository = Object.create(TorrentBlockerReportsRepository.prototype);
    repository.qb = { kysely: db };
    return repository.applyFilters(repository.baseQb, [{ id, value }]);
}

module.exports = { source, database, userFilter, reportFilter };
