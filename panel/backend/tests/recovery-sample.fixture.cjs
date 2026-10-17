const path=require('node:path'),{createHash}=require('node:crypto'),load=require('./load-typescript.cjs');
const {frameDigest}=load(path.join(__dirname,'../src/common/host-policy/usage-receipt.ts'));
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
module.exports=()=>{
 const recovery={version:'remnacust-quota-recovery-fence-v1',generation:id('a'),token:id('b'),state:'FENCED',sequence:'1',previous:null};
 recovery.digest=createHash('sha256').update([recovery.version,recovery.generation,recovery.token,recovery.state,'1','-',''].join('\n')).digest('hex');
 const request={generation:id('a'),requestId:id('c'),coreProcessId:id('d'),instance:id('e'),previous:recovery.digest,preparationDigest:'a'.repeat(64),sourceDigest:'b'.repeat(64),retainedDigest:null,
 prior:{sequence:'9007199254740993',digest:'c'.repeat(64)},receipt:{action:'sample',stream:id('e'),sequence:'9007199254740994',coreProcessId:id('f')}};
 const body={sequence:request.receipt.sequence,coreProcessId:request.receipt.coreProcessId,capturedAt:'1',stats:[{name:'user>>>901>>>traffic>>>uplink',value:'9007199254740993'}]};
 const reply={version:'remnacust-recovery-usage-sample-v1',requestId:request.requestId,generation:request.generation,coreProcessId:request.coreProcessId,instance:request.instance,previous:request.previous,preparationDigest:request.preparationDigest,sourceDigest:request.sourceDigest,retainedDigest:null,alreadyCaptured:true,journalDigest:'d'.repeat(64),frame:{capability:'remnacust-usage-receipts-v1',stream:request.instance,...body,digest:frameDigest(body)},recovery};
 return {request,reply,body};
};
