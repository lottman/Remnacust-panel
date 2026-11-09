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
        for (const agent of ['Happ/6.2.0', 'INCY/2.6.2/iOS', 'v2RayTun/2.0', 'v2raytun/3.10.15', 'v2raytun/android', 'v2raytun/ios', 'v2raytun/windows', 'Throne/1.2.0', 'Throne/1.3.2', 'Throne/1.4.1', 'Throne/1.4.0-beta.5', 'Throne/1.2.0-beta.5 (Prefer ClashMeta Format)']) {
            for (const [enabled, ignore, matched, expected] of [[false, false, 'XRAY_BASE64', 'XRAY_BASE64'], [true, false, 'XRAY_BASE64', 'XRAY_JSON'], [true, true, 'XRAY_BASE64', 'XRAY_BASE64'], [true, false, 'MIHOMO', 'MIHOMO'], [true, false, 'SINGBOX', 'SINGBOX'], [true, false, 'CLASH', 'CLASH'], [true, false, 'STASH', 'STASH']]) {
                const settings = { serveJsonAtBaseSubscription: enabled, hwidSettings: { enabled: false }, customRemarks: { emptyHosts: [] } };
                const request = { matchedResponseType: matched, userAgent: agent, subscriptionSettings: settings, ignoreServeJsonAtBaseSubscription: ignore };
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

test('recipient quotas gate profiles while limited pool candidates remain available for separate accounting',async()=>{
 const variants=Array.from({length:10},(_,i)=>({key:'balance-'+i,name:'balance-'+i,template:{}}));
 for(const policy of [{usedBytes:100n,effectiveLimitBytes:100n},{trafficPaused:true},{tagTrafficLimits:[{limitBytes:100n,usedBytes:100n}]},{tagTrafficLimits:[{ambiguous:true}]},{tagTrafficLimits:[{paused:true}]}]){
  const host={uuid:'shared-source',tags:['limited'],alwaysAvailable:false,onlyWhenInactive:false,excludeFromSubscriptionTypes:[],xrayJsonVariants:variants,tagTrafficLimits:[],...policy};
  const recipient={...host,uuid:'recipient',tags:[],usedBytes:0n,effectiveLimitBytes:0n,tagTrafficLimits:[],trafficPaused:false};
  const settings={hwidSettings:{enabled:false},customRemarks:{},randomizeHosts:false};
  const user={id:42n,status:'ACTIVE',expireAt:new Date(Date.now()+86400000),shortUuid:'fixture'};
  const service=Object.create(SubscriptionService.prototype);let queries=0,rendered,candidates;
  Object.assign(service,{logger:{error:error=>{throw error}},queryBus:{execute:async()=>({isOk:true,response:queries++?[host,recipient]:user})},deviceAccess:{enabled:false,registrationDenied:async()=>false},applyMaybeExternalSquadOverrides:async()=>({subscriptionSettings:settings}),checkAndUpsertHwidUserDevice:async()=>{},updateAndReportSubscriptionRequest:async()=>{},getUserProfileHeadersInfo:()=>({}),renderSubscription:async({hosts,autoselectHosts})=>{rendered=hosts;candidates=autoselectHosts;return{subscription:'[]',contentType:'application/json'}}});
  await service.getSubscriptionByShortUuid({matchedResponseType:'XRAY_JSON',subscriptionSettings:settings},'fixture');
  assert.deepEqual(rendered.map(h=>h.uuid),['recipient']);assert.equal(rendered[0].xrayJsonVariants.length,10);
  assert.deepEqual(candidates.map(h=>h.uuid),['shared-source','recipient']);
 }
});

test('Throne full-config JSON capability is version bounded and never grants Happ/INCY extensions', () => {
    const clients = mocks['@modules/subscription-template/constants'];
    for (const ua of ['Throne/1.2.0','Throne/1.2.0-beta.5','Throne/1.4.1','throne/1.3.2 (Prefer ClashMeta Format)']) {
        assert.equal(clients.isThroneJsonSubscriptionSupported(ua), true, ua);
        assert.equal(clients.isExtendedClient(ua), false, ua);
    }
    for (const ua of ['Throne/2.0.0','Throne/1.0.0','Throne/1.1.6','Throne/1.2.0-beta.4','Throne/1.2.0-dev','Throne','Throne/1.2','Throne/1.2.0invalid','OtherThrone/1.4.1']) assert.equal(clients.isThroneJsonSubscriptionSupported(ua), false, ua);
});
