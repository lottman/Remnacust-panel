const test=require('node:test');const assert=require('node:assert/strict');
const {source}=require('./upstream-filter-fixture.cjs');
const common={
    '@common/utils/flow/get-vless-flow':{getVlessFlowFromDbInbound:inbound=>inbound.testFlow},
    '@common/utils/device-identity':{deviceCredentials:()=>({username:'42~device',vlessUuid:'personal-key'})},
    '@modules/hwid-user-devices/queries/get-user-devices.query':{GetUserDevicesQuery:class {}},
    '@modules/users/queries/get-user-with-resolved-inbounds':{GetUserWithResolvedInboundsQuery:class {}},
    '@modules/users/queries/get-users-with-resolved-inbounds':{GetUsersWithResolvedInboundsQuery:class {}},
};
const {AddUserToNodeHandler}=source('modules/nodes/events/add-user-to-node/add-user-to-node.handler.ts',{
    ...common,'./add-user-to-node.event':{AddUserToNodeEvent:class {}},
});
const {AddUsersToNodeHandler}=source('modules/nodes/events/add-users-to-node/add-users-to-node.handler.ts',{
    ...common,'./add-users-to-node.event':{AddUsersToNodeEvent:class {}},
});

for(const personal of [false,true])for(const bulk of [false,true]){
    test(`${bulk?'bulk':'single'} credentials follow selected inbound UUIDs across port profiles (personal=${personal})`,async()=>{
        const previous=process.env.XERA_PERSONAL_SUBSCRIPTIONS;
        process.env.XERA_PERSONAL_SUBSCRIPTIONS=String(personal);
        try{
            const active=[{uuid:'inbound-primary',profileUuid:'primary',tag:'primary',type:'vless',testFlow:'primary-flow'},
                {uuid:'inbound-secondary',profileUuid:'secondary',tag:'secondary',type:'vless',testFlow:'secondary-flow'}];
            const user={id:42n,vlessUuid:'shared-key',ssPassword:'unused',trojanPassword:'unused',inbounds:[...active,
                {uuid:'unselected',profileUuid:'third',tag:'secondary',type:'vless',testFlow:'unselected-flow'}]};
            const calls=[],removals=[];
            const queues={addUserToNode:async task=>calls.push(task),addUsersToNode:async task=>calls.push(task),
                removeUserFromNode:async task=>removals.push(task),removeUsersFromNode:async task=>removals.push(task)};
            let queryCount=0;
            const queries={execute:async()=>++queryCount===1?{isOk:true,response:bulk?[user]:user}:[{hwid:'device',blocked:false}]};
            const Handler=bulk?AddUsersToNodeHandler:AddUserToNodeHandler;
            const handler=new Handler({findConnectedNodes:async()=>[{uuid:'node',address:'loopback.invalid',activeConfigProfileUuid:'primary',activeInbounds:active}]},queues,queries,{getOrThrow:()=> 'test-secret'});
            handler.logger={error:message=>assert.fail(message)};
            await handler.handle(bulk?{ids:[42n]}:{userId:42n});
            assert.equal(calls.length,personal&&!bulk?2:1);assert.equal(removals.length,0);
            for(const call of calls){
                const groups=bulk?call.data.users.map(item=>item.inboundData):[call.data.data];
                // A third profile using the same tag cannot contribute its own
                // flow or duplicate a credential to the selected listener.
                for(const all of groups)assert.deepEqual(all.map(item=>[item.tag,item.flow]),[['primary','primary-flow'],['secondary','secondary-flow']]);
            }
            if(personal){
                if(bulk)assert.deepEqual(calls[0].data.users.map(item=>item.userData.userId),['42~device','42']);
                else assert.equal(calls[0].data.data[0].username,'42~device');
            }
        }finally{if(previous===undefined)delete process.env.XERA_PERSONAL_SUBSCRIPTIONS;else process.env.XERA_PERSONAL_SUBSCRIPTIONS=previous;}
    });
}
