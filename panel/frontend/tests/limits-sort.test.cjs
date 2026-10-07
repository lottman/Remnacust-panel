const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('../../backend-3.4.4-xera/tests/load-typescript.cjs');
const { sortLimitScopes } = load(path.join(__dirname, '../src/pages/dashboard/limits/limits-sort.ts'));
const row = (key, extra = {}) => ({kind:'HOST',key,name:key,limitBytes:'0',usedBytes:'0',viewPosition:0,speedLimitMbps:null,totalSpeedLimitMbps:null,...extra});
test('natural locale sorting handles numbers, Cyrillic and stable ties without mutating inputs', () => {
 const items=[row('a',{name:'Хост 10'}),row('b',{name:'Хост 2'}),row('c',{name:'Хост 2',kind:'TAG'})];
 assert.deepEqual(sortLimitScopes(items,'name','asc','ru').map(x=>x.key),['b','c','a']);
 assert.deepEqual(items.map(x=>x.key),['a','b','c']);
 assert.equal(sortLimitScopes(items,'name','desc','ru')[0].key,'a');
});
test('byte sorting retains precision beyond Number.MAX_SAFE_INTEGER; missing values remain last', () => {
 const items=[row('a',{usedBytes:'9007199254740993'}),row('b',{usedBytes:'9007199254740992'}),row('c',{usedBytes:undefined})];
 assert.deepEqual(sortLimitScopes(items,'usedBytes','asc','ru').map(x=>x.key),['b','a','c']);
 assert.deepEqual(sortLimitScopes(items,'usedBytes','desc','ru').map(x=>x.key),['a','b','c']);
});
test('zero and null limits are unlimited and sort last in either direction; host order remains available', () => {
 const items=[row('a',{limitBytes:'100',speedLimitMbps:2,viewPosition:2}),row('b',{limitBytes:'20',speedLimitMbps:10,viewPosition:1}),row('c')];
 assert.deepEqual(sortLimitScopes(items,'limitBytes','asc','ru').map(x=>x.key),['b','a','c']);
 assert.deepEqual(sortLimitScopes(items,'limitBytes','desc','ru').map(x=>x.key),['a','b','c']);
 assert.deepEqual(sortLimitScopes(items,'speedLimitMbps','asc','ru').map(x=>x.key),['a','b','c']);
 assert.deepEqual(sortLimitScopes(items,'position','asc','ru').map(x=>x.key),['c','b','a']);
});
