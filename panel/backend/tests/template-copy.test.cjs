const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const directory = path.join(__dirname, '../src/modules/subscription-template');
const { ERRORS } = load(path.join(__dirname, '../libs/contract/constants/errors/errors.ts'));
const { SubscriptionTemplateService } = load(path.join(directory, 'subscription-template.service.ts'), {
    '@common/types': { ok: response => ({ isOk: true, response }), fail: error => ({ isOk: false, error }) },
    '@common/utils': {}, '@libs/contracts/constants': { ERRORS, CACHE_KEYS: {} }, '@libs/contracts/models': {},
    './constants': {}, './models/get-templates.response.model': {},
});
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const source = {
    uuid: id, name: 'Default', tags: ['test'], viewPosition: 4, templateType: 'XRAY_JSON',
    templateJson: { remnawave: { assignTo: { hosts: [id] }, assignments: [{ hosts: [id], balancerTag: 'auto' }], injectHosts: [] }, remnacust: { geofiles: [{ id: 'shared-file', target: 'DIRECT' }] } },
    draftContent: '{ unfinished', templateYaml: null,
};
test('a single create copies content, tags and invalid drafts without stealing host assignments', async () => {
    let written;
    const service = new SubscriptionTemplateService({ findByUUID: async () => source, create: async entity => (written = { ...entity, uuid: 'new', viewPosition: 5 }) }, {});
    service.logger = { error() {} };
    const before = structuredClone(source);
    const result = await service.createTemplate('Default copy', 'XRAY_JSON', id);
    assert.equal(result.isOk, true);
    assert.equal(written.draftContent, source.draftContent);
    assert.deepEqual(written.tags, ['test']);
    assert.deepEqual(written.templateJson.remnacust.geofiles, source.templateJson.remnacust.geofiles);
    assert.deepEqual(written.templateJson.remnawave, { injectHosts: [] });
    assert.deepEqual(source, before);
    assert.equal(written.createdAt, undefined);
});
test('YAML copies preserve exact code and JSON copies remove assignments from parseable drafts', async () => {
    for (const type of ['MIHOMO', 'CLASH', 'STASH', 'SINGBOX', 'XRAY_JSON']) {
        let written;
        const original = { ...source, templateType: type, templateYaml: '# comment\nproxies: []\n', draftContent: JSON.stringify(source.templateJson) };
        const service = new SubscriptionTemplateService({ findByUUID: async () => original, create: async entity => (written = { ...entity, uuid: 'new' }) }, {});
        assert.equal((await service.createTemplate('Copy', type, id)).isOk, true);
        assert.equal(written.templateYaml, original.templateYaml);
        if (type === 'XRAY_JSON') assert.deepEqual(JSON.parse(written.draftContent).remnawave, { injectHosts: [] });
    }
});
test('missing or mismatching sources never create partial copies', async () => {
    for (const value of [null, { ...source, templateType: 'SINGBOX' }]) {
        let creates = 0;
        const service = new SubscriptionTemplateService({ findByUUID: async () => value, create: async () => creates++ }, {});
        const result = await service.createTemplate('Copy', 'XRAY_JSON', id);
        assert.equal(result.isOk, false);
        assert.equal(creates, 0);
    }
});
