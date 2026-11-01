const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const load = require('./load-typescript.cjs');

const CORE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEXT_CORE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INSTANCE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NEXT_INSTANCE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const hash = (node) =>
    createHash('sha256')
        .update(JSON.stringify([node.address, node.port, node.proxyUrl]))
        .digest('hex');
const capabilities = () => ({
    version: 'xera-host-policy-v2',
    supported: true,
    quotaReservesSupported: true,
    quotaRegistrationsSupported: true,
    quotaWatermarksSupported: true,
    quotaFencesSupported: true,
    policyRevisionsSupported: true,
    usageReceiptsSupported: true,
    coreIncarnationSupported: true,
    userQuotaReservesSupported: true,
    unreservedUsageSupported: true,
    coreProcessId: CORE,
    quotaInstanceId: INSTANCE,
});

function fixture(count = 2) {
    const nodes = Array.from({ length: count }, (_, index) => {
        const node = {
            uuid: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            id: String(index + 1),
            address: `127.0.0.${index + 1}`,
            port: null,
            proxyUrl: null,
            phase: null,
            instance: null,
            initialCore: null,
            observedCore: CORE,
            observedInstance: INSTANCE,
            stage: 'READY',
            lastAttempt: null,
        };
        return { ...node, connectionHash: hash(node) };
    });
    const f = {
        nodes,
        state: { phase: 'PREFLIGHT', generation: CORE, roster: [], cursor: '0', error: null },
        restore: null,
        rows: [],
        calls: [],
        committed: [],
        queries: [],
        now: 0,
        transaction: false,
        inFlight: 0,
        peak: 0,
        response: async () => ({ isOk: true, response: capabilities() }),
        onQuery: () => {},
    };
    let writes = [];
    const sql = (strings, ...values) => ({
        execute: async () => {
            const source = strings.join('');
            f.queries.push({ source, values });
            f.onQuery(source);
            if (source.includes('FROM nodes n LEFT JOIN xera_quota_node_progress'))
                return { rows: f.rows };
            if (source.includes('INSERT INTO xera_quota_node_modes'))
                writes.push({ uuid: values[0], core: values[1] });
            if (source.includes('UPDATE xera_quota_coordinator SET phase='))
                writes.push({ phase: values[0] });
            return { rows: [] };
        },
    });
    sql.join = (values) => values;
    const { QuotaCoordinatorService } = load(
        path.join(__dirname, '../src/common/host-policy/quota-coordinator.service.ts'),
        {
            kysely: { sql },
            '@common/database': {},
            '@common/axios': {},
            './durable-usage.service': {},
            './host-policy.service': { HOST_POLICY_VERSION: 'xera-host-policy-v2' },
            './quota-cutover.service': {},
            './quota-journal-checkpoint': { quotaRestoreState: async () => f.restore },
            './quota-policy': {},
            './quota-transition.service': {},
            './usage-effects.service': {},
        },
        { performance: { now: () => f.now } },
    );
    f.service = new QuotaCoordinatorService(
        {},
        {},
        {
            hostPolicy: async (node) => {
                assert.equal(
                    f.transaction,
                    false,
                    'live evidence must not hold SQL financial locks',
                );
                f.calls.push(node.uuid);
                f.peak = Math.max(f.peak, ++f.inFlight);
                try {
                    return await f.response(node);
                } finally {
                    f.inFlight--;
                }
            },
        },
        { syncNode: async (node) => f.committed.push({ delivered: node.uuid }) },
        {},
        {},
        {},
        {},
    );
    f.service.state = async () => ({ ...f.state });
    f.service.nodes = async () => f.nodes.map((node) => ({ ...node }));
    f.service.write = async (_owner, action) => {
        writes = [];
        f.transaction = true;
        try {
            const result = await action();
            f.committed.push(...writes);
            return result;
        } finally {
            f.transaction = false;
            writes = [];
        }
    };
    f.service.batch = async (_owner, _state, candidates) => candidates.slice(0, 8);
    f.preflight = () =>
        f.service.preflight(
            'lease',
            { ...f.state },
            f.nodes.map((node) => ({ ...node })),
        );
    return f;
}

