const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');

function fixture(count = 100) {
    const node = {
        uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        instance: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        phase: 'ACTIVE',
        stage: 'ACTIVE',
        drained: new Date(0),
        legacyDrained: new Date(0),
    };
    const f = {
        now: 0,
        leaseOwner: null,
        leaseUntil: 0,
        inTransaction: false,
        state: {
            phase: 'ACTIVE',
            generation: 'generation',
            roster: [node.uuid],
            cursor: '0',
            error: null,
        },
        targets: Array.from({ length: count }, (_, i) => ({
            kind: 'USER',
            key: 'global',
            owner: String(i + 1),
            nodes: [node.uuid],
        })),
        funded: [],
        reconciled: [],
        renewals: 0,
        syncs: 0,
        onReconcile: async () => {},
        onFund: () => {},
        advanceTime: 0,
        discoveryTime: 0,
    };
    const users = Array.from({ length: count }, (_, i) => ({ id: String(i + 1) }));
    const sql = (strings, ...values) => ({
        execute: async () => {
            const source = strings.join('');
            if (source.includes('SET lease_owner=') && source.includes('RETURNING id')) {
                if (f.leaseOwner && f.leaseUntil >= f.now) return { rows: [] };
                f.leaseOwner = values[0];
                f.leaseUntil = f.now + 90000;
                return { rows: [{ id: 1 }] };
            }
            if (source.includes('SELECT id FROM xera_quota_coordinator')) {
                assert(f.inTransaction);
                return {
                    rows: f.leaseOwner === values[0] && f.leaseUntil > f.now ? [{ id: 1 }] : [],
                };
            }
            if (source.includes('SET lease_owner=NULL')) {
                if (f.leaseOwner === values[0]) {
                    f.leaseOwner = null;
                    f.leaseUntil = 0;
                }
            } else if (source.includes('SET lease_until=')) {
                assert(f.inTransaction);
                f.leaseUntil = f.now + 90000;
                f.renewals++;
            } else if (source.includes('SELECT id::text AS id FROM users')) {
                return {
                    rows: users.filter((user) => BigInt(user.id) > BigInt(values[0])).slice(0, 100),
                };
            } else if (source.includes('WITH owners AS')) {
                f.now += f.discoveryTime;
                return { rows: f.targets.filter((target) => values[0].includes(target.owner)) };
            } else if (source.includes('SELECT xera_fund_quota_targets')) {
                assert(f.inTransaction);
                const targets = JSON.parse(values[0]);
                f.onFund(targets);
                f.funded.push(...targets);
            } else if (source.includes('SET allocation_cursor=')) {
                assert(f.inTransaction);
                f.state.cursor = source.includes('SET allocation_cursor=0') ? '0' : values[0];
            } else if (source.includes('SET error_code=')) {
                f.state.error = values[0];
            } else if (!source.includes('INSERT INTO xera_quota_coordinator')) {
                assert.fail(`Unexpected SQL: ${source}`);
            }
            return { rows: [] };
        },
    });
    const { QuotaCoordinatorService } = load(
        path.join(__dirname, '../src/common/host-policy/quota-coordinator.service.ts'),
        {
            kysely: { sql },
            '@common/database': {},
            '@common/axios': {},
            './durable-usage.service': {},
            './host-policy.service': {},
            './quota-cutover.service': {},
            './quota-journal-checkpoint': { quotaRestoreState: async () => null },
            './quota-policy': {},
            './quota-transition.service': {},
            './usage-effects.service': {},
            './host-user-access-query': { hostUserAccessQuery: () => ({}) },
        },
        { performance: { now: () => f.now } },
    );
    f.service = () => {
        const service = new QuotaCoordinatorService(
            {},
            {
                isTransactionActive: () => f.inTransaction,
                withTransaction: async (_options, action) => {
                    assert.equal(f.inTransaction, false);
                    const snapshot = {
                        state: { ...f.state },
                        funded: [...f.funded],
                        leaseUntil: f.leaseUntil,
                    };
                    f.inTransaction = true;
                    try {
                        return await action();
                    } catch (error) {
                        Object.assign(f, snapshot);
                        throw error;
                    } finally {
                        f.inTransaction = false;
                    }
                },
            },
            {},
            { requestSync: () => f.syncs++ },
            {},
            {},
            {},
            {
                advancePending: async () => {
                    f.now += f.advanceTime;
                    return false;
                },
                reconcile: async (target) => {
                    assert.equal(
                        f.inTransaction,
                        false,
                        'reconciliation owns its standalone transactions',
                    );
                    f.reconciled.push(target.owner + ':' + target.key);
                    f.now += 1000;
                    return f.onReconcile(target);
                },
            },
        );
        service.state = async () => ({ ...f.state });
        service.nodes = async () => [{ ...node }];
        service.logger = { warn() {} };
        return service;
    };
    f.onReconcile = async () => true;
    return f;
}

