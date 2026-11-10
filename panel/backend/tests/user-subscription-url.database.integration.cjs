const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');
const load = require('./load-typescript.cjs');
const { CustomCamelCasePlugin, JSON_COLUMNS } = load(
    path.join(__dirname, '../src/common/database/camel-case.plugin.ts'),
);
const { userSubscriptionDomainSelection } = load(
    path.join(__dirname, '../src/modules/users/repositories/user-subscription-domain-query.ts'),
);
const { subscriptionUserUrl } = load(
    path.join(__dirname, '../src/common/utils/subscription-domain-url.ts'),
);
const { SubscriptionDomainsService } = load(
    path.join(__dirname, '../src/modules/subscription-domains/subscription-domains.service.ts'),
    {
        '@common/config/app-config': {},
        '@common/database/prisma.service': {},
        '@libs/contracts/models/subscription-domain.schema': load(
            path.join(__dirname, '../libs/contract/models/subscription-domain.schema.ts'),
        ),
    },
);
const url = process.env.USER_SUBSCRIPTION_URL_TEST_DATABASE_URL;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test(
    'actual user domain SQL prefers only the assigned primary family CDN and matches visible selection',
    {
        skip: !url,
        timeout: 30000,
    },
    async () => {
        assert.equal(process.env.USER_SUBSCRIPTION_URL_TEST_DISPOSABLE, '1');
        assert.equal(new URL(url).hostname, '127.0.0.1');
        const db = new Kysely({
            dialect: new PostgresDialect({
                pool: new Pool({ connectionString: url, max: 1, statement_timeout: 5000 }),
            }),
            plugins: [new CustomCamelCasePlugin({ excludeColumns: JSON_COLUMNS })],
        });

        try {
            await db.transaction().execute(async (tx) => {
                await sql
                    .raw(
                        'CREATE TEMP TABLE users(id int, subscription_domain_uuid uuid) ON COMMIT DROP',
                    )
                    .execute(tx);
                await sql
                    .raw(`CREATE TEMP TABLE subscription_domains(uuid uuid PRIMARY KEY,name text,domain text,path text,kind text,
                    parent_uuid uuid,is_default boolean,access_mode text,redirect_domain_uuid uuid) ON COMMIT DROP`)
                    .execute(tx);
                const primaries = [1, 2].map((n) => ({
                    uuid: id(n),
                    name: `Primary ${n}`,
                    domain: `origin${n}.example.test`,
                    path: '/sub',
                    kind: 'PRIMARY',
                    parentUuid: null,
                    isDefault: n === 1,
                    accessMode: 'OPEN',
                    redirectDomainUuid: null,
                }));
                const cdn = {
                    ...primaries[0],
                    uuid: id(3),
                    name: 'CDN',
                    domain: 'cdn.example.test',
                    path: '/edge',
                    kind: 'CDN',
                    parentUuid: id(1),
                    isDefault: false,
                };
                const legacy = { ...cdn, uuid: id(4), domain: 'legacy.example.test' };
                await tx.insertInto('subscriptionDomains').values(primaries).execute();
                await tx
                    .insertInto('users')
                    .values([
                        { id: 1, subscriptionDomainUuid: null },
                        { id: 2, subscriptionDomainUuid: id(2) },
                    ])
                    .execute();
                const read = async () =>
                    tx
                        .selectFrom('users')
                        .select(['id'])
                        .select(userSubscriptionDomainSelection())
                        .orderBy('id')
                        .execute();
                let rows = await read();
                assert.equal(rows[0].subscriptionUrlBase, 'https://origin1.example.test/sub');
                assert.equal(rows[1].subscriptionUrlBase, 'https://origin2.example.test/sub');
                await tx.insertInto('subscriptionDomains').values(cdn).execute();
                await tx
                    .insertInto('users')
                    .values({ id: 3, subscriptionDomainUuid: cdn.uuid })
                    .execute();
                rows = await read();
                assert.equal(rows[0].subscriptionUrlBase, 'https://cdn.example.test/edge');
                assert.equal(rows[0].subscriptionDomain.uuid, id(1));
                assert.equal(rows[1].subscriptionUrlBase, 'https://origin2.example.test/sub');
                assert.equal(rows[2].subscriptionUrlBase, 'https://cdn.example.test/edge');
                await tx
                    .updateTable('subscriptionDomains')
                    .set({ isDefault: false })
                    .where('uuid', '=', id(1))
                    .execute();
                await tx
                    .updateTable('subscriptionDomains')
                    .set({ isDefault: true })
                    .where('uuid', '=', id(2))
                    .execute();
                rows = await read();
                assert.equal(rows[0].subscriptionUrlBase, 'https://origin2.example.test/sub');
                assert.equal(rows[2].subscriptionUrlBase, 'https://cdn.example.test/edge');
                await tx
                    .updateTable('subscriptionDomains')
                    .set({ isDefault: false })
                    .where('uuid', '=', id(2))
                    .execute();
                await tx
                    .updateTable('subscriptionDomains')
                    .set({ isDefault: true })
                    .where('uuid', '=', id(1))
                    .execute();
                await tx
                    .insertInto('subscriptionDomains')
                    .values([
                        legacy,
                        { ...legacy, uuid: id(5), domain: 'a-b.example.test' },
                        { ...legacy, uuid: id(6), domain: 'a.b.example.test' },
                    ])
                    .execute();
                assert.equal(
                    (await read())[0].subscriptionUrlBase,
                    'https://a-b.example.test/edge',
                );
                await tx
                    .updateTable('subscriptionDomains')
                    .set({ accessMode: 'REDIRECT', redirectDomainUuid: legacy.uuid })
                    .where('uuid', '=', id(1))
                    .execute();
                rows = await read();
                assert.equal(rows[0].subscriptionUrlBase, 'https://legacy.example.test/edge');
                assert.equal(rows[2].subscriptionUrlBase, 'https://cdn.example.test/edge');
                const checkLinks = async () => {
                    const domains = await tx
                        .selectFrom('subscriptionDomains')
                        .selectAll()
                        .execute();
                    const service = new SubscriptionDomainsService(
                        { subscriptionDomains: { findMany: async () => domains } },
                        { getOrThrow: () => 'fallback.example.test' },
                    );
                    for (const row of await read()) {
                        const assigned = row.id === 2 ? id(2) : row.id === 3 ? cdn.uuid : null;
                        const selected = (await service.userLinks(assigned, 'fixture')).links.find(
                            (link) => link.isSelected,
                        );
                        assert.equal(
                            selected?.url ?? '',
                            subscriptionUserUrl(
                                row.subscriptionDomain,
                                'fallback.example.test',
                                'fixture',
                                row.subscriptionUrlBase,
                            ),
                        );
                    }
                };
                await checkLinks();
                await tx
                    .updateTable('subscriptionDomains')
                    .set({ accessMode: 'BLOCKED' })
                    .where('kind', '=', 'CDN')
                    .execute();
                assert.equal((await read())[0].subscriptionUrlBase, '');
                await checkLinks();
                await tx
                    .updateTable('subscriptionDomains')
                    .set({ accessMode: 'OPEN', redirectDomainUuid: null })
                    .where('uuid', '=', id(1))
                    .execute();
                assert.equal(
                    (await read())[0].subscriptionUrlBase,
                    'https://origin1.example.test/sub',
                );
                await checkLinks();
                await tx
                    .updateTable('subscriptionDomains')
                    .set({ accessMode: 'BLOCKED' })
                    .where('uuid', '=', id(1))
                    .execute();
                await tx
                    .updateTable('subscriptionDomains')
                    .set({ accessMode: 'OPEN' })
                    .where('kind', '=', 'CDN')
                    .execute();
                assert.equal((await read())[0].subscriptionUrlBase, '');
                assert.equal((await read())[2].subscriptionUrlBase, '');
                await checkLinks();
                await tx.deleteFrom('users').execute();
                await tx.deleteFrom('subscriptionDomains').execute();
                await tx
                    .insertInto('users')
                    .values({ id: 1, subscriptionDomainUuid: null })
                    .execute();
                assert.equal((await read())[0].subscriptionUrlBase, null);
            });
        } finally {
            await db.destroy();
        }
    },
);