test('cached READY is re-probed and a new node enrolls with its fresh core evidence', async () => {
    const f = fixture();
    f.response = async () => ({
        isOk: true,
        response: { ...capabilities(), coreProcessId: NEXT_CORE, quotaInstanceId: NEXT_INSTANCE },
    });
    await f.preflight();
    assert.deepEqual(
        f.calls,
        f.nodes.map((node) => node.uuid),
    );
    assert.deepEqual(f.committed, [
        ...f.nodes.map((node) => ({ uuid: node.uuid, core: NEXT_CORE })),
        { phase: 'FENCING' },
    ]);
    const evidence = f.queries.filter((query) => query.source.includes('SET observed_core='));
    assert.equal(evidence.length, 2);
    assert(
        evidence.every(
            (query) => query.values[0] === NEXT_CORE && query.values[1] === NEXT_INSTANCE,
        ),
    );
});

test('one unavailable or downgraded cached READY node prevents the entire fleet fence', async () => {
    for (const reply of [
        { isOk: false },
        { isOk: true, response: { ...capabilities(), unreservedUsageSupported: false } },
        { isOk: true, response: { ...capabilities(), quotaInstanceId: 'invalid' } },
    ]) {
        const f = fixture();
        f.response = async (node) =>
            node.id === '2' ? reply : { isOk: true, response: capabilities() };
        await assert.rejects(f.preflight(), /NODE_UNAVAILABLE|NODE_UPGRADE_REQUIRED/);
        assert.deepEqual(f.committed, []);
        assert.equal(f.transaction, false);
    }
});

test('existing FENCING core and journal bindings cannot be rebased during preflight', async () => {
    for (const change of [{ coreProcessId: NEXT_CORE }, { quotaInstanceId: NEXT_INSTANCE }]) {
        const f = fixture(1);
        Object.assign(f.nodes[0], { phase: 'FENCING', initialCore: CORE, instance: INSTANCE });
        f.response = async () => ({ isOk: true, response: { ...capabilities(), ...change } });
        await assert.rejects(f.preflight(), /INITIAL_CORE_CHANGED|QUOTA_INSTANCE_CHANGED/);
        assert.deepEqual(f.committed, []);
    }
});

test('first fence can create a journal, but malformed core or instance evidence cannot enroll', async () => {
    const f = fixture(1);
    f.response = async () => ({
        isOk: true,
        response: { ...capabilities(), quotaInstanceId: null },
    });
    await f.preflight();
    assert.equal(f.committed.at(-1).phase, 'FENCING');
    for (const coreProcessId of [null, 'invalid']) {
        const invalid = fixture(1);
        invalid.response = async () => ({
            isOk: true,
            response: { ...capabilities(), coreProcessId },
        });
        await assert.rejects(invalid.preflight(), /NODE_UPGRADE_REQUIRED/);
        assert.deepEqual(invalid.committed, []);
    }
});

test('fresh fleet revalidation limits concurrent I/O to eight and retains all participants', async () => {
    const f = fixture(17);
    await f.preflight();
    assert.equal(f.peak, 8);
    assert.equal(new Set(f.calls).size, 17);
    assert.equal(f.committed.filter((entry) => entry.uuid).length, 17);
});

test('expired evidence, including time waiting for SQL locks, cannot commit a fence', async () => {
    for (const expireAt of ['network', 'lock', 'insert']) {
        const f = fixture(1);
        f.response = async () => {
            if (expireAt === 'network') f.now = 20000;
            return { isOk: true, response: capabilities() };
        };
        f.onQuery = (source) => {
            if (
                (expireAt === 'lock' && source.includes('xera_lock_usage_nodes')) ||
                (expireAt === 'insert' && source.includes('INSERT INTO xera_quota_node_modes'))
            )
                f.now = 20000;
        };
        await assert.rejects(f.preflight(), /PREFLIGHT_EVIDENCE_EXPIRED/);
        assert.deepEqual(f.committed, []);
    }
});

