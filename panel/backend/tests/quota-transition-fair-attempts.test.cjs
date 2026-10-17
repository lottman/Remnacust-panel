const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');

function fixture() {
    const transition = { id: 'transition', generation: 'generation', phase: 'FENCING', kind: 'USER', key: 'global', owner: '1' };
    const entries = Array.from({ length: 17 }, (_, i) => ({
        uuid: String(i).padStart(2, '0'), id: String(i + 1), required: true,
        preflightAt: new Date(0), fencedAt: null, drainedAt: null,
        releaseReady: false, releasedAt: null, attempt: null,
    }));
    let clock = 0;
    const events = [];
    const sql = (strings, ...values) => ({ execute: async () => {
        if (strings.join('').includes('SET last_attempted_at')) {
            events.push('attempt-committed');
            assert.equal(values[0], transition.id);
            for (const uuid of values[1]) entries.find(entry => entry.uuid === uuid).attempt = ++clock;
        }
        return { rows: [] };
    }});
    const { QuotaTransitionService } = load(path.join(__dirname, '../src/common/host-policy/quota-transition.service.ts'), {
        kysely: { sql }, '@common/database': {}, '@common/axios': {},
        './durable-usage.service': {}, './host-policy.service': {},
        './quota-settlement.service': {}, './usage-effects.service': {},
    });
    const dependencies = [{}, { isTransactionActive: () => false }, {}, {}, {}, {}, {}];
    function coordinator() {
        const service = new QuotaTransitionService(...dependencies);
        service.read = async () => transition;
        service.participants = async () => entries.slice().sort((a, b) =>
            (a.attempt ?? -1) - (b.attempt ?? -1) || a.uuid.localeCompare(b.uuid)).map(entry => ({ ...entry }));
        service.write = async (_transition, action) => action();
        service.fence = async (_transition, participant) => {
            assert(events.includes('attempt-committed'), 'schedule must commit before network activity');
            events.push(participant.uuid);
            if (Number(participant.uuid) < 8) throw Error('TRANSITION_NODE_UNAVAILABLE');
            entries.find(entry => entry.uuid === participant.uuid).fencedAt = new Date();
        };
        return service;
    }
    return { coordinator, entries, events, transition };
}

test('offline first batch cannot starve later nodes, including after coordinator recreation', async () => {
    const f = fixture();
    assert.equal(await f.coordinator().advance(f.transition), false,
        'attempt ordering alone is not financial progress');
    assert.equal(f.entries.filter(entry => entry.fencedAt).length, 0);
    assert.equal(await f.coordinator().advance(f.transition), true);
    assert.equal(f.entries.filter(entry => entry.fencedAt).length, 8);
    await f.coordinator().advance(f.transition);
    assert.equal(f.entries.filter(entry => entry.fencedAt).length, 9);
    assert(f.events.includes('16'), 'last online node is eventually attempted');
    assert.equal(f.transition.phase, 'FENCING', 'unresolved required debt still blocks phase advance');
});

test('a superseded transition cannot launch the selected network batch', async () => {
    const f = fixture(), service = f.coordinator();
    service.write = async () => { throw Error('Quota transition was superseded'); };
    await assert.rejects(service.advance(f.transition), /superseded/);
    assert.deepEqual(f.events, []);
    assert(f.entries.every(entry => entry.attempt === null));
});
