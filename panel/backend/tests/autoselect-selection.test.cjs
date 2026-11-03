const assert = require('node:assert/strict');
const { test } = require('node:test');
const { source } = require('./upstream-filter-fixture.cjs');
const load = require('./load-typescript.cjs');
const path = require('node:path');
const { selectInjectHosts } = source('modules/subscription-template/generators/inject-host-selection.ts');
const { InjectHostsEntrySchema, RemnawaveInjectorSchema } = load(path.join(__dirname, '../libs/contract/models/xray-json-advanced/remnawave-injector.schema.ts'));
const { indexXrayTemplateAssignments, assignedXrayTemplate, recipientXrayTemplate, assignedXrayTemplates, recipientXrayTemplates } = source('modules/hosts/utils/xray-template-assignments.ts');
const { XrayJsonGeneratorService } = source('modules/subscription-template/generators/xray-json.generator.service.ts', {
    './inject-host-selection': { selectInjectHosts }, '../host-mapper': { applyHostMapper: value => value },
    '@common/utils/bounded-regex': { configuredRegex: { test: async (pattern,value) => new RegExp(pattern).test(value) } },
    '@common/utils': { isNonEmptyObject: value => value && Object.keys(value).length > 0 }
});
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const host = (n, tags = ['LTE']) => ({ protocol: 'vless', address: `${n}.example.test`, port: 443,
    protocolOptions: { id: id(9999), flow: '' }, transport: 'tcp', transportOptions: {}, security: 'tls', securityOptions: { serverName: 'example.test' },
    streamOverrides: {}, mux: {}, finalRemark: String(n), metadata: { uuid: id(n), tags, isHidden: n !== 0, excludeFromSubscriptionTypes: [] }, clientOverrides: { mapper: { xrayJson: null } } });
