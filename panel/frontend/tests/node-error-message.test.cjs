const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/shared/utils/node-error-message.ts'),'utf8');
const exportsRef={};
new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exportsRef);
for(const language of ['en','ru','fa','zh']) test(language+': preparation errors are localized and original core diagnostics stay intact',()=>{
 const locale=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/locales',language,'remnawave.json'),'utf8'));
 const t=(key,values={})=>{
  const value=key.split('.').reduce((item,part)=>item?.[part],locale);
  assert.equal(typeof value,'string',key);
  return value.replace(/\{\{(\w+)\}\}/g,(_,name)=>values[name]??'');
 };
 const message=exportsRef.getNodeErrorMessage;
 for(const stage of ['profile','snippets','validation','certificates','users','devices','identities']) assert.equal(message(`Node configuration preparation failed [${stage}]`,t),locale.nodeErrors[stage]);
 assert.equal(message('Failed to get config for node',t),locale.nodeErrors.preparation);
 const original='runtime apply failed: Inbound TCP-LAST changes its port or transport; create a separate port/tag and retain this listener';
 assert.equal(message(original,t),original);
 assert.equal(message('ECONNREFUSED 127.0.0.1:2222',t),'ECONNREFUSED 127.0.0.1:2222');
 assert.equal(message('Node configuration preparation failed [untrusted]',t),'Node configuration preparation failed [untrusted]');
});
