const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/shared/utils/node-error-message.ts'),'utf8');
const exportsRef={};
new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exportsRef);
const noRoute='No authenticated node API route available';
test('unavailable node API route messages use a generic diagnostic, not authentication',()=>{
 for(const original of [noRoute,noRoute.toLowerCase(),noRoute.toUpperCase(),JSON.stringify(noRoute),`'${noRoute}'`,`Error: "${noRoute}"`]) {
  assert.equal(exportsRef.getNodeErrorMessage(original,(key)=>key),'nodeErrors.noRoute',original);
 }
});
for(const language of ['en','ru','fa','zh']) test(language+': node diagnostics have localized explanations; technical text stays separate',()=>{
 const locale=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/locales',language,'remnawave.json'),'utf8'));
 const t=(key,values={})=>{
  const value=key.split('.').reduce((item,part)=>item?.[part],locale);
  assert.equal(typeof value,'string',key);
  return value.replace(/\{\{(\w+)\}\}/g,(_,name)=>values[name]??'');
 };
 const message=exportsRef.getNodeErrorMessage;
 assert.equal(typeof locale.nodeErrors.noRoute,'string','nodeErrors.noRoute');
 assert.ok(locale.nodeErrors.noRoute.trim(),'nodeErrors.noRoute must not be empty');
 assert.equal(message(noRoute,t),locale.nodeErrors.noRoute);
 assert.notEqual(message(noRoute,t),locale.nodeErrors.authentication);
 for(const stage of ['profile','snippets','validation','certificates','users','devices','identities']) assert.equal(message(`Node configuration preparation failed [${stage}]`,t),locale.nodeErrors[stage]);
 assert.equal(message('Failed to get config for node',t),locale.nodeErrors.preparation);
 assert.equal(message('[NODE_NATIVE_COMPATIBILITY]',t),locale.nodeErrors.nativeCompatibility);
 assert.equal(message('[NODE_LEGACY_AUTOSELECT]',t),locale.nodeErrors.legacyAutoselect);
 assert.equal(message('[NODE_CORE_NOT_READY]',t),locale.nodeErrors.coreNotReady);
 assert.equal(message('[NODE_CONTROL_DISABLED]',t),locale.nodeErrors.controlDisabled);
 assert.equal(message('[NODE_UPDATE_PENDING]',t),locale.nodeErrors.updatePending);
 assert.equal(message('[HOST_POLICY_QUARANTINED] Restricted hosts await peer proof',t),locale['xera-node-health']['policy-quarantined-message']);
 const original='runtime apply failed: Inbound TCP-LAST changes its port or transport; create a separate port/tag and retain this listener';
 assert.equal(message(original,t),locale.nodeErrors.listenerChanged);
 assert.equal(message('ECONNREFUSED 127.0.0.1:2222',t),locale.nodeErrors.connectionRefused);
 assert.equal(message('Node configuration preparation failed [untrusted]',t),locale.nodeErrors.unknown);
 assert.equal(message('Unexpected node failure',t),locale.nodeErrors.unknown);
 for(const [original,key] of [
  ['ECONNREFUSED 127.0.0.1:2222','connectionRefused'], ['connection refused','connectionRefused'],
  ['getaddrinfo ENOTFOUND node.example','dns'], ['getaddrinfo EAI_AGAIN node.example','dns'],
  ['socket hang up','connectionReset'], ['read ECONNRESET','connectionReset'],
  ['certificate has expired','tls'], ['Node route selection is cooling down','routeCooldown'],
  ['TLS handshake failed','tls'], ['CERT_HAS_EXPIRED','tls'],
  ['Node route selection cooling down','routeCooldown'],
  ['timeout of 15000ms exceeded','requestTimeout'], ['connect ETIMEDOUT node.example:2222','requestTimeout']
 ]) {
  assert.equal(message(original,t),locale.nodeErrors[key],original);
  assert.equal(message(`${noRoute}: ${original}`,t),locale.nodeErrors[key],original);
 }
});

test('node error card retains full original diagnostics for disclosure and copying',()=>{
 const widget=fs.readFileSync(path.join(__dirname,'../src/widgets/dashboard/nodes/node-error-message/node-error-message.widget.tsx'),'utf8');
 assert.match(widget,/details=\{node\.lastStatusMessage\}/);
 assert.match(widget,/copyValue=\{node\.lastStatusMessage\}/);
 const block=fs.readFileSync(path.join(__dirname,'../src/shared/ui/error-message-block/error-message-block.tsx'),'utf8');
 assert.match(block,/component="details"/);
 assert.match(block,/requestErrors\.technicalDetails/);
});

test('the actual node card distinguishes a running quarantined configuration in all four locales',()=>{
 const load=require('../../backend/tests/load-typescript.cjs');
 const React=require('react');
 const {renderToStaticMarkup}=require('react-dom/server');
 const root=path.join(__dirname,'../src');
 const policy=load(path.join(root,'shared/utils/node-policy-status.ts'));
 let locale;
 const t=key=>key.split('.').reduce((value,part)=>value?.[part],locale);
 const mocks={
  'react-i18next':{useTranslation:()=>({t})},
  '@shared/utils/node-error-message':exportsRef,
  '@shared/utils/node-policy-status':policy,
  '@shared/ui/section-card':{SectionCard:{Root:({children})=>React.createElement('div',null,children),Section:({children})=>React.createElement('div',null,children)}},
  '@shared/ui/overlays/base-overlay-header':{BaseOverlayHeader:({title})=>React.createElement('h2',null,title)},
  '@shared/ui/error-message-block':{ErrorMessageBlock:({message})=>React.createElement('p',null,message)}
 };
 const widgetFile=path.join(root,'widgets/dashboard/nodes/node-error-message/node-error-message.widget.tsx');
 const compiled=ts.transpileModule(fs.readFileSync(widgetFile,'utf8'),{fileName:widgetFile,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const widget={exports:{}};
 new Function('require','module','exports',compiled)(id=>Object.hasOwn(mocks,id)?mocks[id]:require(id),widget,widget.exports);
 const {NodeErrorMessageWidget}=widget.exports;
 for(const language of ['en','ru','fa','zh']){
  locale=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/locales',language,'remnawave.json'),'utf8'));
  const raw='[HOST_POLICY_QUARANTINED] Restricted hosts await peer proof';
  assert.equal(policy.nodePolicyIsPending(raw),true);
  assert.equal(policy.nodePolicyIsQuarantined(raw),true);
  const html=renderToStaticMarkup(React.createElement(NodeErrorMessageWidget,{node:{lastStatusMessage:raw}}));
  assert.ok(html.includes(locale['xera-node-health']['policy-quarantined-title']));
  assert.ok(html.includes(locale['xera-node-health']['policy-quarantined-message']));
  assert.ok(!html.includes(locale['xera-node-health']['policy-pending-message']));
 }
});
