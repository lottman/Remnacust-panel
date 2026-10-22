const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../../backend/tests/load-typescript.cjs');
const m = load(path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor/client-template-model.ts'));

for (const format of ['MIHOMO','STASH','CLASH']) {
    test(`${format}: GUI edits preserve YAML comments and unrelated settings; rename/removal updates references`, () => {
        const source = '# retain comment\ncustom-setting: keep\nproxy-groups:\n  - name: manual\n    type: select\n    proxies: [DIRECT]\nrules:\n  - DOMAIN,blocked.test,REJECT\n  - MATCH,manual\n';
        let code = m.addClientGroup(source, format);
        assert.ok(code.includes('# retain comment'));
        let result = m.readClientTemplate(code, format);
        assert.equal(result['custom-setting'], 'keep'); assert.equal(result['proxy-groups'][1].type, 'url-test');
        assert.deepEqual(result.rules, ['DOMAIN,blocked.test,REJECT','MATCH,manual']);
        code = m.editClientTemplate(code, format, ['proxy-groups',1,'remnawave','pool','selector'], {type:'tags',values:['NL']});
        code = m.editClientTemplate(code, format, ['proxy-groups',0,'proxies'], ['auto','DIRECT']);
        code = m.renameClientGroup(code, format, 1, 'Fast');
        result = m.readClientTemplate(code, format);
        assert.deepEqual(result['proxy-groups'][0].proxies, ['Fast','DIRECT']);
        assert.equal(m.clientValidationPath(result,format), null);
        code = m.removeClientGroup(code, format, 1);
        result = m.readClientTemplate(code, format);
        assert.deepEqual(result['proxy-groups'][0].proxies, ['DIRECT']); assert.equal(result['proxy-groups'].length, 1);
        assert.ok(code.includes('# retain comment')); assert.equal(result['custom-setting'],'keep');
    });
}

test('sing-box creates URLTest and keeps route restrictions; deletion removes only its references', () => {
    const source = {outbounds:[{type:'selector',tag:'manual',outbounds:[]},{type:'direct',tag:'direct'}],route:{final:'manual',rules:[{domain:['blocked.test'],action:'reject'}]}};
    let code = m.addClientGroup(JSON.stringify(source), 'SINGBOX');
    let result = m.readClientTemplate(code,'SINGBOX');
    assert.equal(result.route.final,'manual'); assert.equal(result.outbounds[2].type,'urltest');
    code = m.editClientTemplate(code,'SINGBOX',['outbounds',0,'outbounds'],['auto','direct']);
    code = m.renameClientGroup(code,'SINGBOX',2,'Fast');
    assert.deepEqual(m.readClientTemplate(code,'SINGBOX').outbounds[0].outbounds,['Fast','direct']);
    result=m.readClientTemplate(m.removeClientGroup(code,'SINGBOX',2),'SINGBOX');
    assert.deepEqual(result.route,source.route); assert.deepEqual(result.outbounds[0].outbounds,['direct']);
});

test('invalid syntax, duplicate YAML keys, incomplete pools and unconfigured file actions cannot be saved', () => {
    assert.throws(()=>m.readClientTemplate('a: 1\na: 2\n','MIHOMO'));
    assert.throws(()=>m.readClientTemplate('[]','SINGBOX'));
    const pool=m.readClientTemplate(m.addClientGroup('{}','SINGBOX'),'SINGBOX');
    assert.equal(m.clientValidationPath(pool,'SINGBOX'),'outbounds.0.remnawave.pool');
    assert.equal(m.clientValidationPath({remnacust:{geofiles:[{id:'test',target:''}]}},'SINGBOX'),'remnacust.geofiles.0');
});

test('YAML merge aliases survive edits; file routing follows group renames and requires reassignment on deletion', () => {
    const text='defaults: &defaults\n  interval: 600\nproxy-groups:\n - <<: *defaults\n   name: auto\n   type: url-test\n   proxies: []\nremnacust:\n  geofiles:\n   - id: file\n     target: auto\n';
    const renamed=m.renameClientGroup(text,'MIHOMO',0,'Fast');
    assert.equal(m.readClientTemplate(renamed,'MIHOMO')['proxy-groups'][0].interval,600);
    assert.equal(m.readClientTemplate(renamed,'MIHOMO').remnacust.geofiles[0].target,'Fast');
    const removed=m.readClientTemplate(m.removeClientGroup(renamed,'MIHOMO',0),'MIHOMO');
    assert.equal(removed.remnacust.geofiles[0].target,'');
    assert.equal(m.clientValidationPath(removed,'MIHOMO'),'remnacust.geofiles.0');
    assert.equal(m.clientValidationPath({remnacust:{geofiles:[{id:'x',target:5}]}},'SINGBOX'),'remnacust.geofiles.0');
});
