const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('../../backend-3.4.4-xera/tests/load-typescript.cjs');
const { selectNodeTargets } = load(path.join(__dirname, '../src/features/dashboard/nodes/core-management/node-selection.ts'));
const { OptimizationRunner, optimizationCommand } = load(path.join(__dirname, '../src/shared/ui/forms/nodes/base-node-form/optimization-runner.ts'));
const id = '12345678-1234-4234-9234-123456789abc';
const data = s => new TextEncoder().encode(s);

test('node selection deduplicates and isolates all, tags, untagged and explicit IDs', () => {
 const nodes = [{uuid:'a',name:'A',tags:['ТГ','GPT']},{uuid:'b',name:'B',tags:['GPT']},{uuid:'c',name:'C',tags:[]}];
 const selected = (mode, tag, ids=[]) => selectNodeTargets([...nodes,nodes[0]],mode,tag,ids).map(n=>n.uuid);
 assert.deepEqual(selected('all'),['a','b','c']);
 assert.deepEqual(selected('tag','ТГ'),['a']);
 assert.deepEqual(selected('tag','GPT'),['a','b']);
 assert.deepEqual(selected('tag',null),[]);
 assert.deepEqual(selected('tag','empty'),[]);
 assert.deepEqual(selected('untagged'),['c']);
 assert.deepEqual(selected('selected',null,['c','a','missing']),['a','c']);
 assert.equal(nodes.length,3);
});

test('optimization result requires its own complete marker, never an echoed command', async () => {
 const runner = new OptimizationRunner(); let done=false;
 const command = optimizationCommand('exit 0\n','safe',id);
 const result = runner.run(id,command,()=>{}).then(()=>{done=true});
 runner.data(data(command));
 runner.data(data('\r\nXERA_OPT_RESULT_00000000-0000-4000-8000-000000000000:0\r\n'));
 await Promise.resolve(); assert.equal(done,false);
 const marker=`\r\nXERA_OPT_RESULT_${id}:0\r\n`;
 for (const char of marker) runner.data(data(char));
 await result; assert.equal(done,true);
});

test('failures, disconnects and deadlines are not successful; duplicate dispatch is rejected', async () => {
 const runner = new OptimizationRunner();
 const failed = runner.run(id,'command',()=>{});
 await assert.rejects(runner.run(id,'command',()=>{}),/already running/);
 runner.data(data(`\nXERA_OPT_RESULT_${id}:1\n`));
 await assert.rejects(failed,/exit 1/);
 const disconnected = runner.run(id,'command',()=>{});
 runner.cancel(); await assert.rejects(disconnected,/SSH connection closed/);
 await assert.rejects(runner.run(id,'command',()=>{},5),/No result received/);
 await assert.rejects(runner.run(id,'command',()=>{throw new Error('socket')}),/Could not send/);
});

test('shell command only accepts fixed profiles and IDs, and refuses interactive sudo', () => {
 assert.throws(()=>optimizationCommand('exit 0','safe; id',id),/Invalid/);
 assert.throws(()=>optimizationCommand('exit 0','safe',"';id;#"),/Invalid/);
 for(const level of ['none','safe','balanced','performance']) {
  const command=optimizationCommand('exit 0',level,id);
  assert.match(command,/sudo -n bash/);
  assert.match(command,/set -o pipefail/);
  assert.ok(command.includes(`apply ${level}`));
 }
});
