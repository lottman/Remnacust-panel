const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const path=require('node:path');
const {readOptimizationStatus,OPTIMIZATION_STATUS_SCRIPT}=require('./load-typescript.cjs')(path.join(__dirname,'../src/modules/node-ssh/ssh/optimization-status.ts'));
function client(output,code=0){return{exec(command,cb){
    assert.equal(command,'bash -s');
    const stream=new EventEmitter();stream.stderr=new EventEmitter();stream.destroy=()=>{};
    stream.end=script=>{assert.equal(script,OPTIMIZATION_STATUS_SCRIPT);queueMicrotask(()=>{stream.emit('data',Buffer.from(output));stream.emit('close',code);});};
    cb(null,stream);
}};}
test('optimization state needs a successful verified SSH result, never an echoed command or error',async()=>{
    assert.equal(await readOptimizationStatus(client('balanced')), 'balanced');
    assert.equal(await readOptimizationStatus(client('none')), 'none');
    assert.equal(await readOptimizationStatus(client('performance',1)),null);
    assert.equal(await readOptimizationStatus(client('Applied safe.')),null);
    assert.equal(await readOptimizationStatus(client('x'.repeat(1000))),null);
    assert.equal(await readOptimizationStatus({exec:(_command,cb)=>cb(new Error('SSH failed'))}),null);
});
