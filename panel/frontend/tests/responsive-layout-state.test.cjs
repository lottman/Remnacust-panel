const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),test=require('node:test'),vm=require('node:vm'),ts=require('typescript');
test('responsive breakpoint preserves the routed layout identity and desktop launcher',()=>{
 let mobile=true;const exports={};const component=new Proxy({__esModule:true},{get:(object,key)=>key in object?object[key]:key});
 const source=fs.readFileSync(path.join(__dirname,'../src/app/layouts/dashboard/main-layout/layout.tsx'),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require(name){
  if(name==='react')return {useEffect(){}};
  if(name==='@shared/hooks')return {useIsMobile:()=>mobile};
  if(name==='@entities/dashboard/updates-store')return {useRemnawaveInfo:()=>({starsCount:0}),useIsLoadingRemnawaveUpdates:()=>false,useUpdatesStoreActions:()=>({getRemnawaveInfo(){}})};
  if(name.includes('use-quick-launcher-routes'))return {useQuickLauncherRoutes:()=>[]};
  if(name==='./layout-shared')return {DASHBOARD_LINKS:{}};
  if(name==='react/jsx-runtime')return require(name);
  return component;
 }});
 const small=exports.MainLayout();mobile=false;const large=exports.MainLayout();
 assert.equal(small.type,large.type);
 assert.equal(small.props.children[0].type,large.props.children[0].type,'Changing the layout component type remounts Outlet and loses drafts');
 assert.equal(small.props.children[0].key,large.props.children[0].key);
 assert.equal(small.props.children[0].props.mobile,true);assert.equal(large.props.children[0].props.mobile,false);
 assert.equal(small.props.children[1],false);assert.equal(large.props.children[1].type,'QuickLauncher');
});
