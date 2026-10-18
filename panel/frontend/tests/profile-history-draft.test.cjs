const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), test=require('node:test'), vm=require('node:vm'), ts=require('typescript');
function harness(){
 const states=[],refs=[];let stateCursor=0,refCursor=0;const exports={};
 const component=new Proxy({__esModule:true},{get:(obj,key)=>key in obj?obj[key]:key});
 const source=fs.readFileSync(path.join(__dirname,'../src/pages/dashboard/config-profiles/components/config-profile-by-uuid.page.component.tsx'),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require(name){
  if(name==='react')return {useState(initial){const i=stateCursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v]},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial})},useCallback:fn=>fn};
  if(name==='react-i18next')return {useTranslation:()=>({t:key=>key})};
  if(name==='react-router')return {useNavigate:()=>()=>{}};
  if(name==='@shared/i18n/interface-text')return {useUiText:()=>key=>key};
  if(name==='@mantine/core')return {...component,Group:'Group',ActionIcon:'ActionIcon',ActionIconGroup:'ActionIconGroup',Tabs:Object.assign(()=>{}, {List:'List',Tab:'Tab',Panel:'Panel'})};
  if(name==='@shared/constants')return {OPEN_ENTITY:{CONFIG_PROFILE:'profile'},ROUTES:{DASHBOARD:{MANAGEMENT:{CONFIG_PROFILE_CANVAS:'/canvas/:uuid',CONFIG_PROFILES:'/profiles'}}}};
  if(name==='react/jsx-runtime')return require(name);
  return component;
 }});
 function elements(el){if(Array.isArray(el))return el.flatMap(elements);if(!el||typeof el!=='object')return [];return [el,...elements(el.props?.children)]}
 let profile={uuid:'profile-a',name:'A',config:{tag:'A'}};
 function render(){stateCursor=0;refCursor=0;return exports.ConfigProfileByUuidPageComponent({configProfile:profile,snippets:{snippets:[]}})}
 function find(type){return elements(render()).find(el=>el.type===type)}
 return {find,history(){const tabs=elements(render()).find(el=>el.props?.value==='editor'&&el.props?.onChange);tabs.props.onChange('history')},setProfile(value){profile=value}};
}
test('history draft and pending restore never leak into another profile after route change',()=>{
 const h=harness();h.find('ConfigEditorWidget').props.onDraftChange('unsaved-A');h.history();
 assert.equal(h.find('ProfileHistory').props.draft,'unsaved-A');
 h.find('ProfileHistory').props.onRestore({uuid:'old-revision',config:{tag:'restored-A'}});
 assert.equal(h.find('ConfigEditorWidget').props.restoreDraft.profileUuid,'profile-a');
 // Return to history, then navigate to another profile without unmounting the page.
 h.history();h.setProfile({uuid:'profile-b',name:'B',config:{tag:'B'}});
 assert.equal(h.find('ProfileHistory').props.draft,JSON.stringify({tag:'B'},null,2));
 assert.equal(h.find('ConfigEditorWidget').props.restoreDraft,null);
});
