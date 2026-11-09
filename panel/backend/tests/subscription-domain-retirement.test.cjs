const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
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
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = {
    name: 'fixture',
    domain: 'sub.example.test',
    path: '',
    kind: 'PRIMARY',
    parentUuid: null,
    accessMode: 'OPEN',
    redirectDomainUuid: null,
};
function fixture({
    otherMode = 'OPEN',
    child = false,
    noDefault = false,
    failDelete = false,
} = {}) {
    const rows = [
        { ...base, uuid: id(1), isDefault: false },
        {
            ...base,
            uuid: id(2),
            domain: 'new.example.test',
            isDefault: !noDefault,
            accessMode: otherMode,
        },
    ];
    if (child)
        rows.push({ ...base, uuid: id(3), kind: 'CDN', parentUuid: id(1), isDefault: false });
    const users = [
        { id: 1, subscriptionDomainUuid: id(1), status: 'FROZEN', quota: 12 },
        { id: 2, subscriptionDomainUuid: id(2), status: 'ACTIVE', quota: 34 },
    ];
    const match = (row, where) =>
        Object.entries(where ?? {}).every(([key, value]) =>
            value && typeof value === 'object' ? row[key] !== value.not : row[key] === value,
        );
    const repository = {
        findUnique: async ({ where }) => {
            const row = rows.find((r) => match(r, where));
            return row
                ? {
                      ...row,
                      _count: {
                          aliases: rows.filter((r) => r.parentUuid === row.uuid).length,
                          users: users.filter((u) => u.subscriptionDomainUuid === row.uuid).length,
                      },
                  }
                : undefined;
        },
        updateMany: async () => {},
        update: async ({ where, data }) => {
            const row = rows.find((r) => match(r, where));
            Object.assign(row, data);
            return { ...row, _count: { aliases: 0, users: 0 } };
        },
        findFirst: async ({ where }) => rows.find((r) => match(r, where)),
        count: async ({ where } = {}) => rows.filter((r) => match(r, where)).length,
        delete: async ({ where }) => {
            if (
                failDelete ||
                rows.some((r) => r.parentUuid === where.uuid) ||
                users.some((u) => u.subscriptionDomainUuid === where.uuid)
            )
                throw new Error('foreign-key');
            rows.splice(
                rows.findIndex((r) => match(r, where)),
                1,
            );
        },
    };
    const prisma = {
        subscriptionDomains: repository,
        $transaction: async (action) => {
            const oldRows = structuredClone(rows),
                oldUsers = structuredClone(users);
            try {
                return await action({
                    $executeRawUnsafe: async () => {},
                    subscriptionDomains: repository,
                    users: {
                        updateMany: async ({ where, data }) => {
                            let count = 0;
                            for (const u of users)
                                if (match(u, where)) {
                                    Object.assign(u, data);
                                    count++;
                                }
                            return { count };
                        },
                    },
                });
            } catch (e) {
                rows.splice(0, rows.length, ...oldRows);
                users.splice(0, users.length, ...oldUsers);
                throw e;
            }
        },
    };
    const service = new SubscriptionDomainsService(prisma, { getOrThrow: () => base.domain });
    return { service, rows, users };
}
test('confirmed removal of a previous primary reassigns only its users to the current default', async () => {
    const f = fixture();
    await f.service.remove(id(1), { reassignUsers: true });
    assert.equal(
        f.rows.some((r) => r.uuid === id(1)),
        false,
    );
    assert.deepEqual(f.users, [
        { id: 1, subscriptionDomainUuid: null, status: 'FROZEN', quota: 12 },
        { id: 2, subscriptionDomainUuid: id(2), status: 'ACTIVE', quota: 34 },
    ]);
});
test('legacy removal without explicit reassignment preserves assigned users', async () => {
    const f = fixture();
    await assert.rejects(f.service.remove(id(1)));
    assert.equal(f.rows.length, 2);
    assert.equal(f.users[0].subscriptionDomainUuid, id(1));
});
test('current default, missing default, blocked fallback and last available primary remain protected', async () => {
    const f = fixture();
    await assert.rejects(f.service.remove(id(2), { reassignUsers: true }));
    for (const opts of [{ noDefault: true }, { otherMode: 'BLOCKED' }]) {
        const x = fixture(opts);
        await assert.rejects(x.service.remove(id(1), { reassignUsers: true }));
        assert.equal(x.users[0].subscriptionDomainUuid, id(1));
        assert.equal(x.rows.length, 2);
    }
});
test('failed deletion with child CDNs or a concurrent FK conflict rolls back reassignment', async () => {
    for (const opts of [{ child: true }, { failDelete: true }]) {
        const f = fixture(opts);
        const before = structuredClone(f.users);
        await assert.rejects(f.service.remove(id(1), { reassignUsers: true }));
        assert.deepEqual(f.users, before);
        assert.ok(f.rows.some((r) => r.uuid === id(1)));
    }
});

test('blocking the last non-CDN primary is rejected even when it has CDNs', async () => {
    for (const otherMode of ['BLOCKED', 'ABSENT']) {
        const f = fixture({ otherMode, child: true });
        if (otherMode === 'ABSENT') f.rows.splice(1, 1);
        await assert.rejects(
            f.service.save(id(1), {
                ...base,
                domain: 'sub.example.test',
                isDefault: false,
                accessMode: 'BLOCKED',
            }),
            (e) => e.getStatus() === 409 && e.message === 'SUBSCRIPTION_DOMAIN_LAST_PRIMARY',
        );
        assert.equal(f.rows.find((r) => r.uuid === id(1)).accessMode, 'OPEN');
    }
    const f = fixture();
    const updated = await f.service.save(id(1), {
        ...base,
        domain: 'sub.example.test',
        isDefault: false,
        accessMode: 'BLOCKED',
    });
    assert.equal(updated.accessMode, 'BLOCKED');
    assert.equal(f.rows.find((r) => r.uuid === id(2)).accessMode, 'OPEN');
});

test('delete query requires an explicit true flag; false and malformed values never opt in', () => {
    const { DeleteSubscriptionDomainCommand } = require('../libs/contract/build/backend');
    const schema = DeleteSubscriptionDomainCommand.RequestQuerySchema;
    assert.equal(schema.parse({ reassignUsers: 'true' }).reassignUsers, true);
    assert.equal(schema.parse({ reassignUsers: 'false' }).reassignUsers, false);
    assert.equal(schema.parse({}).reassignUsers, undefined);
    for (const input of [
        { reassignUsers: 1 },
        { reassignUsers: 'yes' },
        { reassignUsers: ['true'] },
        { unknown: 'true' },
    ])
        assert.equal(schema.safeParse(input).success, false);
});
