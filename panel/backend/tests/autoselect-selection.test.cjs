const assert = require('node:assert/strict');
const { test } = require('node:test');
const { source } = require('./upstream-filter-fixture.cjs');
const load = require('./load-typescript.cjs');
const path = require('node:path');
const { selectInjectHosts } = source('modules/subscription-template/generators/inject-host-selection.ts');
const { InjectHostsEntrySchema, RemnawaveInjectorSchema } = load(path.join(__dirname, '../libs/contract/models/xray-json-advanced/remnawave-injector.schema.ts'));
const { indexXrayTemplateAssignments, assignedXrayTemplate } = source('modules/hosts/utils/xray-template-assignments.ts');
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
