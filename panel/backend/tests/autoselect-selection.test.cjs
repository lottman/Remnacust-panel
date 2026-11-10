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

function regionalTemplate() {
    return {
        outbounds: [{ tag: 'direct', protocol: 'freedom' }],
        remnawave: {
            injectHosts: ['DE', 'NL'].map(tag => ({ mode: 'all', selectFrom: 'HIDDEN', tagPrefix: tag, selector: { type: 'tags', values: [tag] } })),
            assignments: [{ hosts: [id(0)], balancerTag: 'auto-de' }],
        },
        routing: {
            balancers: ['DE', 'NL'].map(tag => ({ tag: 'auto-' + tag.toLowerCase(), selector: [tag], strategy: { type: 'leastPing' } })),
            rules: [{ type: 'field', network: 'tcp,udp', balancerTag: 'auto-nl' }],
        },
        burstObservatory: { subjectSelector: ['DE', 'NL'], pingConfig: { interval: '1m', sampling: 3 } },
    };
}

test('assigned regional profiles inject and probe only reachable pools, without changing the saved template', async () => {
    const template = regionalTemplate(), before = structuredClone(template);
    const selected = recipientXrayTemplate({ uuid: id(0), tags: [] }, template);
    assert.deepEqual(selected.routing.balancers.map(value => value.tag), ['auto-de']);
    assert.deepEqual(selected.remnawave.injectHosts.map(value => value.tagPrefix), ['DE']);
    assert.deepEqual(selected.burstObservatory.subjectSelector, ['DE']);
    const generator = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => selected });
    const [generated] = JSON.parse(await generator.generateConfig({ hosts: [host(0), host(1, ['DE']), host(2, ['NL'])], isExtendedClient: false }));
    assert.deepEqual(generated.outbounds.map(value => value.tag), ['DE', 'direct']);
    assert.deepEqual(generated.burstObservatory.subjectSelector, ['DE']);
    assert.equal(generated.burstObservatory.pingConfig.interval, '1m');
    assert.equal(generated.burstObservatory.pingConfig.sampling, 3);
    assert.deepEqual(template, before);
});

test('an inaccessible unrelated regional pool cannot remove a valid assigned profile', async () => {
    const selected = recipientXrayTemplate({ uuid: id(0), tags: [] }, regionalTemplate());
    const generator = new XrayJsonGeneratorService({ getCachedTemplateByType: async () => selected });
    const generated = JSON.parse(await generator.generateConfig({ hosts: [host(0), host(1, ['DE'])], isExtendedClient: false }));
    assert.equal(generated.length, 1);
    assert.equal(generated[0].outbounds[0].tag, 'DE');
});

test('assignment indexing scopes only matching recipients and reuses each balancer variant', () => {
    const template = regionalTemplate();
    template.remnawave.assignments.push({ hosts: [id(1)], balancerTag: 'auto-de' });
    const unrelated = { remnawave: { assignments: [{ hosts: [id(99)], balancerTag: 'unused' }] } };
    Object.defineProperty(unrelated, 'routing', { get() { throw Error('unrelated routing must not be walked'); } });
    const recipients = [{ uuid: id(0), tags: [] }, { uuid: id(1), tags: [] }];
    const index = indexXrayTemplateAssignments([
        { uuid: id(8), templateJson: unrelated },
        { uuid: id(9), templateJson: template },
    ], recipients);
    const first = assignedXrayTemplates(recipients[0], index)[0];
    const second = assignedXrayTemplates(recipients[1], index)[0];
    assert.strictEqual(first.template, second.template);
    assert.equal(index.rank.size, 2);
    assert.equal(index.hosts.has(id(99)), false);
    assert.equal(indexXrayTemplateAssignments([{ uuid: id(8), templateJson: unrelated }], []).rank.size, 0);
    const tagTemplate = regionalTemplate();
    tagTemplate.remnawave.assignments = [{ tags: ['NL'], balancerTag: 'auto-nl' }];
    const tagged = { uuid: id(10), tags: ['NL'] };
    assert.equal(assignedXrayTemplates(tagged, indexXrayTemplateAssignments([
        { uuid: id(9), templateJson: tagTemplate },
    ], [tagged]))[0].template.routing.rules[0].balancerTag, 'auto-nl');
    template.remnawave.assignments = [
        { tags: ['first'], balancerTag: 'auto-de' },
        { tags: ['second'], balancerTag: 'auto-nl' },
        { tags: ['third'], balancerTag: 'auto-de' },
    ];
    const ordered = { uuid: id(10), tags: ['second', 'third'] };
    assert.deepEqual(assignedXrayTemplates(ordered, indexXrayTemplateAssignments([
        { uuid: id(9), templateJson: template },
    ])).map(item => item.key), [id(9) + ':auto-nl', id(9) + ':auto-de']);
});

