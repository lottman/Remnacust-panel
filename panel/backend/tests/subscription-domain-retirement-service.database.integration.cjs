const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { Client } = require('pg');
const { PrismaClient } = require('./prisma-test-client.cjs');
const load = require('./load-typescript.cjs');
const schema = load(path.join(__dirname, '../libs/contract/models/subscription-domain.schema.ts'));
const { SubscriptionDomainsService } = load(
    path.join(__dirname, '../src/modules/subscription-domains/subscription-domains.service.ts'),
    {
        '@common/config/app-config': {},
        '@common/database/prisma.service': {},
        '@libs/contracts/models/subscription-domain.schema': schema,
    },
);
const url = process.env.DOMAIN_RETIREMENT_SERVICE_DATABASE_URL;
if (url && new URL(url).pathname !== '/remnacust_test_domain_retirement')
    throw Error('A dedicated retirement database is required');
test(
    'real service serializes competing close requests and atomically retires a user-bound primary',
    { skip: !url, timeout: 30000 },
    async () => {
        const clients = [
            new PrismaClient({ datasourceUrl: url }),
            new PrismaClient({ datasourceUrl: url }),
        ];
        const observer = new Client({ connectionString: url });
        const services = clients.map(
            (p) => new SubscriptionDomainsService(p, { getOrThrow: () => 'fixture.example.test' }),
        );
        const input = (row) =>
            schema.SubscriptionDomainInputSchema.parse({
                name: row.name,
                domain: row.domain,
                path: row.path,
                kind: row.kind,
                parentUuid: row.parentUuid,
                isDefault: row.isDefault,
                accessMode: 'BLOCKED',
            });
        let pending = [];
        await observer.connect();
        try {
            const flags = (
                await observer.query(
                    'SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user',
                )
            ).rows[0];
            assert.deepEqual(flags, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });

            assert.equal(await clients[0].subscriptionDomains.count(), 0);
            const rows = await Promise.all(
                [0, 1].map((i) =>
                    clients[0].subscriptionDomains.create({
                        data: {
                            name: 'Primary ' + i,
                            domain: `primary-${i}.example.test`,
                            kind: 'PRIMARY',
                            isDefault: i === 1,
                        },
                    }),
                ),
            );
            await Promise.all(clients.map((client) => client.$queryRawUnsafe('SELECT 1')));
            await observer.query('BEGIN');
            await observer.query('SELECT pg_advisory_xact_lock(72626389)');
            pending = services.map((service, i) => service.save(rows[i].uuid, input(rows[i])));
            const settled = Promise.allSettled(pending);
            let waiters = 0;
            for (let i = 0; i < 100; i++) {
                waiters = Number(
                    (
                        await observer.query(
                            "SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.usename=current_user AND l.locktype='advisory' AND NOT l.granted AND l.objid=72626389::oid",
                        )
                    ).rows[0].count,
                );
                if (waiters >= 2) break;
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            if (waiters < 2) {
                await observer.query('ROLLBACK');
                const early = await settled;
                assert.fail(
                    'Expected two advisory-lock waiters; outcomes=' +
                        JSON.stringify(
                            early.map((result) =>
                                result.status === 'fulfilled'
                                    ? 'fulfilled'
                                    : {
                                          name: result.reason.constructor.name,
                                          code: result.reason.code,
                                          message: String(result.reason.message).slice(0, 160),
                                      },
                            ),
                        ),
                );
            }
            await observer.query('COMMIT');
            const outcomes = await settled;
            pending = [];
            assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
            const denied = outcomes.find((r) => r.status === 'rejected');
            assert.equal(denied.reason.message, 'SUBSCRIPTION_DOMAIN_LAST_PRIMARY');
            assert.equal(
                await clients[0].subscriptionDomains.count({
                    where: { kind: 'PRIMARY', accessMode: { not: 'BLOCKED' } },
                }),
                1,
            );
            await clients[0].subscriptionDomains.updateMany({ data: { accessMode: 'OPEN' } });
            const frozen = await clients[0].users.create({
                data: {
                    username: 'retirement_fixture',
                    shortUuid: 'retirement-fixture',
                    expireAt: new Date('2099-01-01'),
                    status: 'FROZEN',
                    frozenUntil: new Date('2099-01-01'),
                    frozenAt: new Date('2026-01-01'),
                    trafficLimitBytes: 123n,
                    trojanPassword: 'retained-fixture-password',
                    ssPassword: 'retained-fixture-key',
                    vlessUuid: '00000000-0000-4000-8000-000000000123',
                    subscriptionDomainUuid: rows[0].uuid,
                },
            });
            await assert.rejects(services[0].remove(rows[0].uuid));
            await services[0].remove(rows[0].uuid, { reassignUsers: true });
            const after = await clients[0].users.findUnique({ where: { id: frozen.id } });
            for (const [key, value] of Object.entries(frozen))
                if (!['subscriptionDomainUuid', 'updatedAt'].includes(key))
                    assert.deepEqual(after[key], value, key);
            assert.equal(after.subscriptionDomainUuid, null);
            assert.equal(
                await clients[0].subscriptionDomains.findUnique({ where: { uuid: rows[0].uuid } }),
                null,
            );
        } finally {
            await observer.query('ROLLBACK').catch(() => {});
            await Promise.allSettled(pending);
            await observer.end();
            await Promise.all(clients.map((p) => p.$disconnect()));
        }
    },
);