test(
    'competing API services create only one CDN and preserve existing credentials on rename',
    {
        skip: !url || process.env.USER_SUBSCRIPTION_CDN_LIMIT_TEST !== '1',
        timeout: 30000,
    },
    async () => {
        assert.equal(process.env.USER_SUBSCRIPTION_URL_TEST_DISPOSABLE, '1');
        assert.equal(new URL(url).hostname, '127.0.0.1');
        const { PrismaClient } = require('./prisma-test-client.cjs');
        const clients = [0, 1, 2].map(() => new PrismaClient({ datasourceUrl: url }));
        const parent = randomUUID();
        const services = clients.map(
            (client) =>
                new SubscriptionDomainsService(client, {
                    getOrThrow: () => 'fixture.example.test',
                }),
        );
        try {
            await clients[0].subscriptionDomains.create({
                data: {
                    uuid: parent,
                    name: 'CDN limit fixture',
                    domain: `${parent}.example.test`,
                    kind: 'PRIMARY',
                },
            });
            const results = await Promise.allSettled(
                services.map((service, i) =>
                    service.save(undefined, {
                        name: 'CDN ' + i,
                        domain: `${i}-${parent}.example.test`,
                        path: '',
                        kind: 'CDN',
                        parentUuid: parent,
                        isDefault: false,
                    }),
                ),
            );
            assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
            assert.equal(
                results.filter(
                    (result) =>
                        result.status === 'rejected' &&
                        result.reason.errorCode === 'SUBSCRIPTION_DOMAIN_CDN_LIMIT',
                ).length,
                2,
            );
            assert.equal(
                await clients[0].subscriptionDomains.count({
                    where: { parentUuid: parent },
                }),
                1,
            );
            const cdn = results.find((result) => result.status === 'fulfilled').value;
            const before = await services[0].credentials(cdn.uuid);
            await services[1].save(cdn.uuid, {
                name: 'Renamed',
                domain: cdn.domain,
                path: cdn.path,
                kind: 'CDN',
                parentUuid: parent,
                isDefault: false,
            });
            assert.deepEqual(await services[2].credentials(cdn.uuid), before);
        } finally {
            await clients[0].subscriptionDomains.deleteMany({
                where: { parentUuid: parent },
            });
            await clients[0].subscriptionDomains.deleteMany({ where: { uuid: parent } });
            await Promise.all(clients.map((client) => client.$disconnect()));
        }
    },
);
