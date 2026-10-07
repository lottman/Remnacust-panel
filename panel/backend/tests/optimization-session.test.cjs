const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');const {EventEmitter}=require('node:events');const load=require('./load-typescript.cjs');
function fixture(result,failSave=false){
 let reads=0,ended=0,closed=0;const saved=[];
 const {SshSession}=load(path.join(__dirname,'../src/modules/node-ssh/ssh/ssh-session.ts'),{
  './optimization-status':{readOptimizationStatus:async()=>{reads++;return result}},'@libs/contracts/models':{},'../interfaces':{},
  './browser-ssh-agent':{BrowserSshAgent:class{destroy(){}}},'./core-ssh-tunnel':{},
  './node-upgrade':load(path.join(__dirname,'../src/modules/node-ssh/ssh/node-upgrade.ts'))
 });
 const ws=new EventEmitter();ws.readyState=3;ws.terminate=()=>{};
 const session=new SshSession(ws,{onOptimizationStatus:async level=>{if(failSave)throw new Error('DB unavailable');saved.push(level)},onClosed:()=>closed++});
 session.client={end:()=>ended++};session.opened=true;session.startedAt=Date.now();
 return {session,saved,state:()=>({reads,ended,closed})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('closing immediately after apply reads the real profile once and closes SSH',async()=>{
 const f=fixture('performance');f.session.close('browser closed');f.session.close('duplicate');await tick();
 assert.deepEqual(f.saved,['performance']);assert.deepEqual(f.state(),{reads:1,ended:1,closed:1});
});
test('failed final SSH read does not erase last known state; revoked sessions do not run final commands',async()=>{
 const f=fixture(null);f.session.close('browser closed');await tick();assert.deepEqual(f.saved,[]);assert.equal(f.state().ended,1);
 const revoked=fixture('performance');revoked.session.terminate('revoked');await tick();assert.deepEqual(revoked.state(),{reads:0,ended:1,closed:1});
});
test('database failure during final read still closes SSH without an unhandled rejection',async()=>{
 const f=fixture('safe',true);f.session.close('browser closed');await tick();assert.equal(f.state().ended,1);assert.deepEqual(f.saved,[]);
});
