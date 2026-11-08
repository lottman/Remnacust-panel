const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { pool } = require('./client-pool-fixture.cjs');
const { materializePriority, MAX_PRIORITY_MEMBERS } = load(
    path.join(__dirname, '../src/modules/subscription-template/generators/priority-failover.ts'),
    { './client-pool': pool },
);
const template = () => ({
    outbounds: ['p', 'p-2', 'q', 'direct'].map((tag) => ({
        tag,
        protocol: tag === 'direct' ? 'freedom' : 'http',
        settings: { servers: [{ address: tag + '.test', port: 443 }] },
    })),
    routing: {
        balancers: [{ tag: 'auto', selector: ['q', 'p'], strategy: { type: 'priority' } }],
        rules: [
            { type: 'field', domain: ['blocked.test'], outboundTag: 'block' },
            { type: 'field', network: 'tcp,udp', balancerTag: 'auto' },
        ],
    },
    observatory: {
        subjectSelector: ['manual'],
        probeUrl: 'https://example.com/probe',
        probeInterval: '10s',
    },
});

function pick(config, alive, tag = 'auto') {
    for (let count = 0; count < MAX_PRIORITY_MEMBERS + 1; count++) {
        const balance = config.routing.balancers.find((item) => item.tag === tag);
        const outbound = config.outbounds.find((item) => item.tag === balance.selector[0]);
        if (alive.has(outbound.settings.servers[0].address))
            return outbound.settings.servers[0].address;
        const fallback = config.outbounds.find((item) => item.tag === balance.fallbackTag);
        if (fallback.protocol !== 'loopback') return fallback.protocol;
        tag = config.routing.rules.find((item) =>
            item.inboundTag?.includes(fallback.settings.inboundTag),
        ).balancerTag;
    }
    assert.fail('priority chain cycle');
}

test('priority strictly follows selector and outbound order, skips unavailable nodes and returns to primary', () => {
    const source = template(),
        snapshot = structuredClone(source),
        config = materializePriority(source);
    assert.deepEqual(source, snapshot, 'cached templates stay immutable');
    for (let index = 0; index < 20; index++)
        assert.equal(pick(config, new Set(['q.test', 'p.test', 'p-2.test'])), 'q.test');
    assert.equal(pick(config, new Set(['p.test', 'p-2.test'])), 'p.test');
    assert.equal(pick(config, new Set(['p-2.test'])), 'p-2.test');
    assert.equal(pick(config, new Set()), 'blackhole');
    assert.equal(pick(config, new Set(['q.test', 'p.test'])), 'q.test');
    assert.deepEqual(
        config.routing.rules.slice(-2),
        source.routing.rules,
        'manual restrictions remain',
    );
    assert.equal(config.observatory.probeUrl, source.observatory.probeUrl);
    assert.ok(config.observatory.subjectSelector.includes('manual'));
    assert.ok(config.routing.balancers.every((item) => item.strategy.type === 'leastPing'));
    const tags = config.outbounds.map((item) => item.tag);
    assert.equal(new Set(tags).size, tags.length);
    for (const balance of config.routing.balancers)
        assert.equal(
            tags.filter((tag) => tag.startsWith(balance.selector[0])).length,
            1,
            'prefix selection cannot collect another node',
        );
});

test('explicit final fallback and burst observation are preserved; absent observation is configured', () => {
    const source = template();
    source.routing.balancers[0].fallbackTag = 'direct';
    source.burstObservatory = {
        subjectSelector: ['p'],
        pingConfig: { destination: 'https://example.com/probe', interval: '1m', timeout: '5s' },
    };
    delete source.observatory;
    const config = materializePriority(source);
    assert.equal(pick(config, new Set()), 'freedom');
    assert.deepEqual(config.burstObservatory.pingConfig, source.burstObservatory.pingConfig);
    assert.equal(config.observatory, undefined);
    delete source.burstObservatory;
    assert.equal(materializePriority(source).observatory.probeInterval, '30s');
});

