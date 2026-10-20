const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
function source(name, overrides = {}) {
    const filename = path.join(__dirname, '../src', name);
    const mocks = {};
    for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
        if (/^(@common\/|@modules\/|@libs\/|\.)/.test(match[1])) mocks[match[1]] = {};
    }
    return load(filename, {...mocks,'@nestjs/cqrs':{QueryHandler:()=>()=>{}},...overrides});
}
const constants = {CACHE_KEYS:{SUBSCRIPTION_SETTINGS:'settings', EXTERNAL_SQUAD_SETTINGS:id=>id},CACHE_KEYS_TTL:{SUBSCRIPTION_SETTINGS:30,EXTERNAL_SQUAD_SETTINGS:30}};
const cases = [
    ['subscription-settings/queries/get-cached-subscrtipion-settings/get-cached-subscrtipion-settings.handler.ts','GetCachedSubscriptionSettingsHandler','findFirst'],
    ['external-squads/queries/get-cached-external-squad-settings/get-cached-external-squad-settings.handler.ts','GetCachedExternalSquadSettingsHandler','getExternalSquadSettings'],
];
for(const [file, exported, method] of cases) {
    const Handler=source('modules/'+file,{'@libs/contracts/constants':constants})[exported];
    test(exported+' preserves database settings when cache read or write fails',async()=>{
        for(const failure of ['get','set']) {
            let reads=0;
            const expected={uuid:'settings',enabled:true};
            const handler=new Handler({[method]:async()=>{reads++;return expected}}, {
                get:async()=>{if(failure==='get')throw new Error('redis unavailable');return null},
                set:async()=>{if(failure==='set')throw new Error('redis unavailable')},
            });
            handler.logger={warn(){},error(){}};
            assert.equal(await handler.execute({externalSquadUuid:'squad'}),expected);
            assert.equal(reads,1);
        }
    });
    test(exported+' keeps cache hits and does not fabricate missing database settings',async()=>{
        const expected={uuid:'cached'};
        const hit=new Handler({[method]:async()=>assert.fail('database must not be read')},{get:async()=>expected});
        assert.equal(await hit.execute({externalSquadUuid:'squad'}),expected);
        for(const db of [async()=>null,async()=>{throw new Error('database unavailable')}]) {
            const handler=new Handler({[method]:db},{get:async()=>null,set:async()=>{}});
            handler.logger={warn(){},error(){}};
            assert.equal(await handler.execute({externalSquadUuid:'squad'}),null);
        }
    });
}
const {RawCacheService}=source('common/raw-cache/raw-cache.service.ts',{'@songkeys/nestjs-redis':{InjectRedis:()=>()=>{}}});
test('host inbound and template caches fall back to the database without hiding database errors',async()=>{
    for(const failure of ['read','write']) {
        const cache=Object.create(RawCacheService.prototype);
        cache.logger={warn(){}};
        cache.mget=async()=>{if(failure==='read')throw new Error('redis');return [null]};
        cache.setMany=async()=>{if(failure==='write')throw new Error('redis')};
        const options={cacheKey:id=>id,ttlSeconds:30,fetch:async ids=>ids.map(id=>({id,value:'config'})),rowId:r=>r.id,toValue:r=>r.value};
        assert.deepEqual([...await cache.cachedByKeys(['a'],options)],[['a','config']]);
        await assert.rejects(cache.cachedByKeys(['a'],{...options,fetch:async()=>{throw new Error('database')}}),/database/);
    }
});
