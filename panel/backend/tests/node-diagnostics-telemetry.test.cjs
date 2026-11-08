const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { NodeDiagnosticsService } = load(path.join(__dirname, '../src/modules/nodes/node-diagnostics.service.ts'), {
 '@common/axios': {}, '@common/raw-cache': {},
 '@contract/constants': { ERRORS: { NODE_ERROR_500_WITH_MSG: { code: 'N002' } } },
 '@common/helpers/error-handler.helper': { errorHandler: result => result.response },
 './node-port-plans.service': {},
 './queries/get-node-by-uuid/get-node-by-uuid.query': { GetNodeByUuidQuery: class {} },
});
test('statistics failure is separate from authenticated API and reported running-core evidence', async () => {
 for (const running of [true, false, undefined]) {
  const service = new NodeDiagnosticsService({execute:async()=>({response:{uuid:'fixture'}})}, {
   getSystemStats:async()=>({isOk:false,code:'N002',message:'Failed to get system stats'}),
   getNodeHealth:async()=>({isOk:true,response:{isAlive:true,xrayInternalStatusCached:running}}),
   connectionRoute:async()=>({status:'authenticated',activeAddress:'node.example.test'}),
  },{incrementWithTtl:async()=>1,get:async()=>null},{get:async()=>({status:'UNMANAGED'})});
  const report = await service.inspect('fixture');
  assert.deepEqual(report.checks[0],{id:'connection',status:'passed',code:'authenticated'});
  assert.equal(report.checks[1].status,running===true?'passed':'warning');
  assert.equal(report.checks[2].status,'skipped');
  assert.equal(report.connectionRoute.status,'authenticated');
 }
});
test('failed authentication or local pressure cannot be reported as a working management route', async () => {
 for(const failure of [{isOk:false,code:'NODE_ROUTE_BUSY'}, {isOk:false,code:'NODE_HTTP_401',message:'401'}]) {
  const service = new NodeDiagnosticsService({execute:async()=>({response:{uuid:'fixture'}})}, {
   getSystemStats:async()=>({isOk:false,code:'N002'}),getNodeHealth:async()=>failure,
   connectionRoute:async()=>({status:'unavailable',activeAddress:null}),
  },{incrementWithTtl:async()=>1,get:async()=>null},{get:async()=>({status:'UNMANAGED'})});
  const report=await service.inspect('fixture');
  assert.equal(report.checks[0].status,failure.code==='NODE_ROUTE_BUSY'?'warning':'failed');
  assert.equal(report.checks.some(check=>check.code==='xrayRunning'),false);
 }
});
