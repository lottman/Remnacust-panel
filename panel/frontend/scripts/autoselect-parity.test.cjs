const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');
const { source } = require('../../backend/tests/upstream-filter-fixture.cjs');
const { pool, mocks, regex } = require('../../backend/tests/client-pool-fixture.cjs');
const { load: yaml } = require('../../backend/node_modules/js-yaml');
const editor = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor');
const m = load(path.join(editor, 'autoselect-model.ts'));
const native = load(path.join(editor, 'client-template-model.ts'));
const selection = source('modules/subscription-template/generators/inject-host-selection.ts');
const { XrayJsonGeneratorService } = source('modules/subscription-template/generators/xray-json.generator.service.ts', {
    './inject-host-selection': selection,
    '@common/utils/bounded-regex': regex,
    '@common/utils': { isNonEmptyObject: value => value && Object.keys(value).length > 0 },
    '../host-mapper': { applyHostMapper: value => value },
});
test.after(() => regex.configuredRegex.close());
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function host(n, hidden = true) {
    return { protocol: 'shadowsocks', protocolOptions: {password:'test-only',method:'aes-128-gcm'},
        address:`node${n}.example.test`,port:443,transport:'tcp',transportOptions:{},security:'none',
        securityOptions:{},streamOverrides:{finalMask:null,sockopt:null},mux:null,finalRemark:`EU-${n}`,
        clientOverrides:{mapper:{xrayJson:null,mihomo:null,singbox:null}},
        metadata:{uuid:id(n),tags:['EU'],isHidden:hidden,excludeFromSubscriptionTypes:[]} };
}
const hosts = [host(0,false),host(1),host(2),host(3)];
hosts[3].metadata.excludeFromSubscriptionTypes = ['XRAY_JSON','MIHOMO','CLASH','STASH','SINGBOX'];
async function xray(config, candidates = hosts) {
    return JSON.parse(await new XrayJsonGeneratorService({getCachedTemplateByType:async()=>structuredClone(config)})
        .generateConfig({hosts:candidates,isExtendedClient:false}));
}

for (const strategy of ['leastPing','leastLoad','random','roundRobin','priority']) {
    test(`GUI and hand-written JSON deliver the same ${strategy} Xray profile`, async () => {
        let gui = m.addPool('{"outbounds":[]}', [id(2),id(3),id(1)]);
        gui = m.setBalancerStrategy(gui,0,strategy);
        const handwritten = {outbounds:[],remnawave:{injectHosts:[{
            selector:{type:'uuids',values:[id(2),id(3),id(1)]},mode:'all',selectFrom:'ALL',tagPrefix:'auto'
        }]},routing:{balancers:[{tag:'balance-auto',selector:['auto'],
            ...(strategy==='priority'?{}:{fallbackTag:'auto'}),strategy:{type:strategy}}],
            rules:[{type:'field',network:'tcp,udp',balancerTag:'balance-auto'}]}};
        if (['leastPing','leastLoad','priority'].includes(strategy)) handwritten.observatory = {
            subjectSelector:['auto'],probeUrl:'https://www.gstatic.com/generate_204',probeInterval:'30s',enableConcurrency:true
        };
        const before = structuredClone(handwritten);
        const generated = await xray(JSON.parse(gui));
        assert.deepEqual(generated, await xray(handwritten));
        assert.deepEqual(handwritten,before,'cached source remains unchanged');
        assert.deepEqual(generated[0].outbounds.filter(o=>o.tag==='auto'||o.tag==='auto-2').map(o=>o.settings.servers[0].address),
            ['node2.example.test','node1.example.test']);
        assert.equal(generated[0].remnawave,undefined);
    });
}

for (const type of ['remarkRegex','tagRegex','sameTagAsRecipient']) {
    test(`${type}: converting grouped selection retains the intersection, order and access boundary`, async () => {
        const selector = {type,groups:{first:[id(2),id(3)],second:[id(1),id(2)]},
            ...(type.endsWith('Regex')?{pattern:'^EU'}:{})};
        const converted = m.connectionPool({mode:'group',selectFrom:'ALL',tagPrefix:'p',selector});
        const recipient = structuredClone(hosts[0]);
        const sourceConfig = {outbounds:[],remnawave:{injectHosts:[converted]}};
        const generated = (await xray(sourceConfig,[recipient,...hosts.slice(1),host(4)]))[0];
        assert.deepEqual(generated.outbounds.map(o=>o.settings.servers[0].address),['node2.example.test','node1.example.test']);
        assert.deepEqual(selector.groups,{first:[id(2),id(3)],second:[id(1),id(2)]});
    });
}

for (const format of ['MIHOMO','CLASH','STASH','SINGBOX']) {
    test(`${format}: GUI automatic selection has working probe settings and equals code through the real generator`, async () => {
        const sing = format==='SINGBOX', key = sing?'outbounds':'proxy-groups';
        let gui = native.addClientGroup(sing?'{}':'{}',format,[id(2),id(1),id(3)]);
        gui = native.editClientTemplate(gui,format,[key,0,'type'],sing?'selector':'select');
        for (const property of ['url','interval','tolerance'])
            gui = native.editClientTemplate(gui,format,[key,0,property],undefined);
        gui = native.selectClientOnConnection(gui,format,0);
        const config = native.readClientTemplate(gui,format);
        const group = config[key][0];
        assert.equal(group.url,'https://www.gstatic.com/generate_204');
        assert.equal(group.interval,sing?'5m':300);
        const handwritten = {
            [key]:[{...(sing?{tag:'auto',type:'urltest',outbounds:[]}:{name:'auto',type:'url-test',proxies:[]}),
                url:'https://www.gstatic.com/generate_204',interval:sing?'5m':300,tolerance:50,
                remnawave:{pool:{mode:'all',selectFrom:'NOT_HIDDEN',selector:{type:'uuids',values:[id(2),id(1),id(3)]}}}}],
            ...(sing?{route:{final:'auto'}}:{rules:['MATCH,auto']})
        };
        const file = sing?'singbox':format==='MIHOMO'?'mihomo':'clash';
        const className = sing?'SingBoxGeneratorService':format==='MIHOMO'?'MihomoGeneratorService':'ClashGeneratorService';
        const exports = load(path.join(__dirname,`../../backend/src/modules/subscription-template/generators/${file}.generator.service.ts`),{
            ...mocks,'./client-pool':pool,'@common/utils':{isNonEmptyObject:v=>v&&Object.keys(v).length>0,parseIntRangeUtil:v=>[Number(v)]},
            '@libs/contracts/constants':{FINGERPRINTS:[]},'../host-mapper':{applyHostMapper:v=>v}
        });
        const generate = async template => {
            const output = await new exports[className]({getCachedTemplateByType:async()=>structuredClone(template)})
                .generateConfig(hosts.map(h=>({...h,metadata:{...h.metadata,isHidden:false}})));
            return sing?JSON.parse(output):yaml(output);
        };
        const generated = await generate(config);
        assert.deepEqual(generated,await generate(handwritten));
        const actual = sing?generated.outbounds.find(g=>g.tag==='auto'):generated[key][0];
        assert.deepEqual(actual[sing?'outbounds':'proxies'],['EU-2','EU-1']);
        assert.equal(actual.remnawave,undefined);
    });
}
