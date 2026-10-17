const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');

function fixture() {
    const entries = Array.from({ length: 17 }, (_, i) => ({ uuid: String(i).padStart(2, '0'), id: String(i + 1),
        stage: 'BOOTSTRAPPED', phase: 'ACTIVE', lastAttempt: null }));
    const state = { phase: 'ACTIVE', generation: 'g', roster: entries.map(entry => entry.uuid), cursor: '0', error: null };
    const events = [];
    let clock = 0;
    const sql = (strings, ...values) => ({ strings, values, execute: async () => {
        const source = strings.join('');
        if (source.includes('SELECT 1 FROM xera_quota_node_modes')) return { rows: [{}] };
        if (source.includes('INSERT INTO xera_quota_node_progress')) {
            for (const chunk of values[0].chunks) {
                entries.find(entry => entry.uuid === chunk.values[0]).lastAttempt = new Date(++clock);
            }
            events.push('attempt-committed');
        }
        if (source.includes("SET stage='ACTIVE'")) entries.find(entry => entry.uuid === values[0]).stage = 'ACTIVE';
        return { rows: [] };
    }});
    sql.join = chunks => ({ chunks });
    const { QuotaCoordinatorService } = load(path.join(__dirname, '../src/common/host-policy/quota-coordinator.service.ts'), {
        kysely: { sql }, '@common/database': {}, '@common/axios': {},
        './durable-usage.service': {}, './host-policy.service': {}, './quota-cutover.service': {},
        './quota-journal-checkpoint': {}, './quota-policy': {}, './quota-transition.service': {}, './usage-effects.service': {},
    });
    const policies = { syncNode: async node => {
        events.push(`network-${node.uuid}`);
        if (Number(node.uuid) < 8) throw Error('offline');
    }};
    const transitions = { advancePending: async () => { events.push('transition'); return false; } };
    function coordinator() {
        const service = new QuotaCoordinatorService({}, {}, {}, policies, {}, {}, {}, transitions);
        service.write = async (_owner, action) => action();
        service.state = async () => state;
        service.fund = async () => { events.push('fund'); return false; };
        return service;
    }
    return { entries, state, events, coordinator };
}

test('failed active policy delivery cannot block transitions or later online nodes after restart', async () => {
    const f = fixture();
    const nodes = () => f.entries.map(entry => ({ ...entry }));
    assert.equal(await f.coordinator().step('lease', f.state, nodes()), false);
    assert(f.events.indexOf('attempt-committed') < f.events.indexOf('network-00'));
    assert(f.events.includes('transition'));
    assert(!f.events.includes('fund'), 'initial unconfirmed delivery cannot initiate replacement grants');
    await f.coordinator().step('lease', f.state, nodes());
    assert.equal(f.entries.filter(entry => entry.stage === 'ACTIVE').length, 8);
    await f.coordinator().step('lease', f.state, nodes());
    assert.equal(f.entries.filter(entry => entry.stage === 'ACTIVE').length, 9);
    assert(f.entries.slice(0, 8).every(entry => entry.stage === 'BOOTSTRAPPED'), 'offline nodes never receive a false activation ACK');
});

test('generation or phase replacement prevents attempts from being committed', async () => {
    const f = fixture();
    for (const stale of [{ ...f.state, generation: 'old' }, { ...f.state, phase: 'FENCING' }]) {
        await assert.rejects(f.coordinator().batch('lease', stale, f.entries), /COORDINATOR_GENERATION_CHANGED/);
    }
    assert.deepEqual(f.events, []);
});