const candidates = [host(1, ['LTE', 'VK']), host(2, ['LTE', 'YC']), host(3, ['LTE2']), host(4, ['LTE'])];
const pool = { selector: { type: 'uuids', values: candidates.map(h => h.metadata.uuid), expected: 2 }, mode: 'random', tagPrefix: 'g' };
test('host recipients bind to a specific balancer in automatic and explicit-template assignment', async () => {
    const template = { outbounds: [{tag:'direct',protocol:'freedom'}],
        remnawave: { injectHosts: [{...pool,mode:'all'}], assignments: [
            { balancerTag:'fast',tags:['LTE'] }, {balancerTag:'reserve',hosts:[id(2)]}
        ] },
        routing: { balancers: [{tag:'fast',selector:['g'],strategy:{type:'random'}},{tag:'reserve',selector:['g'],strategy:{type:'roundRobin'}}],
            rules: [{type:'field',domain:['geosite:private'],outboundTag:'direct'},{type:'field',network:'tcp,udp',balancerTag:'fast'}] }
    };
    const original = structuredClone(template);
    const index = indexXrayTemplateAssignments([{uuid:id(9),templateJson:template}]);
    for (const recipient of [{uuid:id(1),tags:['LTE']},{uuid:id(2),tags:['LTE']}]) {
        const selected = assignedXrayTemplate(recipient,index);
        assert.deepEqual(recipientXrayTemplate(recipient,template),selected);
        assert.equal(selected.routing.rules[0].outboundTag,'direct');
        assert.equal(selected.routing.rules[1].balancerTag,recipient.uuid===id(2)?'reserve':'fast');
        const generator = new XrayJsonGeneratorService({getCachedTemplateByType:async()=>selected});
        const [generated] = JSON.parse(await generator.generateConfig({hosts:[host(0),...candidates],isExtendedClient:false}));
        assert.equal(generated.routing.rules[1].balancerTag,selected.routing.rules[1].balancerTag);
        assert.equal(generated.remnawave,undefined);
    }
    assert.deepEqual(template,original);
    assert.equal(assignedXrayTemplate({uuid:id(10),tags:[]},index),null);
});
test('legacy default, exact tag expansion and random sampling preserve unique eligible hosts', () => {
    assert.equal(InjectHostsEntrySchema.safeParse({ selector: { type: 'uuids', values: [id(1)] }, tagPrefix: 'g' }).success, true);
    const tagged = { ...pool, selector: { type: 'tags', values: ['LTE', 'VK'], expected: 2 } };
    assert.deepEqual(selectInjectHosts({ ...tagged, mode: 'all' }, candidates).map(h => h.metadata.uuid), [id(1), id(2), id(4)]);
    assert.deepEqual(selectInjectHosts(tagged, candidates, () => 0).map(h => h.metadata.uuid), [id(1), id(2)]);
    const selected = selectInjectHosts({ ...pool, selector: { ...pool.selector, values: [...pool.selector.values, id(1)], expected: 20 } }, candidates, n => n - 1);
    assert.equal(selected.length, 4); assert.equal(new Set(selected.map(h => h.metadata.uuid)).size, 4);
});
test('groups accept named and array shapes; inaccessible groups are excluded before random choice', () => {
    for (const groups of [{ denied: [id(90)], pair: [id(1), id(2)], single: [id(4)] }, [[id(90)], [id(1), id(2)], [id(4)]]]) {
        const entry = { mode: 'group', selector: { type: 'uuids', groups }, tagPrefix: 'g' };
        assert.equal(InjectHostsEntrySchema.safeParse(entry).success, true);
        const choices = [];
        assert.deepEqual(selectInjectHosts(entry, candidates, n => { choices.push(n); return n - 1; }).map(h => h.metadata.uuid), [id(4)]);
        assert.deepEqual(choices, [2]);
    }
});
test('invalid modes, pools and counts fail validation; assignment lists use UUIDs', () => {
    for (const expected of [0, 1.5, 1001]) assert.equal(InjectHostsEntrySchema.safeParse({ ...pool, selector: { ...pool.selector, expected } }).success, false);
    for (const entry of [{ ...pool, selector: { type: 'uuids', values: [id(1)] } }, { ...pool, mode: 'group' }, { ...pool, selector: { type: 'tagRegex', pattern: 'LTE' } }]) assert.equal(InjectHostsEntrySchema.safeParse(entry).success, false);
    assert.equal(RemnawaveInjectorSchema.safeParse({ assignTo: { hosts: ['bad'] } }).success, false);
    assert.equal(InjectHostsEntrySchema.safeParse({ mode: 'group', tagPrefix: 'g', selector: { type: 'tags', groups: JSON.parse('{"__proto__":["LTE"]}') } }).success, false);
});
test('1000 eligible sources produce only requested outbounds, preserving manual routing and stripping metadata', async () => {
    const template = { outbounds: [{ tag: 'direct', protocol: 'freedom' }], routing: { balancers: [{ tag: 'b', selector: ['g'], strategy: { type: 'leastPing' } }], rules: [{ type: 'field', domain: ['geosite:private'], outboundTag: 'direct' }, { type: 'field', network: 'tcp,udp', balancerTag: 'b' }] }, remnawave: { injectHosts: [{ ...pool, selector: { type: 'tags', values: ['LTE'], expected: 3 } }], assignTo: { tags: ['recipient'] } } };
    const generator = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => template });
    const [config] = JSON.parse(await generator.generateConfig({ hosts: [host(0), ...Array.from({ length: 1000 }, (_, i) => host(i + 1))], isExtendedClient: false }));
    assert.equal(config.outbounds.filter(o => o.protocol === 'vless').length, 3);
    assert.deepEqual(config.routing, template.routing); assert.equal(config.remnawave, undefined);
});
test('explicit selection with no authorized sources omits the invalid profile instead of a dummy outbound', async () => {
    const template = { outbounds: [{ tag: 'direct', protocol: 'freedom' }], remnawave: { injectHosts: [{ ...pool, selector: { type: 'uuids', values: [id(90)], expected: 2 } }] } };
    const generator = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => template });
    assert.deepEqual(JSON.parse(await generator.generateConfig({ hosts: [host(0), host(1)], isExtendedClient: false })), []);
});
test('template assignments prefer recipient UUID, then template order for tags, including future hosts', () => {
    const first = { remnawave: { assignTo: { tags: ['VK'] } } }, second = { remnawave: { assignTo: { hosts: [id(1)], tags: ['YC'] } } };
    const index = indexXrayTemplateAssignments([{ uuid: id(8), templateJson: first }, { uuid: id(9), templateJson: second }]);
    assert.equal(assignedXrayTemplate({ uuid: id(1), tags: ['VK'] }, index), second);
    assert.equal(assignedXrayTemplate({ uuid: id(10), tags: ['YC', 'VK'] }, index), first);
    assert.equal(assignedXrayTemplate({ uuid: id(11), tags: ['YC'] }, index), second);
    assert.equal(assignedXrayTemplate({ uuid: id(12), tags: [] }, index), null);
});

