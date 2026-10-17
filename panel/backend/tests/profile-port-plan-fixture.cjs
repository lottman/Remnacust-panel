// Generates input for the native Go traffic test using the actual panel compiler.
const fs=require('node:fs');const path=require('node:path');
const {compileNodePortPlan}=require('./load-typescript.cjs')(path.join(__dirname,'../src/modules/nodes/profile-port-plan.ts'));
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const slot=(n,profile,tag)=>({uuid:id(n),configProfileUuid:profile,configProfileInboundUuid:id(n+100),inboundTag:tag,listenAddress:'127.0.0.1',port:48100+n,networks:['tcp']});
const inbound=tag=>({tag,listen:'127.0.0.1',port:48999,protocol:'vless',settings:{decryption:'none',clients:[{id:'a4ac647a-075c-4b91-96e9-9fd341fba009',email:'runtime-user'}]}});
const profile=(uuid,tag,destination)=>({uuid,config:{log:{loglevel:'none'},
    inbounds:[inbound(tag),inbound(tag+'-unused')],
    outbounds:[{tag:'direct',protocol:'freedom',settings:{redirect:'127.0.0.1:'+destination,finalRules:[{action:'allow',ip:['127.0.0.1/32']}]}},
        {tag:'block',protocol:'blackhole',settings:{}}],routing:{domainStrategy:'AsIs',rules:[]}}});
const first=profile(A,'PORT-A',48201),second=profile(B,'PORT-B',48202);
second.config.inbounds.push(inbound('PORT-C'));
const slots=[slot(1,A,'PORT-A'),slot(2,B,'PORT-B')];
const initial=compileNodePortPlan(slots,[first,second]);
const next=structuredClone(first);next.config.outbounds[0].settings.redirect='127.0.0.1:48203';
const fixture={version:1,
    initial,
    updated:compileNodePortPlan(slots,[next,second]),
    conflicting:compileNodePortPlan([...slots,slot(3,B,'PORT-C')],[next,second]),
    removed:compileNodePortPlan([slots[1]],[second])};
if(!process.argv[2])throw Error('Specify the generated JSON fixture path');
fs.writeFileSync(process.argv[2],JSON.stringify(fixture));
console.log('Generated native port-plan fixture from the current panel compiler');
