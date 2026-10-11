const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const helpers = load(path.join(__dirname, '../src/common/utils/node-reconciliation.ts'));
const {NodeReconciliationGuard, NodeReconciliationController} = load(path.join(__dirname, '../src/modules/nodes/node-reconciliation.controller.ts'), {
    '@common/config/app-config': {}, '@common/raw-cache': {}, '@queue/_nodes': {},
    '@common/utils/node-reconciliation': helpers, './repositories/nodes.repository': {},
});
const uuid='00000000-0000-4000-8000-000000000001';
const secret='test-only-secret'.repeat(3);
const token=helpers.nodeReconciliationToken(secret,uuid);
const context=request=>({switchToHttp:()=>({getRequest:()=>request})});

test('node callback authentication is scoped to its own node and rejects API/admin tokens',async()=>{
    let reads=0;
    const guard=new NodeReconciliationGuard({getOrThrow:()=>secret},{findByUUID:async()=>{reads++;return {isDisabled:false,activeConfigProfileUuid:'profile',activeInbounds:[{}]};}});
    assert.equal(await guard.canActivate(context({params:{uuid},headers:{authorization:'Bearer '+token}})),true);
    for(const authorization of [undefined,'Bearer admin-jwt','Bearer '+token+'x','Basic '+token,'Bearer '+helpers.nodeReconciliationToken(secret,'00000000-0000-4000-8000-000000000002')]) {
        await assert.rejects(guard.canActivate(context({params:{uuid},headers:{authorization}})),e=>e.getStatus()===401);
    }
    assert.equal(reads,1,'invalid tokens must not cause database lookups');
    const attached=Reflect.getMetadata('__guards__',NodeReconciliationController);
    assert.ok(attached.includes(NodeReconciliationGuard));
});

test('disabled, unassigned and deleted nodes cannot request a refresh',async()=>{
    for(const node of [null,{isDisabled:true},{isDisabled:false,activeConfigProfileUuid:null},{isDisabled:false,activeConfigProfileUuid:'profile',activeInbounds:[]}]) {
        const guard=new NodeReconciliationGuard({getOrThrow:()=>secret},{findByUUID:async()=>node});
        await assert.rejects(guard.canActivate(context({params:{uuid},headers:{authorization:'Bearer '+token}})),e=>e.getStatus()===401);
    }
});

test('heartbeat does not restart nodes; reconnect requests are rate limited and never forced',async()=>{
    const queued=[];let count=0;
    const controller=new NodeReconciliationController({startNode:async task=>queued.push(task)},{incrementWithTtl:async(key,ttl)=>{assert.ok(key.endsWith(uuid));assert.equal(ttl,10);return ++count;}},{deviceStateRevision:async()=>'2'});
    assert.deepEqual(await controller.reconcile(uuid,{body:{refresh:true,revision:'2'}}),{accepted:true,refreshQueued:true,revision:'2'});
    assert.deepEqual(await controller.reconcile(uuid,{body:{refresh:true,revision:'2'}}),{accepted:true,refreshQueued:false,revision:'2'});
    assert.deepEqual(await controller.reconcile(uuid,{body:{refresh:false,revision:'2'}}),{accepted:true,refreshQueued:false,revision:'2'});
    assert.deepEqual(queued,[{nodeUuid:uuid}]);
});

test('enrollment only targets HTTPS and tokens cannot be reused after secret rotation',()=>{
    assert.equal(helpers.verifyNodeReconciliationToken(secret+'changed',uuid,token),false);
    const saved={APP_SECRET:process.env.APP_SECRET,PANEL_DOMAIN:process.env.PANEL_DOMAIN,FRONT_END_DOMAIN:process.env.FRONT_END_DOMAIN};
    try {
        process.env.APP_SECRET=secret;delete process.env.PANEL_DOMAIN;
        for(const domain of ['http://panel.example.com','https://user:pass@panel.example.com','https://panel.example.com/?token=x']) {
            process.env.FRONT_END_DOMAIN=domain;assert.equal(helpers.nodeReconciliationEnrollment(uuid),undefined);
        }
        process.env.FRONT_END_DOMAIN='panel.example.com';
        assert.deepEqual(helpers.nodeReconciliationEnrollment(uuid),{url:`https://panel.example.com/api/nodes/${uuid}/reconcile`,token,revision:'0'});
    } finally {for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('a stale start configuration is reconciled even after its deletion queue was acknowledged',async()=>{
    const queued=[];
    const controller=new NodeReconciliationController({startNode:async task=>queued.push(task)},{incrementWithTtl:async()=>1},{deviceStateRevision:async()=>'19'});
    const result=await controller.reconcile(uuid,{body:{refresh:false,revision:'18'}});
    assert.equal(result.refreshQueued,true);
    assert.deepEqual(queued,[{nodeUuid:uuid}]);
});