test('ten balancers on one recipient produce ten profiles while pool sources remain unique', async () => {
 const tags=Array.from({length:10},(_,i)=>'balance-'+i);
 const template={outbounds:[],remnawave:{injectHosts:[{mode:'all',selectFrom:'ALL',tagPrefix:'p',selector:{type:'uuids',values:[id(1),id(1)]}}],assignments:tags.map(balancerTag=>({balancerTag,hosts:[id(0)]}))},routing:{balancers:tags.map(tag=>({tag,selector:['p'],strategy:{type:'random'}})),rules:[{type:'field',domain:['example.test'],outboundTag:'direct'},{network:'tcp,udp',balancerTag:tags[0]}]}};
 template.outbounds.push({tag:'direct',protocol:'freedom'});
 const original=structuredClone(template);
 const recipient=host(0),candidate=host(1);
 recipient.clientOverrides.xrayJsonVariants=assignedXrayTemplates({uuid:id(0),tags:[]},indexXrayTemplateAssignments([{uuid:id(8),name:'Shared',templateJson:template}]));
 recipient.clientOverrides.xrayJsonTemplate=recipient.clientOverrides.xrayJsonVariants[0].template;
 const generator=new XrayJsonGeneratorService({getCachedTemplateByType:async()=>({outbounds:[]})});
 const profiles=JSON.parse(await generator.generateConfig({hosts:[recipient,candidate],isExtendedClient:false}));
 assert.equal(profiles.length,10);
 assert.equal(new Set(profiles.map(p=>p.remarks)).size,10);
 assert.deepEqual(profiles.map(p=>p.routing.rules.find(r=>r.network==='tcp,udp').balancerTag),tags);
 for(const p of profiles){const out=p.outbounds.filter(o=>o.protocol==='vless');assert.equal(out.length,1);assert.equal(out[0].settings.vnext[0].users[0].id,id(9999));assert.equal(out[0].settings.vnext[0].address,'1.example.test')}
 const denied=JSON.parse(await generator.generateConfig({hosts:[recipient],isExtendedClient:false}));
 assert.deepEqual(denied,[],'filtered or quota-limited sources cannot reappear through another assignment');
 const forced=JSON.parse(await generator.generateConfig({hosts:[recipient],isExtendedClient:false,ignoreHostXrayJsonTemplate:true}));
 assert.equal(forced.length,1,'a response rule can explicitly override all host assignments');
 assert.deepEqual(template,original);
});

test('multiple exact host assignments override tag fallbacks and repeated tags do not duplicate profiles',()=>{
 const make=(label,assignments)=>({uuid:label,name:label,templateJson:{remnawave:{assignments},routing:{balancers:assignments.map(x=>({tag:x.balancerTag,selector:['p']}))}}});
 const a=make(id(8),[{balancerTag:'one',hosts:[id(0)],tags:['A','B']},{balancerTag:'two',hosts:[id(0)]}]);
 const b=make(id(9),[{balancerTag:'other',hosts:[id(0)]},{balancerTag:'fallback',tags:['A']}]);
 const index=indexXrayTemplateAssignments([a,b]);
 assert.equal(assignedXrayTemplates({uuid:id(0),tags:['A','B']},index).length,3);
 assert.equal(assignedXrayTemplates({uuid:id(1),tags:['A','B']},index).length,2);
 assert.equal(recipientXrayTemplates({uuid:id(0),tags:['A']},a.templateJson).length,2);
});