test('one-second owners commit bounded progress before the 90-second lease expires', async () => {
    const f = fixture();
    assert.equal(await f.service().tick(), true);
    assert.equal(f.now, 20000);
    assert.equal(f.state.cursor, '20');
    assert.equal(f.funded.length, 20);
    assert.equal(f.state.error, null);
});

test('fresh scheduler instances resume committed owners fairly without repeating grants', async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) await f.service().tick();
    assert.equal(f.state.cursor, '100');
    assert.deepEqual(
        f.funded.map((target) => target.owner),
        Array.from({ length: 100 }, (_, i) => String(i + 1)),
    );
    assert.equal(new Set(f.reconciled).size, f.reconciled.length);
});

test('funding shares the tick budget with earlier transition work', async () => {
    const f = fixture();
    f.advanceTime = 19500;
    await f.service().tick();
    assert.equal(f.state.cursor, '1');
    assert.equal(f.funded.length, 1);
    assert.equal(f.now, 20500);
});

test('a large owner renews its fenced lease and commits all scopes together', async () => {
    const f = fixture(1);
    f.targets = Array.from({ length: 95 }, (_, i) => ({
        ...f.targets[0],
        kind: 'TAG',
        key: `tag-${i}`,
    }));
    await f.service().tick();
    assert.equal(f.now, 95000);
    assert.equal(f.state.cursor, '1');
    assert.equal(f.funded.length, 95);
    assert(f.renewals > 1);
});

test('lease takeover cannot fund, advance or reset the previous cursor or clear the new lease', async () => {
    const f = fixture(2);
    f.state.cursor = '1';
    f.onReconcile = async () => {
        f.leaseOwner = 'replacement';
        f.leaseUntil = f.now + 90000;
        return true;
    };
    await f.service().tick();
    assert.equal(f.state.cursor, '1');
    assert.deepEqual(f.funded, []);
    assert.equal(f.leaseOwner, 'replacement');
    assert.equal(f.state.error, null);
});

test('a replaced generation or phase cannot commit stale funding or cursor progress', async () => {
    for (const replacement of [{ generation: 'replacement' }, { phase: 'RECOVERY' }]) {
        const f = fixture(1);
        f.onReconcile = async () => {
            Object.assign(f.state, replacement);
            return true;
        };
        await f.service().tick();
        assert.deepEqual(f.funded, []);
        assert.equal(f.state.cursor, '0');
        assert.equal(f.state.error, null);
    }
});

test('a later owner rollback preserves earlier funding and resumes only uncommitted work', async () => {
    const f = fixture(3);
    f.onFund = (targets) => {
        if (targets.some((target) => target.owner === '2')) throw Error('rollback');
    };
    await f.service().tick();
    assert.equal(f.state.cursor, '1');
    assert.deepEqual(
        f.funded.map((target) => target.owner),
        ['1'],
    );
    f.onFund = () => {};
    await f.service().tick();
    assert.deepEqual(
        f.funded.map((target) => target.owner),
        ['1', '2', '3'],
    );
});

