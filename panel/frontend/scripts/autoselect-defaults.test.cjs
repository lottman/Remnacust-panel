const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');
const root = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor');
const xray = load(path.join(root, 'autoselect-model.ts'));
const native = load(path.join(root, 'client-template-model.ts'));
const { defaultAutoselectSources, xrayPoolPreview } = load(path.join(root, 'autoselect-sources.ts'));
const host = (n, values = {}) => ({ uuid: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`, isDisabled: false, isHidden: false, excludeFromSubscriptionTypes: [], ...values });

test('GUI-created Xray autoselect starts with eligible hosts and passes validation immediately', () => {
    const hosts = [host(1),host(2,{isHidden:true}),host(3,{isDisabled:true}),host(4,{excludeFromSubscriptionTypes:['XRAY_JSON']})];
    const sources=defaultAutoselectSources(hosts,'XRAY_JSON');
    const config=xray.parseTemplate(xray.addPool('{}',sources));
    assert.deepEqual(config.remnawave.injectHosts[0].selector.values,[hosts[0].uuid,hosts[1].uuid]);
    assert.equal(config.remnawave.injectHosts[0].mode,'all');
    assert.equal(xray.validationPath(config),null);
    assert.equal(xray.autoselectGroups(config).length,1);
});

for (const format of ['SINGBOX','MIHOMO','CLASH','STASH']) test(`GUI-created ${format} autoselect is complete and excludes disabled, hidden and excluded sources`, () => {
    const hosts=[host(1),host(2,{isHidden:true}),host(3,{isDisabled:true}),host(4,{excludeFromSubscriptionTypes:[format]})];
    const sources=defaultAutoselectSources(hosts,format);
    const code=native.addClientGroup('{}',format,sources),config=native.readClientTemplate(code,format);
    const group=config[native.nativeGroupPath(format)[0]][0];
    assert.deepEqual(group.remnawave.pool.selector.values,[hosts[0].uuid]);
    assert.equal(native.clientValidationPath(config,format),null);
});

test('no eligible hosts never fabricates IDs or changes access restrictions', () => {
    assert.deepEqual(defaultAutoselectSources([host(1,{isDisabled:true})],'XRAY_JSON'),[]);
    assert.equal(xray.validationPath(xray.parseTemplate(xray.addPool('{}',[]))),'remnawave.injectHosts.0.selector.values');
});

test('pool preview counts unique eligible sources across tags and groups without running regular expressions', () => {
    const hosts = [host(1,{tags:['NL','EU']}),host(2,{tags:['NL'],isHidden:true}),host(3,{tags:['NL'],isDisabled:true}),host(4,{tags:['NL'],excludeFromSubscriptionTypes:['XRAY_JSON']})];
    const pool = {selectFrom:'ALL',selector:{type:'tags',values:['NL','EU']}};
    assert.equal(xrayPoolPreview(pool,[...hosts,hosts[0]]),2);
    assert.equal(xrayPoolPreview({...pool,selectFrom:'HIDDEN'},hosts),1);
    assert.equal(xrayPoolPreview({...pool,selectFrom:'NOT_HIDDEN'},hosts),1);
    assert.equal(xrayPoolPreview({selectFrom:'ALL',mode:'group',selector:{type:'uuids',groups:{first:[hosts[0].uuid],second:[hosts[0].uuid,hosts[1].uuid,hosts[3].uuid]}}},hosts),2);
    assert.equal(xrayPoolPreview({selector:{type:'regex',values:['(a+)+$']}},hosts),null);
});
