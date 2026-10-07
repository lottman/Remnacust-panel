const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('typescript'),path=require('node:path');
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../frontend/src/shared/utils/recover-stale-assets.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function scenario(candidate,stored='0',ok=true){
    const handlers={},storage={value:stored};let reloads=0,calls=0;
    const context={exports:{},URL,AbortSignal,Date,Error,Number,String,
        navigator:{onLine:true},document:{querySelector:()=>({src:'https://panel.test/assets/old.js'})},
        sessionStorage:{getItem:()=>storage.value,setItem:(_k,v)=>storage.value=v},
        location:{origin:'https://panel.test',reload:()=>reloads++},
        fetch:async()=>{calls++;return {ok,text:async()=>''}},
        DOMParser:class{parseFromString(){return {querySelector:()=>candidate?{getAttribute:()=>candidate}:null}}},
        window:{addEventListener:(name,fn)=>handlers[name]=fn}};
    vm.runInNewContext(code,context);context.exports.installStaleAssetRecovery();
    handlers['vite:preloadError']();handlers['vite:preloadError']();
    await new Promise(setImmediate);
    return {reloads,calls,storage};
}
test('an old tab reloads once only for a confirmed deployment',async()=>{
    assert.equal((await scenario('/assets/new.js')).reloads,1);
    assert.equal((await scenario('/assets/old.js')).reloads,0);
    assert.equal((await scenario('https://outside.test/assets/new.js')).reloads,0);
    assert.equal((await scenario('/assets/new.js',String(Date.now()))).calls,0);
    assert.equal((await scenario('/assets/new.js','0',false)).reloads,0);
    assert.equal((await scenario(null)).reloads,0);
});