test('generation, endpoint, roster or persisted financial binding changes invalidate fresh evidence', async () => {
    for (const change of [
        (f) => {
            f.state.generation = NEXT_CORE;
        },
        (f) => {
            f.nodes[0].address = '127.0.1.1';
        },
        (f) => {
            f.nodes.pop();
        },
        (f) => {
            f.nodes[0].instance = NEXT_INSTANCE;
        },
    ]) {
        const f = fixture();
        let changed = false;
        f.response = async () => {
            if (!changed) {
                changed = true;
                change(f);
            }
            return { isOk: true, response: capabilities() };
        };
        await assert.rejects(f.preflight(), /COORDINATOR_GENERATION_CHANGED|NODE_SET_CHANGED/);
        assert.deepEqual(f.committed, []);
    }
});

test('actual FENCING delivery rechecks the bound core and observed journal before sending policy', async () => {
    for (const change of [{ coreProcessId: NEXT_CORE }, { quotaInstanceId: NEXT_INSTANCE }]) {
        const f = fixture(1);
        Object.assign(f.nodes[0], { phase: 'FENCING', initialCore: CORE, instance: null });
        Object.assign(f.state, { phase: 'FENCING', roster: f.nodes.map((node) => node.uuid) });
        f.response = async () => ({ isOk: true, response: { ...capabilities(), ...change } });
        await assert.rejects(
            f.service.step('lease', f.state, f.nodes),
            /INITIAL_CORE_CHANGED|QUOTA_INSTANCE_CHANGED/,
        );
        assert.deepEqual(f.committed, []);
    }
});

function statusFixture() {
    const f = fixture();
    Object.assign(f.state, { phase: 'ACTIVE', roster: f.nodes.map((node) => node.uuid) });
    f.rows = f.nodes.map((node) => ({
        ...node,
        name: 'node',
        stage: 'ACTIVE',
        mode: 'ACTIVE',
        error: null,
        checkedAt: new Date(0),
        ready: true,
    }));
    return f;
}

test('status includes serving nodes without progress and cannot infer readiness from global ACTIVE', async () => {
    const f = statusFixture();
    Object.assign(f.rows[1], {
        stage: 'PREFLIGHT',
        mode: null,
        checkedAt: null,
        ready: false,
        connectionHash: null,
    });
    const status = await f.service.status();
    assert.equal(status.phase, 'ACTIVE');
    assert.equal(status.ready, false);
    assert.equal(status.nodes.length, 2);
    assert.equal(status.nodes[1].checkedAt, null);
    assert.equal(status.nodes[1].ready, false);
    assert(!Object.hasOwn(status.nodes[0], 'address'));
    assert(!Object.hasOwn(status.nodes[0], 'proxyUrl'));
});

test('status readiness requires persisted node acknowledgement, matching roster and endpoint, and no recovery/error', async () => {
    const good = statusFixture();
    assert.equal((await good.service.status()).ready, true);
    for (const change of [
        (f) => {
            f.rows[0].ready = false;
        },
        (f) => {
            f.rows[0].address = '127.0.1.1';
        },
        (f) => {
            f.state.roster.pop();
        },
        (f) => {
            f.state.phase = 'ALLOCATING';
        },
        (f) => {
            f.state.error = 'RETRY_REQUIRED';
        },
        (f) => {
            f.restore = { reconciledAt: null };
        },
        (f) => {
            f.service.state = async () => undefined;
        },
    ]) {
        const f = statusFixture();
        change(f);
        assert.equal((await f.service.status()).ready, false);
    }
});

test('status refuses a truncated serving roster rather than claiming readiness', async () => {
    const f = statusFixture();
    f.rows = Array(10001).fill(f.rows[0]);
    await assert.rejects(f.service.status(), /NODE_ROSTER_TOO_LARGE/);
});
