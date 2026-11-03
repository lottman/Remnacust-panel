const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const load = require('./load-typescript.cjs');
const file = path.join(__dirname, '../src/modules/subscription/subscription.service.ts');
const mocks = Object.fromEntries([...fs.readFileSync(file, 'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(match => [match[1], {}]));
mocks['@nestjs/common'] = { Injectable: () => x => x, Logger: class {} };
mocks['@libs/contracts/constants'] = require('../libs/contract/build/backend/constants');
mocks['@modules/users/queries/get-user-by-unique-field'] = { GetUserByUniqueFieldQuery: class {} };
mocks['../hosts/queries/get-hosts-for-user'] = { GetHostsForUserQuery: class {} };
mocks['@modules/subscription-template/constants'] = load(path.join(__dirname, '../src/modules/subscription-template/constants/extended-clients.ts'));
mocks['@modules/hosts/utils/host-traffic-limit'] = load(path.join(__dirname, '../src/modules/hosts/utils/host-traffic-limit.ts'));
const context = load(path.join(__dirname, '../src/common/utils/geofile-request-context.ts'));
mocks['../../common/utils/geofile-request-context'] = context;
mocks['../../common/utils/subscription-domain-url'] = load(path.join(__dirname, '../src/common/utils/subscription-domain-url.ts'));
class Response { constructor(value) { Object.assign(this, value); } }
mocks['./models'] = { SubscriptionWithConfigResponse: Response };
const { SubscriptionService } = load(file, mocks);

test('the base JSON setting upgrades app fallback on either domain and preserves explicit rule opt-out', async () => {
    for (const domain of ['https://main.example.test', 'https://cdn.example.test']) {
        for (const agent of ['Happ/6.2.0', 'INCY/2.6.2/iOS']) {
            for (const [enabled, ignore, expected] of [[false, false, 'XRAY_BASE64'], [true, false, 'XRAY_JSON'], [true, true, 'XRAY_BASE64']]) {
                const settings = { serveJsonAtBaseSubscription: enabled, hwidSettings: { enabled: false }, customRemarks: { emptyHosts: [] } };
                const request = { matchedResponseType: 'XRAY_BASE64', userAgent: agent, subscriptionSettings: settings, ignoreServeJsonAtBaseSubscription: ignore };
                const user = { id: 42n, status: 'ACTIVE', expireAt: new Date(Date.now() + 86400000), shortUuid: 'fixture' };
                const service = Object.create(SubscriptionService.prototype);
                let queries = 0;
                Object.assign(service, {
                    logger: { error: error => { throw error; } },
                    queryBus: { execute: async () => ({ isOk: true, response: queries++ ? [] : user }) },
                    deviceAccess: { enabled: false, registrationDenied: async () => false },
                    applyMaybeExternalSquadOverrides: async () => ({ subscriptionSettings: settings }),
                    checkAndUpsertHwidUserDevice: async () => {}, updateAndReportSubscriptionRequest: async () => {},
                    getUserProfileHeadersInfo: () => ({}),
                    renderSubscription: async ({ srrContext }) => {
                        assert.equal(context.currentGeofileOrigin(), domain);
                        return { subscription: srrContext.matchedResponseType, contentType: 'text/plain' };
                    },
                });
                const result = await context.withGeofileOrigin(domain, () => service.getSubscriptionByShortUuid(request, 'fixture'));
                assert.equal(result.body, expected, `${domain}: ${agent}, enabled=${enabled}, ignore=${ignore}`);
            }
        }
    }
});

test('host and tag quotas are applied before every autoselect variant, without duplicate accounting',async()=>{
 const variants=Array.from({length:10},(_,i)=>({key:'balance-'+i,name:'balance-'+i,template:{}}));
 for(const policy of [{usedBytes:100n,effectiveLimitBytes:100n},{trafficPaused:true},{tagTrafficLimits:[{limitBytes:100n,usedBytes:100n}]},{tagTrafficLimits:[{ambiguous:true}]},{tagTrafficLimits:[{paused:true}]}]){
  const host={uuid:'shared-source',tags:['limited'],alwaysAvailable:false,onlyWhenInactive:false,excludeFromSubscriptionTypes:[],xrayJsonVariants:variants,tagTrafficLimits:[],...policy};
  const recipient={...host,uuid:'recipient',tags:[],usedBytes:0n,effectiveLimitBytes:0n,tagTrafficLimits:[],trafficPaused:false};
  const settings={hwidSettings:{enabled:false},customRemarks:{},randomizeHosts:false};
  const user={id:42n,status:'ACTIVE',expireAt:new Date(Date.now()+86400000),shortUuid:'fixture'};
  const service=Object.create(SubscriptionService.prototype);let queries=0,rendered;
  Object.assign(service,{logger:{error:error=>{throw error}},queryBus:{execute:async()=>({isOk:true,response:queries++?[host,recipient]:user})},deviceAccess:{enabled:false,registrationDenied:async()=>false},applyMaybeExternalSquadOverrides:async()=>({subscriptionSettings:settings}),checkAndUpsertHwidUserDevice:async()=>{},updateAndReportSubscriptionRequest:async()=>{},getUserProfileHeadersInfo:()=>({}),renderSubscription:async({hosts})=>{rendered=hosts;return{subscription:'[]',contentType:'application/json'}}});
  await service.getSubscriptionByShortUuid({matchedResponseType:'XRAY_JSON',subscriptionSettings:settings},'fixture');
  assert.deepEqual(rendered.map(h=>h.uuid),['recipient']);assert.equal(rendered[0].xrayJsonVariants.length,10);
 }
});
