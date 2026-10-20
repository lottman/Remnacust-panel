const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/shared/_modals/users/connection-keys-drawer/connection-key-label.ts'),'utf8');
const moduleRef={exports:{}};
new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(moduleRef.exports);
test('connection names decode Unicode but malformed percent encoding cannot crash the drawer',()=>{
 const label=moduleRef.exports.connectionKeyLabel;
 assert.equal(label('vless://example#%D0%9D%D0%BE%D0%B4%D0%B0'),'Нода');
 assert.equal(label('vless://example#broken%'),'broken%');
 assert.equal(label('vless://example#%E0%A4%A'),'%E0%A4%A');
 assert.equal(label('vless://example#'),'Host');
});
