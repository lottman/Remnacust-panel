const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { compileNodeProfileGraphs } = load(path.join(__dirname, '../src/modules/nodes/profile-graph-plan.ts'));
const { compileNodePortPlan } = load(path.join(__dirname, '../src/modules/nodes/profile-port-plan.ts'));
const uuid = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const binding = (n, profile = n) => ({ uuid: uuid(n), configProfileUuid: uuid(profile), configProfileInboundUuid: uuid(profile + 100),
    inboundTag: 'SAME', listenAddress: '127.0.0.1', port: 20000 + n, networks: ['tcp'] });
const profile = n => ({ uuid: uuid(n), config: {
    dns: { hosts: { 'same.test': `192.0.2.${n}` }, tag: 'DNS' },
    policy: { levels: { 0: { handshake: n } } },
    log: { loglevel: n === 1 ? 'warning' : 'error' },
    inbounds: [{ tag: 'SAME', protocol: 'vless', port: 443, settings: { clients: [{ id: uuid(n + 1000) }], decryption: 'none' } },
        { tag: 'UNSELECTED', protocol: 'socks', port: 444, settings: { auth: 'noauth' } }],
    outbounds: [{ tag: 'direct', protocol: 'freedom', settings: {} }],
    routing: { script: 'profile-' + n + '.lua' },
    observatory: { subjectSelector: ['direct'], probeInterval: n + 's' },
    reverse: { bridges: [{ tag: 'bridge', domain: 'bridge.test' }] },
    api: { tag: 'API', services: ['HandlerService'] },
} });

test('identical tags, different DNS/policy/Lua/observers/reverse/API remain local without mutating editor sources', () => {
    const slots = [binding(1), binding(2)], profiles = [profile(1), profile(2)], before = structuredClone({ slots, profiles });
    const plan = compileNodeProfileGraphs(slots, profiles);
    assert.deepEqual({ slots, profiles }, before);
    assert.equal(plan.version, 'remnacust-profile-graphs-v1');
    assert.equal(plan.graphs.length, 2);
    for (let i = 0; i < 2; i++) {
        const graph = plan.graphs[i], expected = structuredClone(profiles[i].config);
        expected.inbounds = [{ ...expected.inbounds[0], listen: '127.0.0.1', port: 20001 + i }];
        assert.deepEqual(graph.config, expected, 'compiler must preserve the complete profile graph');
        assert.equal(graph.config.inbounds[0].tag, 'SAME');
        assert.equal(graph.config.outbounds[0].tag, 'direct');
        assert.equal(graph.bindingUuid, slots[i].uuid);
        assert.match(graph.hash, /^[a-f0-9]{64}$/);
    }
    assert.deepEqual(compileNodeProfileGraphs([...slots].reverse(), [...profiles].reverse()), plan);
    assert.throws(() => compileNodePortPlan(slots, profiles), error => error.code === 'DUPLICATE_INBOUND', 'legacy delivery must not pretend to support graph isolation');
});

test('one source inbound may be assigned to independent ports and each graph owns its object tree', () => {
    const plan = compileNodeProfileGraphs([binding(1), binding(2, 1)], [profile(1)]);
    plan.graphs[0].config.dns.hosts['same.test'] = 'changed';
    plan.graphs[0].config.inbounds[0].settings.clients.length = 0;
    assert.equal(plan.graphs[1].config.dns.hosts['same.test'], '192.0.2.1');
    assert.equal(plan.graphs[1].config.inbounds[0].settings.clients.length, 1);
});

test('per-graph hash identifies content and binding; unaffected B remains unchanged after A edit', () => {
    const profiles = [profile(1), profile(2)], slots = [binding(1), binding(2)];
    const before = compileNodeProfileGraphs(slots, profiles);
    profiles[0].config.policy.levels[0].handshake++;
    const after = compileNodeProfileGraphs(slots, profiles);
    assert.notEqual(after.hash, before.hash);
    assert.notEqual(after.graphs[0].hash, before.graphs[0].hash);
    assert.equal(after.graphs[1].hash, before.graphs[1].hash);
    slots[0].uuid = uuid(3);
    assert.notEqual(compileNodeProfileGraphs(slots, profiles).hash, after.hash);
});

test('node-wide socket conflicts, reserved sockets, duplicate binding IDs and forged networks still fail', () => {
    const a = binding(1), b = binding(2), profiles = [profile(1), profile(2)];
    for (const [code, slots, reserved] of [
        ['LISTENER_CONFLICT', [a, { ...b, port: a.port }]],
        ['RESERVED_LISTENER', [a], [{ listenAddress: '::', port: a.port, networks: ['tcp'] }]],
        ['DUPLICATE_BINDING', [a, { ...b, uuid: a.uuid }]],
        ['INVALID_BINDING', [{ ...a, networks: ['udp'] }]],
    ]) assert.throws(() => compileNodeProfileGraphs(slots, profiles, reserved), error => error.code === code);
});

test('process environment cannot leak across graphs; missing/duplicate native identities fail before delivery', () => {
    for (const [code, mutate] of [
        ['PROFILE_FEATURE_NEEDS_ISOLATION', p => p.config.env = { XRAY_BUF_SIZE: '32' }],
        ['INVALID_PROFILE', p => p.config.outbounds.push(structuredClone(p.config.outbounds[0]))],
        ['INVALID_PROFILE', p => p.config.inbounds.push(structuredClone(p.config.inbounds[0]))],
        ['INBOUND_MISSING', p => p.config.inbounds.shift()],
    ]) {
        const p = profile(1); mutate(p);
        assert.throws(() => compileNodeProfileGraphs([binding(1)], [p]), error => error.code === code);
    }
    assert.throws(() => compileNodeProfileGraphs([binding(1)], []), error => error.code === 'PROFILE_MISSING');
    assert.throws(() => compileNodeProfileGraphs([binding(1)], [profile(1), profile(1)]), error => error.code === 'INVALID_PROFILE');
});

test('native UDP transport occupancy is derived rather than trusted from a TCP payload', () => {
    const p = profile(1);
    p.config.inbounds[0].streamSettings = { network: 'hysteria', security: 'tls' };
    assert.throws(() => compileNodeProfileGraphs([binding(1)], [p]), error => error.code === 'INVALID_BINDING');
    const plan = compileNodeProfileGraphs([{ ...binding(1), networks: ['udp'] }], [p]);
    assert.equal(plan.graphs[0].config.inbounds[0].streamSettings.network, 'hysteria');
});
