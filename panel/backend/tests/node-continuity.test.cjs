const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const load = require('./load-typescript.cjs');
const { checkNodeContinuity } = load(
    path.join(__dirname, '../src/common/host-policy/node-continuity.ts'),
);
const node = {
    uuid: '11111111-1111-4111-8111-111111111111',
    address: '192.0.2.1',
    port: 2222,
    proxyUrl: null,
    phase: 'ACTIVE',
    instance: '22222222-2222-4222-8222-222222222222',
    core: '33333333-3333-4333-8333-333333333333',
    userQuota: true,
    desiredRevision: '12',
    appliedRevision: '12',
    desiredSource: 'committed',
    appliedSource: 'committed',
    recovering: false,
    transitioning: false,
};
const status = {
    version: 'xera-host-policy-v2',
    supported: true,
    applied: true,
    offlineReserves: 'remnacust-quota-reserves-v1',
    userQuotaRequired: true,
    quotaInstanceId: node.instance,
    coreProcessId: node.core,
    policyRevision: '12',
    quotaRecoveryFencesSupported: true,
    quotaRecovery: { version: 'remnacust-quota-recovery-fence-v1', record: null },
};

test('maintenance requires live acknowledged autonomous policy, not ACTIVE in SQL alone', async () => {
    assert.equal(
        (
            await checkNodeContinuity(
                async () => [node],
                async () => status,
            )
        ).ready,
        true,
    );
    for (const patch of [
        { supported: false },
        { applied: false },
        { offlineReserves: undefined },
        { userQuotaRequired: false },
        { coreProcessId: '44444444-4444-4444-8444-444444444444' },
        { quotaInstanceId: undefined },
        { policyRevision: '11' },
        { quotaRecovery: { record: { state: 'FENCED' } } },
        { quotaRecovery: null },
        { quotaRecovery: undefined },
        { quotaRecovery: { version: 'remnacust-quota-recovery-fence-v1' } },
        { quotaRecoveryFencesSupported: false },
    ]) {
        const result = await checkNodeContinuity(
            async () => [node],
            async () => ({ ...status, ...patch }),
        );
        assert.equal(result.ready, false, JSON.stringify(patch));
    }
});

test('legacy, pending, restored and unmatched policy snapshots cannot authorize shutdown', async () => {
    for (const patch of [
        { phase: null },
        { phase: 'FENCING' },
        { userQuota: false },
        { recovering: true },
        { transitioning: true },
        { desiredRevision: '13' },
        { appliedSource: 'old' },
        { instance: null },
        { core: null },
    ]) {
        let calls = 0;
        const result = await checkNodeContinuity(
            async () => [{ ...node, ...patch }],
            async () => {
                calls++;
                return status;
            },
        );
        assert.equal(result.ready, false, JSON.stringify(patch));
        assert.equal(calls, 0);
    }
});

test('unreachable nodes fail closed and diagnostics never retain transport errors or credentials', async () => {
    const result = await checkNodeContinuity(
        async () => [node],
        async () => {
            throw Error('Bearer private-token https://private-panel');
        },
    );
    assert.deepEqual(result.issues, [{ node: node.uuid, code: 'NODE_UNREACHABLE' }]);
    assert.doesNotMatch(JSON.stringify(result), /private|Bearer|192\.0\.2/);
});

test('changes during a probe invalidate the proof and empty fleets remain upgradeable', async () => {
    let reads = 0;
    const result = await checkNodeContinuity(
        async () => (++reads === 1 ? [node] : [{ ...node, desiredRevision: '13' }]),
        async () => status,
    );
    assert.equal(result.ready, false);
    assert.equal(result.issues[0].code, 'NODE_POLICY_CHANGED');
    assert.deepEqual(
        await checkNodeContinuity(
            async () => [],
            async () => {
                throw Error('not called');
            },
        ),
        { ready: true, nodeCount: 0, issues: [] },
    );
});

test('large fleets are rejected and probes use at most eight concurrent connections', async () => {
    await assert.rejects(
        checkNodeContinuity(
            async () => Array(10001).fill(node),
            async () => status,
        ),
        /ROSTER_TOO_LARGE/,
    );
    let active = 0,
        maximum = 0;
    const result = await checkNodeContinuity(
        async () => Array(20).fill(node),
        async () => {
            maximum = Math.max(maximum, ++active);
            await new Promise((resolve) => setImmediate(resolve));
            active--;
            return status;
        },
    );
    assert.equal(result.ready, true);
    assert.equal(maximum, 8);
});

test('an expired final probe or database read cannot authorize an update', async () => {
    for (const stage of ['probe', 'read']) {
        let now = 0,
            reads = 0;
        await assert.rejects(
            checkNodeContinuity(
                async () => {
                    if (++reads === 2 && stage === 'read') now = 60000;
                    return [node];
                },
                async () => {
                    if (stage === 'probe') now = 24000;
                    return status;
                },
                { clock: () => now },
            ),
            /DEADLINE_EXCEEDED/,
        );
    }
});

test('an unavailable database is bounded even before the first snapshot', async () => {
    await assert.rejects(
        checkNodeContinuity(
            () => new Promise(() => {}),
            async () => status,
            { timeoutMs: 10 },
        ),
        /DEADLINE_EXCEEDED/,
    );
});

test('the update service uses the installed Prisma transaction driver and bounded probes', async () => {
    require('reflect-metadata');
    const {
        Kysely,
        PostgresAdapter,
        PostgresIntrospector,
        PostgresQueryCompiler,
    } = require('kysely');
    const {
        PrismaTxDriver,
    } = require('@kastov/nestjs-prisma-kysely/build/drivers/prisma-tx.driver.js');
    const { NodeContinuityService } = load(
        path.join(__dirname, '../src/common/host-policy/node-continuity.service.ts'),
        {
            '@common/axios': {},
            '@common/database': {},
        },
    );
    let active = false,
        transactions = 0,
        settings = 0,
        probes = 0;
    const host = {
        withTransaction: async (options, callback) => {
            assert.equal(options.timeout, 10000);
            assert.equal(options.maxWait, 2000);
            assert.equal(active, false);
            transactions++;
            active = true;
            try {
                return await callback();
            } finally {
                active = false;
            }
        },
        tx: {
            $executeRaw: async () => {
                assert.equal(active, true);
                settings++;
            },
            $queryRawUnsafe: async () => {
                assert.equal(active, true);
                return [node];
            },
        },
    };
    const db = new Kysely({
        dialect: {
            createDriver: () => new PrismaTxDriver(host),
            createAdapter: () => new PostgresAdapter(),
            createIntrospector: (database) => new PostgresIntrospector(database),
            createQueryCompiler: () => new PostgresQueryCompiler(),
        },
    });
    try {
        const service = new NodeContinuityService(
            { kysely: db },
            {
                hostPolicy: async (target, data, proof, maxBytes) => {
                    assert.equal(active, false, 'network requests must not hold SQL transactions');
                    assert.equal(target.uuid, node.uuid);
                    assert.equal(maxBytes, 4 * 1024 * 1024);
                    probes++;
                    return { isOk: true, response: status };
                },
            },
            host,
        );
        assert.equal((await service.check()).ready, true);
        assert.equal(transactions, 2);
        assert.equal(settings, 4);
        assert.equal(probes, 1);
    } finally {
        await db.destroy();
    }
});