test('host resolution keeps one quota identity and all assigned variants with original speed and tag limits',async()=>{
 const assignmentModule=source('modules/hosts/utils/xray-template-assignments.ts');
 const {GetHostsForUserHandler}=source('modules/hosts/queries/get-hosts-for-user/get-hosts-for-user.handler.ts',{
  '../../utils/xray-template-assignments':assignmentModule,
  './get-hosts-for-user.query':{GetHostsForUserQuery:class{}},
  '@common/types':{ok:response=>({isOk:true,response}),fail:error=>{throw error}},
  '@libs/contracts/constants':{CACHE_KEYS:{},CACHE_KEYS_TTL:{},ERRORS:{}},
  '@modules/hosts/entities/host-with-inbound-tag.entity':{HostWithRawInbound:class{constructor(value){Object.assign(this,value)}}}
 });
 const template={routing:{balancers:Array.from({length:10},(_,i)=>({tag:'b'+i,selector:['p']}))},remnawave:{assignments:Array.from({length:10},(_,i)=>({balancerTag:'b'+i,hosts:[id(0)]}))}};
 const original={uuid:id(0),tags:['LIMIT'],configProfileInboundUuid:id(1),xrayJsonTemplateUuid:null,speedLimitMbps:20,deviceSpeedLimitMbps:5,userTrafficLimitBytes:1000n,effectiveLimitBytes:500n,usedBytes:500n};
 let reads=0;
 const handler=new GetHostsForUserHandler({findActiveHostsByUserId:async()=>[original],getAssignedXrayTemplates:async()=>[{uuid:id(8),name:'Multi',templateJson:template}]},{usageForUser:async()=>[{tag:'LIMIT',speedLimitMbps:10,limitBytes:'100',usedBytes:'100',ambiguous:false,paused:false}]},{cachedByKeys:async()=>++reads===1?new Map([[id(1),{rawInbound:{protocol:'vless'},tag:'inbound'}]]):new Map()});
 const {response}=await handler.execute({userId:1n});
 assert.equal(response.length,1);assert.equal(response[0].xrayJsonVariants.length,10);
 assert.equal(response[0].uuid,original.uuid);assert.equal(response[0].usedBytes,500n);
 assert.equal(response[0].effectiveLimitBytes,500n);assert.equal(response[0].speedLimitMbps,20);
 assert.equal(response[0].deviceSpeedLimitMbps,5);assert.equal(response[0].tagTrafficLimits[0].usedBytes,100n);
 const {isHostTrafficLimited}=source('modules/hosts/utils/host-traffic-limit.ts');
 assert.equal(isHostTrafficLimited(response[0]),true);
});


test('regex and recipient-tag selectors support random and UUID groups after eligibility filtering', async () => {
 const generator = new XrayJsonGeneratorService({});
 const recipient = host(0, ['LTE']);
 for(const selector of [{type:'tagRegex',pattern:'^LTE$'}, {type:'remarkRegex',pattern:'^[124]$'}, {type:'sameTagAsRecipient'}]) {
  const random={mode:'random',tagPrefix:'g',selector:{...selector,expected:2}};
  assert.equal(InjectHostsEntrySchema.safeParse(random).success,true);
  const sampled=await generator.resolveHosts(random,'HIDDEN',recipient,[recipient,...candidates],Date.now()+10000);
  assert.equal(sampled.length,2);assert.equal(new Set(sampled.map(h=>h.metadata.uuid)).size,2);
  assert.ok(sampled.every(h=>[id(1),id(2),id(4)].includes(h.metadata.uuid)));
  const grouped={...random,mode:'group',selector:{...selector,groups:{denied:[id(90)],allowed:[id(1),id(4)]}}};
  assert.equal(InjectHostsEntrySchema.safeParse(grouped).success,true);
  assert.deepEqual((await generator.resolveHosts(grouped,'HIDDEN',recipient,candidates,Date.now()+10000)).map(h=>h.metadata.uuid),[id(1),id(4)]);
 }
});