test('regional scoping retains other balancers used by site rules and explicit fallback outbounds', () => {
    const template = regionalTemplate();
    template.routing.rules.unshift({ type: 'field', domain: ['example.test'], balancerTag: 'auto-nl' });
    let selected = recipientXrayTemplate({ uuid: id(0), tags: [] }, template);
    assert.equal(selected.routing.balancers.length, 2);
    assert.equal(selected.remnawave.injectHosts.length, 2);
    template.routing.rules.shift();
    template.routing.balancers[0].fallbackTag = 'NL';
    selected = recipientXrayTemplate({ uuid: id(0), tags: [] }, template);
    assert.deepEqual(selected.routing.balancers.map(value => value.tag), ['auto-de']);
    assert.equal(selected.remnawave.injectHosts.length, 2);
    template.remnacust = { geofiles: [{ target: 'auto-nl' }] };
    selected = recipientXrayTemplate({ uuid: id(0), tags: [] }, template);
    assert.equal(selected.routing.balancers.length, 2);
});

test('regional optimization preserves manual proxy dependencies, geodata and dynamic or Lua configurations', () => {
    const template = regionalTemplate();
    template.geodata = { outbound: 'NL' };
    assert.equal(recipientXrayTemplate({ uuid: id(0), tags: [] }, template).remnawave.injectHosts.length, 2);
    delete template.geodata;
    template.outbounds[0].proxySettings = { tag: 'NL-2' };
    assert.equal(recipientXrayTemplate({ uuid: id(0), tags: [] }, template).remnawave.injectHosts.length, 2);
    delete template.outbounds[0].proxySettings;
    template.outbounds[0].streamSettings = { sockopt: { dialerProxy: 'NL' } };
    assert.equal(recipientXrayTemplate({ uuid: id(0), tags: [] }, template).remnawave.injectHosts.length, 2);
    delete template.outbounds[0].streamSettings;
    template.remnawave.injectHosts[1].useHostRemarkAsTag = true;
    assert.equal(recipientXrayTemplate({ uuid: id(0), tags: [] }, template).remnawave.injectHosts.length, 2);
    delete template.remnawave.injectHosts[1].useHostRemarkAsTag;
    template.routing.rules.unshift({ type: 'lua', script: 'custom dynamic routing' });
    assert.equal(recipientXrayTemplate({ uuid: id(0), tags: [] }, template).routing.balancers.length, 2);
    template.routing.rules.shift();
    template.custom = Array.from({ length: 80 }).reduce(value => ({ nested: value }), {});
    assert.equal(recipientXrayTemplate({ uuid: id(0), tags: [] }, template).remnawave.injectHosts.length, 2);
});

test('saved assignment descriptions follow rendering precedence and expose no template content', () => {
    const { describeXrayTemplateAssignments: describe } = source('modules/hosts/utils/xray-template-assignments.ts');
    const tagged = regionalTemplate(), direct = regionalTemplate();
    tagged.remnawave.assignments = [{ tags: ['EU'], balancerTag: 'auto-nl' }];
    const rows = [{ uuid: id(10), name: 'Tags', templateJson: tagged }, { uuid: id(11), name: 'Direct', templateJson: direct }];
    const before = structuredClone(rows);
    assert.deepEqual(describe({ uuid: id(0), tags: ['EU'] }, rows), { source: 'HOST_ASSIGNMENT', templates: [{ uuid: id(11), name: 'Direct', balancerTag: 'auto-de' }] });
    assert.deepEqual(describe({ uuid: id(0), tags: ['EU'], xrayJsonTemplateUuid: id(10) }, rows), { source: 'HOST', templates: [{ uuid: id(10), name: 'Tags', balancerTag: 'auto-nl' }] });
    assert.equal(describe({ uuid: id(3), tags: ['EU'] }, rows).source, 'TAG_ASSIGNMENT');
    assert.deepEqual(describe({ uuid: id(3), tags: [] }, rows), { source: 'DEFAULT', templates: [] });
    assert.deepEqual(rows, before);
});

test('assignment inspection is an authenticated administrator-only read', () => {
    const { endpoints, authorize, ROLE } = require('./api-permissions-fixture.cjs');
    const endpoint = endpoints.find(item => item.method === 'GET' && item.url === '/api/hosts/panel-template-assignments/{uuid}');
    assert(endpoint);
    assert.equal(authorize(endpoint, ROLE.ADMIN), true);
    assert.equal(authorize(endpoint, ROLE.API, ['*']), false);
    assert.equal(authorize(endpoint, ROLE.API, ['hosts:template-assignments', 'subscription-templates:read']), false);
    assert.equal(authorize(endpoint, undefined), false);
    const { HEADERS_METADATA } = require('@nestjs/common/constants');
    assert(Reflect.getMetadata(HEADERS_METADATA, endpoint.handler).some(item => item.name === 'Cache-Control' && item.value === 'no-store'));
});

