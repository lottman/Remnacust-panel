const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src/common/host-policy');
function fixture(revisionAware = true) {
    const state = {
        active: false,
        events: [],
        failCommit: false,
        failSend: false,
        seen: [],
        recoveryProofs: [],
        caps: {
            version: 'xera-host-policy-v2',
            supported: true,
            policyRevisionsSupported: revisionAware,
            policyRevision: '9',
        },
    };
    const sql = (parts, ...values) => ({
        execute: async () => {
            if (parts.join('').includes('xera_next_host_policy_revision')) {
                state.seen.push(values);
                return { rows: [{ revision: '42' }] };
            }
            return { rows: [] };
        },
    });
    sql.join = (values) => values;
    const { HostPolicyService } = load(path.join(root, 'host-policy.service.ts'), {
        kysely: { sql },
        '@common/database': {},
        '@common/axios': {},
        '@common/raw-cache': {},
        '@common/config/app-config/typed-config.service': {},
        '@common/utils/host-identity': load(path.join(root, '../utils/host-identity.ts')),
        './host-policy-scopes': load(path.join(root, 'host-policy-scopes.ts')),
        './quota-policy': load(path.join(__dirname, '../src/common/host-policy/quota-policy.ts'), {kysely: {sql}}),
        './destination-rule': load(path.join(root, 'destination-rule.ts')),
    });
    const cache = require('./host-policy-cache.cjs')();
    const service = new HostPolicyService(
        { kysely: {} },
        {
            hostPolicy: async (_node, body, recoveryProof) => {
                if (!body) {
                    state.events.push('status');
                    return { isOk: true, response: state.caps };
                }
                state.events.push(['send', state.active, body]);
                state.recoveryProofs.push(recoveryProof);
                return state.failSend
                    ? { isOk: false }
                    : { isOk: true, response: { version: 'xera-host-policy-v2', applied: true } };
            },
        },
        cache,
        { getOrThrow: () => 'fixture-secret' },
        {
            isTransactionActive: () => state.active,
            withTransaction: async (_options, fn) => {
                state.active = true;
                state.events.push('begin');
                try {
                    const result = await fn();
                    if (state.failCommit) throw Error('commit failed');
                    state.events.push('commit');
                    return result;
                } finally {
                    state.active = false;
                }
            },
        },
    );
    service.scopes = async () => ({
        hosts: [],
        groups: [],
        identities: [],
        protectedInboundIds: new Set(),
    });
    return {
        state,
        service,
        node: { uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', address: '127.0.0.1', port: 1 },
    };
}
test('concurrent fleet refreshes coalesce and retain a follow-up pass for later mutations',async()=>{
    const {service}=fixture();let release;let passes=0;
    const gate=new Promise(resolve=>{release=resolve});
    service.synchronizeConnectedNodes=async()=>{passes++;if(passes===1)await gate;};
    const first=service.syncConnected();await Promise.resolve();const second=service.syncConnected();service.requestSync();
    assert.equal(passes,1,'Concurrent UI actions do not start parallel fleet scans');
    release();await Promise.all([first,second]);
    assert.equal(passes,2,'A mutation after the first scan began receives a new pass');
    await service.syncConnected();assert.equal(passes,3,'The finished task does not block later refreshes');
});
test('a burst before a fleet scan starts is served by a single pass',async()=>{
    const {service}=fixture();let passes=0;
    service.synchronizeConnectedNodes=async()=>{passes++;};
    await Promise.all(Array.from({length:100},()=>service.syncConnected()));
    assert.equal(passes,1);
});
test('background policy failure is logged and a later request can retry',async()=>{
    const {service}=fixture();const errors=[];let attempts=0;
    service.logger={error:message=>errors.push(message)};
    service.synchronizeConnectedNodes=async()=>{attempts++;if(attempts===1)throw Error('node unavailable');};
    service.requestSync();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(errors.length,1);assert.match(errors[0],/node unavailable/);
    await service.syncConnected();assert.equal(attempts,2);
});
test('revision-aware node delivery happens strictly after SQL commit', async () => {
    const { state, service, node } = fixture();
    await service.syncNode(node);
    assert.deepEqual(state.events.slice(0, 3), ['status', 'begin', 'commit']);
    assert.equal(state.events[3][0], 'send');
    assert.equal(state.events[3][1], false);
    assert.equal(state.events[3][2].revision, '42');
    assert.equal(
        state.seen[0][1],
        '9',
        'The node durable high-water mark participates in revision allocation',
    );
});
test('failed SQL commit never sends an allocated revision to a node', async () => {
    const { state, service, node } = fixture();
    state.failCommit = true;
    await assert.rejects(service.syncNode(node), /commit failed/);
    assert.equal(
        state.events.some((event) => Array.isArray(event) && event[0] === 'send'),
        false,
    );
});
test('legacy nodes retain locked delivery without receiving an unsupported revision field', async () => {
    const { state, service, node } = fixture(false);
    await service.syncNode(node);
    const send = state.events.find((event) => Array.isArray(event));
    assert.equal(send[1], true);
    assert.equal(Object.hasOwn(send[2], 'revision'), false);
    assert.equal(state.events.at(-1), 'commit');
    assert.deepEqual(state.seen, []);
});
test('failed delivery invalidates cached capabilities before retry', async () => {
    const { state, service, node } = fixture();
    state.failSend = true;
    await assert.rejects(
        service.syncNode(node),
        (error) => error.code === 'HOST_POLICY_NOT_APPLIED',
    );
    state.failSend = false;
    await service.syncNode(node);
    assert.equal(state.events.filter((event) => event === 'status').length, 2);
});
test('an active caller transaction, malformed revision or autonomous policy cannot be silently replaced', async () => {
    for (const reason of ['caller', 'revision', 'autonomous']) {
        const { state, service, node } = fixture();
        if (reason === 'caller') state.active = true;
        if (reason === 'revision') state.caps.policyRevision = '9223372036854775808';
        if (reason === 'autonomous') state.caps.offlineReserves = 'remnacust-quota-reserves-v1';
        await assert.rejects(
            service.syncNode(node),
            /after SQL commit|invalid saved policy revision|quota coordinator/,
        );
        assert.equal(state.events.includes('begin'), false);
        assert.equal(
            state.events.some((event) => Array.isArray(event)),
            false,
        );
    }
});


test('normal policy delivery binds released recovery before allocating a revision and keeps proof outside the policy',async()=>{
 const {state,service,node}=fixture();const helpers=load(path.join(root,'quota-recovery-policy.ts'));
 const generation='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',core='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',instance='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const record={version:'remnacust-quota-recovery-fence-v1',generation,token:core,state:'RELEASED',sequence:'2',previous:'a'.repeat(64)};
 record.digest=require('node:crypto').createHash('sha256').update([record.version,generation,core,record.state,'2',record.previous,''].join('\n')).digest('hex');
 Object.assign(state.caps,{quotaRecoveryPolicyBindingsRequired:true,quotaRecoveryPolicyBindingsSupported:true,quotaRecovery:{version:record.version,record},coreProcessId:core,quotaInstanceId:instance});
 await service.syncNode(node);assert.deepEqual(state.recoveryProofs,[helpers.recoveryPolicyTransportProof(state.caps)]);
 const body=state.events.find(e=>Array.isArray(e)&&e[0]==='send')[2];assert.equal(JSON.stringify(body).includes(record.digest),false);
 for(const mode of ['paused','missing','unsupported']){
  const f=fixture();Object.assign(f.state.caps,state.caps);
  if(mode==='paused'){const paused={...record,state:'FENCED',sequence:'1',previous:null};paused.digest=require('node:crypto').createHash('sha256').update([paused.version,generation,core,'FENCED','1','-',''].join('\n')).digest('hex');f.state.caps.quotaRecovery={version:record.version,record:paused};}
  if(mode==='missing')f.state.caps.quotaRecovery=null;
  if(mode==='unsupported')f.state.caps.quotaRecoveryPolicyBindingsSupported=false;
  await assert.rejects(f.service.syncNode(f.node));assert.equal(f.state.events.includes('begin'),false);assert.equal(f.state.seen.length,0);assert.equal(f.state.recoveryProofs.length,0);
 }
});
