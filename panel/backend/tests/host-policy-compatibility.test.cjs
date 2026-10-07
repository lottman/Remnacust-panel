const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src');
const filename = path.join(root, 'modules/hosts/hosts.service.ts');
const mocks = {};
for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g))
    if (!['@nestjs/common', 'node:crypto'].includes(match[1])) mocks[match[1]] = {};
mocks['@nestjs-cls/transactional'] = { Transactional: () => () => {} };
mocks['./utils/validate-host-policy'] = load(path.join(root, 'modules/hosts/utils/validate-host-policy.ts'));
const destinations = load(path.join(root, 'common/host-policy/destination-rule.ts'));
mocks['@common/host-policy/destination-rule'] = destinations;
mocks['@common/host-policy/host-policy.service'] = {
    HOST_POLICY_VERSION: 'xera-host-policy-v2',
    normalizePolicyDomain: destinations.normalizeDestinationRule,
};
const { HostsService } = load(filename, mocks);
function fixture() {
    const host = id => ({uuid:id, configProfileInboundUuid:id, tags:[], nodes:[], userTrafficLimitBytes:100n,
        serverSpeedLimitMbps:0, totalSpeedLimitMbps:0, alwaysAvailable:false, onlyWhenInactive:false,
        trafficLimitResetValue:0, trafficLimitResetUnit:'DAYS'});
    const hosts = [host('latest'), host('ordinary')];
    const bindings = hosts.map(h=>({configProfileInboundUuid:h.uuid,nodeUuid:h.uuid}));
    const calls = [];
    const available = new Map([['latest', {supported:true,version:'xera-host-policy-v2',destinationRulesSupported:true}],
        ['ordinary',null]]);
    const service = new HostsService({findAll:async()=>hosts,managedPolicyHostIds:async()=>new Set(),policyBindings:async()=>bindings},
        {list:async()=>[]},{},{findAllNodes:async()=>[...available.keys()].map(uuid=>({uuid,name:uuid}))}, {},{},
        {hostPolicy:async node=>{calls.push(node.uuid);const response=available.get(node.uuid);return response?{isOk:true,response}:{isOk:false}}},{});
    return {service,hosts,bindings,calls,available};
}
test('updating a compatible host is independent of unrelated incompatible nodes', async()=>{
    const f=fixture();
    const before=f.hosts.map(h=>({...h})); f.hosts[0].userTrafficLimitBytes=200n;
    await f.service.syncExceptionPolicy(before);
    assert.deepEqual(f.calls,['latest']);
    await assert.rejects(f.service.validatePolicyState(f.hosts,[],true,new Set(['ordinary'])),e=>e.getStatus()===503);
});
test('all bindings of a protected inbound remain mandatory, including an explicitly excluded node', async()=>{
    const f=fixture();f.hosts[0].nodes=[{nodeUuid:'latest'}];
    f.bindings.push({configProfileInboundUuid:'latest',nodeUuid:'ordinary'});
    await assert.rejects(f.service.validatePolicyState(f.hosts,[],true,new Set(['latest'])),e=>e.getStatus()===503);
    assert.deepEqual(f.calls.sort(),['latest','ordinary']);
});
test('changing a reset policy probes compatibility, a cosmetic edit does not', async()=>{
    const f=fixture();let before=f.hosts.map(h=>({...h}));
    f.hosts[0].remark='New label';await f.service.syncExceptionPolicy(before);assert.deepEqual(f.calls,[]);
    before=f.hosts.map(h=>({...h}));f.hosts[0].trafficLimitResetValue=7;
    await f.service.syncExceptionPolicy(before);assert.deepEqual(f.calls,['latest']);
});
test('tag membership can be scoped without checking unrelated protected hosts', async()=>{
    const f=fixture();f.hosts[0].userTrafficLimitBytes=0n;f.hosts[0].tags=['group'];
    await f.service.validatePolicyState(f.hosts,[{tag:'group'}],true,new Set(['latest']));
    assert.deepEqual(f.calls,['latest']);
});
test('IP rule support and unavailable capabilities cannot be bypassed by scoping', async()=>{
    const f=fixture();f.hosts[0].domainRules={mode:'ALLOW_ONLY',domains:['192.0.2.0/24']};
    f.available.get('latest').destinationRulesSupported=false;
    await assert.rejects(f.service.validatePolicyState(f.hosts,[],true,new Set(['latest'])),e=>e.getStatus()===503);
    f.available.set('latest',null);
    await assert.rejects(f.service.validatePolicyState(f.hosts,[],true,new Set(['latest'])),e=>e.getStatus()===503);
});