test('assignment inspection reads lightweight metadata once and never queries templates for an unknown host', async () => {
    const { describeXrayTemplateAssignments } = source('modules/hosts/utils/xray-template-assignments.ts');
    const constants = require('../libs/contract/build/backend/constants');
    const { HostsService } = source('modules/hosts/hosts.service.ts', {
        './utils/xray-template-assignments': { describeXrayTemplateAssignments },
        '@common/types': { ok: response => ({ isOk: true, response }), fail: error => ({ isOk: false, error }) },
        '@libs/contracts/constants': constants,
    });
    let current = null, reads = 0;
    const service = Object.create(HostsService.prototype);
    service.hostsRepository = {
        findByUUID: async value => { assert.equal(value, id(0)); return current; },
        getXrayAssignmentCatalog: async () => { reads++; return [{ uuid: id(9), name: 'Region', templateJson: regionalTemplate() }]; },
    };
    assert.equal((await service.getTemplateAssignments(id(0))).error.code, constants.ERRORS.HOST_NOT_FOUND.code);
    assert.equal(reads, 0);
    current = { uuid: id(0), tags: [], xrayJsonTemplateUuid: null };
    const result = await service.getTemplateAssignments(id(0));
    assert.equal(result.response.source, 'HOST_ASSIGNMENT');
    assert.equal(reads, 1);
    const k = require('kysely'), queries = [];
    const driver = { init: async () => {}, acquireConnection: async () => ({ executeQuery: async query => { queries.push(query); return { rows: [] }; } }), releaseConnection: async () => {}, destroy: async () => {} };
    const db = new k.Kysely({ dialect: { createDriver: () => driver, createAdapter: () => new k.PostgresAdapter(), createIntrospector: value => new k.PostgresIntrospector(value), createQueryCompiler: () => new k.PostgresQueryCompiler() }, plugins: [new k.CamelCasePlugin()] });
    const { HostsRepository } = source('modules/hosts/repositories/hosts.repository.ts');
    const repo = Object.create(HostsRepository.prototype);
    repo.qb = { kysely: db };
    try { await repo.getXrayAssignmentCatalog(); } finally { await db.destroy(); }
    assert.equal(queries.length, 1);
    assert(queries[0].sql.includes("template_json #> '{remnawave,assignments}'"));
    assert(queries[0].sql.includes("template_json #> '{remnawave,assignTo}'"));
    assert(!queries[0].sql.includes('select *'));
    assert.deepEqual(queries[0].parameters, ['XRAY_JSON']);
});

test('empty host resolution skips global template, quota and raw-cache reads without hiding query failures',async()=>{
 const {GetHostsForUserHandler}=source('modules/hosts/queries/get-hosts-for-user/get-hosts-for-user.handler.ts',{
  './get-hosts-for-user.query':{GetHostsForUserQuery:class{}},
  '@common/types':{ok:response=>({isOk:true,response}),fail:error=>({isOk:false,error})},
  '@libs/contracts/constants':{ERRORS:{INTERNAL_SERVER_ERROR:'internal'}},
  '@modules/hosts/entities/host-with-inbound-tag.entity':{HostWithRawInbound:class{}}
 });
 let reads=0;
 const forbidden=async()=>{reads++;throw Error('must not read unrelated data')};
 const repository={findActiveHostsByUserId:async()=>[],getAssignedXrayTemplates:forbidden};
 const handler=new GetHostsForUserHandler(repository,{usageForUser:forbidden},{cachedByKeys:forbidden});
 handler.logger={error(){}};
 assert.deepEqual(await handler.execute({userId:1n}),{isOk:true,response:[]});
 assert.equal(reads,0);
 repository.findActiveHostsByUserId=async()=>{throw Error('database unavailable')};
 assert.equal((await handler.execute({userId:1n})).isOk,false);
 assert.equal(reads,0);
});
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

test('autoselect can use a quota-limited source only with recipient-scoped credentials', async () => {
    const owner = host(0),
        source = host(1);
    source.clientOverrides.selectionOnly = true;
    const template = {
        outbounds: [],
        remnawave: {
            injectHosts: [
                {
                    mode: 'all',
                    selectFrom: 'ALL',
                    tagPrefix: 'p',
                    selector: { type: 'uuids', values: [id(1)] },
                },
            ],
        },
        routing: {
            balancers: [{ tag: 'b', selector: ['p'], strategy: { type: 'random' } }],
            rules: [{ network: 'tcp,udp', balancerTag: 'b' }],
        },
    };
    owner.clientOverrides.xrayJsonTemplate = template;
    const generator = new XrayJsonGeneratorService({
        getCachedTemplateByType: async () => ({ outbounds: [] }),
    });
    let calls = 0;
    const options = {
        hosts: [owner],
        isExtendedClient: false,
        autoselectCandidates: async () => [source],
        autoselectSelections: new Map(),
        bindAutoselect: async (ownerUuid, ids) => {
            calls++;
            assert.equal(ownerUuid, id(0));
            assert.deepEqual(ids, [id(1)]);
            return [
                {
                    ...source,
                    clientOverrides: { ...source.clientOverrides, selectionOnly: undefined },
                    protocolOptions: { ...source.protocolOptions, id: id(9998) },
                },
            ];
        },
    };
    for (let attempt = 0; attempt < 2; attempt++) {
        const profiles = JSON.parse(await generator.generateConfig(options));
        assert.equal(profiles.length, 1);
        assert.equal(profiles[0].outbounds[0].settings.vnext[0].users[0].id, id(9998));
    }
    assert.equal(calls, 2);
    await assert.rejects(
        generator.generateConfig({ ...options, bindAutoselect: undefined }),
        /unbound-autoselect-source/,
    );
});
