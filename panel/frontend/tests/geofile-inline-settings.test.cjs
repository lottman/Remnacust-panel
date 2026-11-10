const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
function harness(language='en') {
 const strings=JSON.parse(fs.readFileSync(path.join(__dirname,`../public/locales/${language}/remnawave.json`),'utf8'));
 const t=k=>{const s=k.split('.').reduce((v,k)=>v?.[k],strings);assert.equal(typeof s,'string',k);return s;};
 let draft=null, callbacks;const requests=[],events=[],key=['settings'];
 const settings={data:{uuid:'settings',geofilesInlineRuleLimit:20000,geofilesEnabled:true},isSuccess:true,isPending:false,isError:false,refetch:()=>events.push('refetch')};
 const update={isPending:false,isError:false,mutate:r=>requests.push(r)};
 const mocks={
 '@mantine/core':Object.fromEntries(['Alert','Button','Group','Loader','NumberInput','Stack','Text'].map(k=>[k,k])),
 '@remnawave/backend-contract':{GEOFILE_INLINE_RULE_LIMIT:20000,GEOFILE_INLINE_RULE_LIMIT_MIN:1,GEOFILE_INLINE_RULE_LIMIT_MAX:50000},
 react:{useState:()=>[draft,v=>{draft=v;}]},'react-i18next':{useTranslation:()=>({t})},
 '@tanstack/react-query':{useQueryClient:()=>({cancelQueries:async()=>events.push('cancel'),setQueryData:(k,v)=>{assert.deepEqual(k,key);settings.data=v;events.push('confirmed');},invalidateQueries:async()=>events.push('invalidate')})},
 '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks':{subscriptionSettingsQueryKeys:{getSubscriptionSettings:{queryKey:key}},useGetSubscriptionSettings:()=>settings},
 '@shared/api/hooks/subscription-settings/subscription-settings.mutation.hooks':{useUpdateSubscriptionSettings:o=>{callbacks=o.mutationFns;return update;}}
 };
 const code=fs.readFileSync(path.join(__dirname,'../src/widgets/dashboard/templates/subscription-template-editor/geofile-inline-settings.tsx'),'utf8');
 const compiled=ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
 const ref={exports:{}};new Function('require','module','exports',compiled)(id=>mocks[id]??require(id),ref,ref.exports);
 const elements=v=>Array.isArray(v)?v.flatMap(elements):v&&typeof v==='object'?[v,...elements(v.props?.children)]:[];
 const render=()=>elements(ref.exports.GeofileInlineSettings());
 return {render,requests,events,settings,update,change:v=>render().find(e=>e.type==='NumberInput').props.onChange(v),save:()=>render().find(e=>e.type==='Button').props.onClick(),confirm:v=>callbacks.onSuccess(v)};
}
for(const language of ['ru','en','fa','zh'])test(`${language}: explicit save preserves flags and confirms cache before resetting draft`,async()=>{
 const h=harness(language);assert.equal(h.render().find(e=>e.type==='NumberInput').props.value,20000);
 assert.equal(h.render().find(e=>e.type==='Button').props.disabled,true);
 h.change(1234);assert.deepEqual(h.requests,[]);h.save();assert.deepEqual(h.requests,[{variables:{uuid:'settings',geofilesInlineRuleLimit:1234}}]);
 await h.confirm({...h.settings.data,geofilesInlineRuleLimit:1234});assert.equal(h.settings.data.geofilesEnabled,true);assert.deepEqual(h.events,['cancel','confirmed','invalidate']);
 assert.equal(h.render().find(e=>e.type==='Button').props.disabled,true);
});
test('invalid numeric drafts cannot dispatch through UI or direct callback',()=>{
 const h=harness();for(const v of ['',0,-1,50001,1.5,'100',NaN,Infinity]){h.change(v);assert.equal(h.render().find(e=>e.type==='Button').props.disabled,true);assert.equal(typeof h.render().find(e=>e.type==='NumberInput').props.error,'string');h.save();}assert.deepEqual(h.requests,[]);
});
test('pending and missing settings block submission; failed save retains retryable draft',()=>{
 const h=harness();h.change(100);h.update.isPending=true;h.save();assert.deepEqual(h.requests,[]);assert.equal(h.render().find(e=>e.type==='NumberInput').props.disabled,true);
 h.update.isPending=false;h.update.isError=true;assert.equal(h.render().find(e=>e.type==='NumberInput').props.value,100);assert(h.render().some(e=>e.type==='Alert'));
 h.settings.data=undefined;h.settings.isSuccess=false;h.settings.isError=true;h.save();assert.deepEqual(h.requests,[]);
});
