const assert=require('node:assert/strict');
// In-memory node transport for SQL integration fixtures. Native persistence and
// actual TCP are verified separately by TestRuntimeRegisteredQuotaIsolated.
module.exports=function(instance,initialSequence=0){
 const entries=new Map();let revision='0',sequence=initialSequence;
 return {
  sequence:()=>sequence,
  apply(body){
   for(const item of body.registrations??[]){
    const grant=item.grant,old=entries.get(grant.id);
    assert.ok(item.action!=='cancel'||old||item.allowMissing);
    assert.ok(item.action!=='prepare'||(!old?.closed&&!old?.activated));
    entries.set(grant.id,{id:grant.id,group:item.group,owner:item.owner,expiresAt:grant.expiresAt,ceiling:grant.ceiling,reserved:old?.reserved??'0',
     prepared:true,activated:old?.activated??false,closed:item.action==='cancel',scale:item.scale});
   }
   const active=new Set();
   for(const [group,wire] of Object.entries(body.groups))for(const [owner,grant] of Object.entries(wire.reserves??{})){
    const old=entries.get(grant.id);assert.ok(!old?.closed);if(grant.registrationRequired)assert.ok(old?.prepared);
    entries.set(grant.id,{...old,id:grant.id,group,owner,expiresAt:grant.expiresAt,ceiling:grant.ceiling,reserved:old?.reserved??'0',closed:false,...(grant.registrationRequired?{activated:true}:{})});active.add(grant.id);
   }
   for(const entry of entries.values())if(!active.has(entry.id)&&(!entry.prepared||entry.activated))entry.closed=true;
   revision=body.revision;sequence++;
  },
  async read(_node,request){return {isOk:true,response:{instance,sequence,policyRevision:revision,entries:request.ids.flatMap(id=>entries.has(id)?[{...entries.get(id)}]:[]),missingIds:request.ids.filter(id=>!entries.has(id)),nextAfter:null}};},
 };
};
