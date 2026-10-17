const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const N = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const I = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const deadline = new Date('2030-01-01T00:00:00Z');
function fixture() {
    const state = {
        rows: [A, B].map((id) => ({
            id,
            instance: I,
            group: 'host:fixture',
            owner: '901',
            ceiling: '300',
            expiresAt: deadline,
        })),
        cache: new Map(),
        settled: [],
        requests: [],
        commitsFail: false,
    };
    state.report = {
        instance: I,
        sequence: 3,
        policyRevision: '902',
        entries: state.rows.map((row, index) => ({
            id: row.id,
            group: row.group,
            owner: row.owner,
            expiresAt: deadline.getTime(),
            ceiling: '300',
            reserved: '123',
            closed: index === 0,
        })),
        missingIds: [],
        nextAfter: null,
    };
    const sql = (parts, ...values) => ({
        execute: async () => {
            if (parts.join('').includes('xera_settle_quota_reserve')) {
                if (state.commitsFail) throw Error('database unavailable');
                state.settled.push(values);
                return { rows: [] };
            }
            return { rows: state.rows };
        },
    });
    const { QuotaSettlementService } = load(
        path.join(__dirname, '../src/common/host-policy/quota-settlement.service.ts'),
        {
            kysely: { sql },
            '@common/database': {},
            '@common/axios': {},
            '@common/raw-cache': {},
        },
    );
    const service = new QuotaSettlementService(
        { kysely: {} },
        {
            hostQuotaState: async (node, body) => {
                state.requests.push(body);
                return state.unavailable ? { isOk: false } : { isOk: true, response: state.report };
            },
        },
        {
            get: async (key) => state.cache.get(key) ?? null,
            set: async (key, value) => state.cache.set(key, value),
            del: async (key) => state.cache.delete(key),
        },
        { withoutTransaction: async (fn) => fn() },
    );
    return { state, service, node: { uuid: N, address: '127.0.0.1', port: 1 } };
}
test('only sealed node entries settle; active and explicitly missing grants keep their credit', async () => {
    const { state, service, node } = fixture();
    assert.equal(await service.syncNode(node), 1);
    assert.equal(state.settled.length, 1);
    assert.equal(state.settled[0][0], A);
    assert.deepEqual(state.requests, [{ ids: [A, B] }]);
    state.settled.length = 0;
    state.report.entries = state.report.entries.filter((entry) => entry.id === B);
    state.report.missingIds = [A];
    assert.equal(await service.syncNode(node), 0);
    assert.equal(state.settled.length, 0);
});
test('a mixed response is fully validated before any SQL settlement can commit', async () => {
    for (const mutate of [
        (r) => r.entries.push({ ...r.entries[0] }),
        (r) => (r.entries[1].owner = '902'),
        (r) => (r.entries[1].group = 'tag:other'),
        (r) => r.entries[1].expiresAt++,
        (r) => (r.entries[1].reserved = '301'),
        (r) => (r.entries[1].ceiling = '301'),
        (r) => (r.entries[1].reserved = 'not-a-number'),
        (r) => (r.entries[1].id = '33333333-3333-4333-8333-333333333333'),
        (r) => (r.instance = B),
        (r) => (r.policyRevision = '0'),
        (r) => r.entries.pop(),
        (r) => (r.missingIds = [A]),
        (r) => (r.missingIds = [B]),
        (r) => (r.sequence = Number.MAX_SAFE_INTEGER + 1),
    ]) {
        const { state, service, node } = fixture();
        mutate(state.report);
        await assert.rejects(service.syncNode(node), /invalid|mismatch|inconsistent|incomplete/);
        assert.equal(state.settled.length, 0);
        assert.equal(state.cache.size, 0);
    }
});
test('an undelivered top-up does not invalidate a smaller, permanently sealed applied ceiling', async () => {
    const { state, service, node } = fixture();
    state.report.entries[0].ceiling = '200';
    assert.equal(await service.syncNode(node), 1);
    assert.equal(state.settled[0][5], '200');
});
test('unavailable nodes and failed commits cannot advance the settlement cursor', async () => {
    const { state, service, node } = fixture();
    state.unavailable = true;
    await assert.rejects(service.syncNode(node), /unavailable/);
    assert.equal(state.cache.size, 0);
    state.unavailable = false;
    state.commitsFail = true;
    await assert.rejects(service.syncNode(node), /database unavailable/);
    assert.equal(state.cache.size, 0);
    state.commitsFail = false;
    await service.syncNode(node);
    assert.equal(state.cache.size, 1);
    state.rows = [];
    await service.syncNode(node);
    assert.equal(state.cache.size, 0, 'End of the bounded scan wraps for the next pass');
    assert.equal(state.requests.length, 3, 'Empty scans do not call the node');
});
test('panels without issued reserves do not contact legacy nodes', async () => {
    const { state, service, node } = fixture();
    state.rows = [];
    assert.equal(await service.syncNode(node), 0);
    assert.equal(state.requests.length, 0);
});
