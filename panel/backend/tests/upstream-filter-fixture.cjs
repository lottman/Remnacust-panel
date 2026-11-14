const fs = require('node:fs');
const path = require('node:path');
const k = require('kysely');
const load = require('./load-typescript.cjs');

function source(relative, overrides = {}) {
    const root = process.env.REMNACUST_TEST_SOURCE_ROOT ?? path.join(__dirname, '../src');
    const filename = path.join(root, relative);
    const mocks = {};
    for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
        if (
            match[1].startsWith('@common/') ||
            match[1].startsWith('@modules/') ||
            match[1].startsWith('@libs/') ||
            match[1].startsWith('@contract/') ||
            match[1].startsWith('prisma/') ||
            match[1].startsWith('.')
        ) {
            mocks[match[1]] = {};
        }
    }
    for (const name of Object.keys(mocks)) {
        if (
            name.endsWith('/active-expiry-remarks') ||
            name.endsWith('/validate-custom-remarks') ||
            name.endsWith('/preserve-active-expiry-remarks')
        )
            mocks[name] = load(path.resolve(path.dirname(filename), name + '.ts'), {
                ...mocks,
                ...overrides,
                '@libs/contracts/models': require('../libs/contract/build/backend/models'),
                '@libs/contracts/models/subscription-settings/custom-remarks.schema': require('../libs/contract/build/backend/models/subscription-settings/custom-remarks.schema'),
            });
        if (name.endsWith('/template-geofile-policy'))
            mocks[name] = load(path.resolve(path.dirname(filename), name + '.ts'));
    }
    if (Object.hasOwn(mocks, './client-pool'))
        mocks['./client-pool'] = require('./client-pool-fixture.cjs').pool;
    if (Object.hasOwn(mocks, './subscription-output'))
        mocks['./subscription-output'] = load(
            path.join(path.dirname(filename), 'subscription-output.ts'),
            { './client-pool': require('./client-pool-fixture.cjs').pool },
        );
    if (Object.hasOwn(mocks, './priority-failover'))
        mocks['./priority-failover'] = load(
            path.join(path.dirname(filename), 'priority-failover.ts'),
            { './client-pool': require('./client-pool-fixture.cjs').pool },
        );
    if (Object.hasOwn(mocks, './response-time-probes'))
        mocks['./response-time-probes'] = load(
            path.join(path.dirname(filename), 'response-time-probes.ts'),
            { './client-pool': require('./client-pool-fixture.cjs').pool },
        );
    if (Object.hasOwn(mocks, './rendered-xray-routes'))
        mocks['./rendered-xray-routes'] = load(
            path.join(path.dirname(filename), 'rendered-xray-routes.ts'),
            { './client-pool': require('./client-pool-fixture.cjs').pool },
        );
    if (Object.hasOwn(mocks, './geofile-inline-limit'))
        mocks['./geofile-inline-limit'] = load(
            path.join(path.dirname(filename), 'geofile-inline-limit.ts'),
        );
    if (Object.hasOwn(mocks, './geofiles/xray-geofile-delivery'))
        mocks['./geofiles/xray-geofile-delivery'] = load(
            path.join(path.dirname(filename), 'geofiles/xray-geofile-delivery.ts'),
            {
                ...require('./client-pool-fixture.cjs').mocks,
                '../generators/client-pool': require('./client-pool-fixture.cjs').pool,
                './client-pool': require('./client-pool-fixture.cjs').pool,
            },
        );
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