test('priority rejects unsafe or unbounded chains without changing the source', () => {
    const limit = template();
    limit.routing.balancers[0].selector = ['p'];
    limit.outbounds = Array.from({ length: MAX_PRIORITY_MEMBERS }, (_, index) => ({
        tag: 'p' + index,
        protocol: 'http',
        settings: { servers: [{ address: index + '.test', port: 443 }] },
    }));
    assert.equal(
        pick(materializePriority(limit), new Set()),
        'blackhole',
        'the maximum chain terminates without a cycle',
    );
    const script = template();
    script.routing.script = 'return nil';
    assert.throws(() => materializePriority(script), /priority-routing-script/);
    const broad = template();
    broad.routing.balancers.push({ tag: 'other', selector: [''], strategy: { type: 'random' } });
    assert.throws(() => materializePriority(broad), /priority-tag-conflict/);
    const missing = template();
    missing.routing.balancers[0].selector = ['missing'];
    assert.throws(() => materializePriority(missing), /priority-members-limit/);
    const empty = template();
    empty.routing.balancers[0].selector = [''];
    assert.throws(() => materializePriority(empty), /priority-selector/);
    const large = template();
    large.outbounds = Array.from({ length: MAX_PRIORITY_MEMBERS + 1 }, (_, i) => ({
        tag: 'p' + i,
        protocol: 'freedom',
    }));
    assert.throws(() => materializePriority(large), /priority-members-limit/);
    const fallback = template();
    fallback.routing.balancers[0].fallbackTag = 'missing';
    assert.throws(() => materializePriority(fallback), /priority-fallback/);
    const plain = {
        outbounds: [],
        routing: { balancers: [{ tag: 'other', strategy: { type: 'roundRobin' } }] },
    };
    assert.equal(materializePriority(plain), plain);
});

test('explicit round robin order survives native lexicographic tag selection, including ten or more hosts', () => {
    const source = {
        outbounds: Array.from({ length: 12 }, (_, index) => ({
            tag: index ? 'pool-' + (index + 1) : 'pool',
            protocol: 'http',
            settings: { servers: [{ address: 'host-' + index, port: 443 }] },
        })),
        routing: {
            balancers: [
                {
                    tag: 'auto',
                    selector: ['pool'],
                    strategy: { type: 'roundRobin', settings: { remnacustOrder: true } },
                },
            ],
        },
        observatory: { subjectSelector: ['pool'] },
    };
    const snapshot = structuredClone(source);
    const result = materializePriority(source);
    const balance = result.routing.balancers[0];
    const nativeTags = result.outbounds
        .filter((out) => balance.selector.some((prefix) => out.tag.startsWith(prefix)))
        .map((out) => out.tag)
        .sort();
    assert.deepEqual(
        nativeTags.map(
            (tag) => result.outbounds.find((out) => out.tag === tag).settings.servers[0].address,
        ),
        source.outbounds.map((out) => out.settings.servers[0].address),
    );
    assert.equal(balance.strategy.settings, undefined);
    assert(nativeTags.every((tag) => result.observatory.subjectSelector.includes(tag)));
    assert.deepEqual(source, snapshot);
    assert.equal(result.outbounds.length, 24);
});

test('ordered round robin respects pool prefix order, deduplicates and rejects empty or oversized selections', () => {
    const source = template();
    source.routing.balancers[0].strategy = {
        type: 'roundRobin',
        settings: { remnacustOrder: true },
    };
    const result = materializePriority(source);
    const tags = result.routing.balancers[0].selector;
    assert.deepEqual(
        tags.map(
            (tag) => result.outbounds.find((out) => out.tag === tag).settings.servers[0].address,
        ),
        ['q.test', 'p.test', 'p-2.test'],
    );
    for (const selector of [[], [''], ['missing']]) {
        const invalid = structuredClone(source);
        invalid.routing.balancers[0].selector = selector;
        assert.throws(() => materializePriority(invalid), /round-robin/);
    }
    const large = structuredClone(source);
    large.outbounds = Array.from({ length: 129 }, (_, i) => ({
        tag: 'p' + i,
        protocol: 'freedom',
    }));
    assert.throws(() => materializePriority(large), /members-limit/);
});
