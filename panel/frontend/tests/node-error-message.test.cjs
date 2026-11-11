const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/shared/utils/node-error-message.ts'),'utf8');
const exportsRef={};
new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exportsRef);
for(const language of ['en','ru','fa','zh']) test(language+': node diagnostics have localized explanations; technical text stays separate',()=>{
 const locale=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/locales',language,'remnawave.json'),'utf8'));
 const t=(key,values={})=>{
  const value=key.split('.').reduce((item,part)=>item?.[part],locale);
  assert.equal(typeof value,'string',key);
  return value.replace(/\{\{(\w+)\}\}/g,(_,name)=>values[name]??'');
 };
 const message=exportsRef.getNodeErrorMessage;
 for(const stage of ['profile','snippets','validation','certificates','users','devices','identities']) assert.equal(message(`Node configuration preparation failed [${stage}]`,t),locale.nodeErrors[stage]);
 assert.equal(message('Failed to get config for node',t),locale.nodeErrors.preparation);
 assert.equal(message('[NODE_NATIVE_COMPATIBILITY]',t),locale.nodeErrors.nativeCompatibility);
 assert.equal(message('[NODE_LEGACY_AUTOSELECT]',t),locale.nodeErrors.legacyAutoselect);
 const original='runtime apply failed: Inbound TCP-LAST changes its port or transport; create a separate port/tag and retain this listener';
 assert.equal(message(original,t),locale.nodeErrors.listenerChanged);
 assert.equal(message('ECONNREFUSED 127.0.0.1:2222',t),locale.nodeErrors.connectionRefused);
 assert.equal(message('Node configuration preparation failed [untrusted]',t),locale.nodeErrors.unknown);
 for(const [original,key] of [
  ['getaddrinfo ENOTFOUND node.example','dns'], ['socket hang up','connectionReset'],
  ['certificate has expired','tls'], ['Node route selection is cooling down','routeCooldown'],
  ['No authenticated node API route available','authentication'], ['timeout of 15000ms exceeded','requestTimeout']
 ]) assert.equal(message(original,t),locale.nodeErrors[key]);
});

test('node error card retains full original diagnostics for disclosure and copying',()=>{
 const widget=fs.readFileSync(path.join(__dirname,'../src/widgets/dashboard/nodes/node-error-message/node-error-message.widget.tsx'),'utf8');
 assert.match(widget,/details=\{node\.lastStatusMessage\}/);
 assert.match(widget,/copyValue=\{node\.lastStatusMessage\}/);
 const block=fs.readFileSync(path.join(__dirname,'../src/shared/ui/error-message-block/error-message-block.tsx'),'utf8');
 assert.match(block,/component="details"/);
 assert.match(block,/requestErrors\.technicalDetails/);
});