test('pending transitions and empty recipients cannot receive grants or stall later owners', async () => {
    const f = fixture(3);
    f.targets[1].nodes = [];
    f.onReconcile = async (target) => target.owner !== '1';
    await f.service().tick();
    assert.deepEqual(
        f.funded.map((target) => target.owner),
        ['3'],
    );
    assert.deepEqual(f.reconciled, ['1:global', '2:global', '3:global']);
});

test('an exhausted inner budget cannot reset the cursor or activate an allocating fleet', async () => {
    for (const phase of ['ACTIVE', 'ALLOCATING']) {
        const f = fixture(2);
        Object.assign(f.state, { phase, cursor: '1' });
        f.leaseOwner = 'lease';
        f.leaseUntil = 90000;
        const service = f.service();
        assert.equal(await service.step('lease', { ...f.state }, await service.nodes(), 0), true);
        assert.equal(f.state.cursor, '1');
        assert.equal(f.state.phase, phase);
        assert.deepEqual(f.funded, []);
    }
});

test('a competing scheduler cannot claim a lease between scope reconciliations', async () => {
    const f = fixture(1);
    f.onReconcile = async () => {
        assert.equal(await f.service().tick(), false);
        return true;
    };
    await f.service().tick();
    assert.equal(f.funded.length, 1);
});

test('an expired worker cannot renew its own lease or commit after a stalled reconciliation', async () => {
    const f = fixture(2);
    f.state.cursor = '1';
    f.onReconcile = async () => {
        f.now += 90000;
        return true;
    };
    await f.service().tick();
    assert.equal(f.state.cursor, '1');
    assert.deepEqual(f.funded, []);
    assert.equal(f.renewals, 1);
});

test('a changed cursor invalidates an outstanding allocation snapshot', async () => {
    const f = fixture(2);
    f.onReconcile = async () => {
        f.state.cursor = '2';
        return true;
    };
    await f.service().tick();
    assert.equal(f.state.cursor, '2');
    assert.deepEqual(f.funded, []);
    assert.equal(f.state.error, null);
});

test('a failed second funding chunk rolls back every scope and cursor for that owner', async () => {
    const f = fixture(1);
    f.targets = Array.from({ length: 501 }, (_, i) => ({
        ...f.targets[0],
        kind: 'TAG',
        key: `tag-${i}`,
    }));
    f.onReconcile = async () => {
        f.now -= 1000;
        return true;
    };
    f.onFund = (targets) => {
        if (targets.some((target) => target.key === 'tag-500')) throw Error('rollback');
    };
    await f.service().tick();
    assert.deepEqual(f.funded, []);
    assert.equal(f.state.cursor, '0');
    assert.equal(f.syncs, 0);
    f.onFund = () => {};
    await f.service().tick();
    assert.equal(f.funded.length, 501);
    assert(
        f.funded.every(
            (target) =>
                target.instances[target.nodes[0]] === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ),
    );
});

test('initial allocation checkpoints owners without adopting active transitions', async () => {
    const f = fixture(3);
    f.state.phase = 'ALLOCATING';
    f.leaseOwner = 'lease';
    f.leaseUntil = 90000;
    f.targets = f.targets.filter((target) => target.owner !== '2');
    const service = f.service();
    assert.equal(await service.fund('lease', { ...f.state }, await service.nodes()), true);
    assert.equal(f.state.cursor, '3');
    assert.deepEqual(
        f.funded.map((target) => target.owner),
        ['1', '3'],
    );
    assert.deepEqual(f.reconciled, []);
    assert.equal(f.state.phase, 'ALLOCATING');
});

test('slow target discovery still permits one owner checkpoint before yielding', async () => {
    const f = fixture(3);
    f.discoveryTime = 25000;
    await f.service().tick();
    assert.equal(f.state.cursor, '1');
    assert.deepEqual(
        f.funded.map((target) => target.owner),
        ['1'],
    );
    assert.equal(f.now, 26000);
});
