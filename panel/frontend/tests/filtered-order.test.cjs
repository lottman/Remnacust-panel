const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
    const source = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/shared/utils/',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    const m={exports:{}};new Function('exports','module',source)(m.exports,m);return m.exports;
}
const {mergeVisibleOrder}=load('merge-visible-order.ts');
const {matchesHostStatus}=load('host-status-filter.ts');
const records=['a','b','c','d','e'].map(uuid=>({uuid,value:uuid}));
test('dragging inside a tag preserves every slot outside that tag',()=>{
    const result=mergeVisibleOrder(records,[records[4],records[0],records[2]]);
    assert.deepEqual(result.map(x=>x.uuid),['e','b','a','d','c']);
    assert.equal(result[1],records[1]);assert.equal(result[3],records[3]);
});
test('a reordered visible record retains the newest full-list metadata',()=>{
    const updated=records.map(x=>({...x,value:'new'}));
    assert(mergeVisibleOrder(updated,[records[2],records[0]]).every(x=>x.value==='new'));
});
test('stale and duplicate drag records cannot lose or invent records',()=>{
    assert.equal(mergeVisibleOrder(records,[{uuid:'missing'}]),records);
    assert.equal(mergeVisibleOrder(records,[records[0],records[0]]),records);
    assert.deepEqual(mergeVisibleOrder(records,[]),records);
});
test('all-list reordering and first/last tag positions work',()=>{
    assert.deepEqual(mergeVisibleOrder(records,[...records].reverse()).map(x=>x.uuid),['e','d','c','b','a']);
    assert.deepEqual(mergeVisibleOrder(records,[records[4],records[0]]).map(x=>x.uuid),['e','b','c','d','a']);
});
test('visibility and enabled filters reflect separate host flags',()=>{
    const enabled={isHidden:true,isDisabled:false};
    const disabled={isHidden:false,isDisabled:true};
    assert(matchesHostStatus(enabled,'hidden'));assert(matchesHostStatus(enabled,'enabled'));
    assert(!matchesHostStatus(disabled,'hidden'));assert(matchesHostStatus(disabled,'disabled'));
    assert(!matchesHostStatus(enabled,'disabled'));assert(matchesHostStatus(disabled,'all'));
    for(const isDisabled of [false,true])for(const isHidden of [false,true]){
        const host={isDisabled,isHidden};
        assert.equal(matchesHostStatus(host,'visible'),!isHidden);
        assert.equal(matchesHostStatus(host,'hidden'),isHidden);
        assert.equal(matchesHostStatus(host,'enabled'),!isDisabled);
        assert.equal(matchesHostStatus(host,'disabled'),isDisabled);
    }
});
