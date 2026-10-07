const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src');
function source(name, overrides = {}) {
    const filename = path.join(root, name);
    const mocks = {};
    for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
        if (match[1].startsWith('@common/') || match[1].startsWith('@modules/') || match[1].startsWith('@libs/') || match[1].startsWith('@queue/') || match[1].startsWith('.')) mocks[match[1]] = {};
    }
    return load(filename, { ...mocks, ...overrides });
}
const cipher = source('common/helpers/xray-config/ss-cipher.ts');
const validator = source('common/helpers/xray-config/xray-config.validator.ts', { './ss-cipher': cipher });
const { XRayConfig, XrayConfigValidationError } = validator;
const config = () => ({ inbounds: [{ tag: 'VLESS', protocol: 'vless', port: 443, settings: { clients: [], decryption: 'none' } }], outbounds: [{ tag: 'direct', protocol: 'freedom' }] });
const error = message => ({ code: 'A061', httpCode: 422, message });
const { ConfigProfileService } = source('modules/config-profiles/config-profile.service.ts', {
    '@nestjs-cls/transactional': { Transactional: () => () => {} },
    '@common/helpers/xray-config': validator,
    '@common/types': { fail: e => ({ isOk: false, ...e }), ok: response => ({ isOk: true, response }) },
    '@common/utils/inbounds': source('common/utils/inbounds/diff-inbounds.util.ts'),
    '@libs/contracts/constants': { CACHE_KEYS: { RAW_INBOUND: id => id } },
    '@libs/contracts/constants/errors': { ERRORS: { CONFIG_VALIDATION_ERROR: { withMessage: error }, UPDATE_CONFIG_PROFILE_ERROR: { code: 'A172', httpCode: 500 }, CREATE_CONFIG_PROFILE_ERROR: { code: 'A171', httpCode: 500 } } },
    './entities/config-profile.entity': source('modules/config-profiles/entities/config-profile.entity.ts'),
    './entities/config-profile-inbound.entity': source('modules/config-profiles/entities/config-profile-inbound.entity.ts'),
    './models/get-config-profile-by-uuid.response.model': source('modules/config-profiles/models/get-config-profile-by-uuid.response.model.ts'),
});

function setup(queueFails = false) {
    const events = [];
    const record = { uuid: 'profile', name: 'Profile', config: config(), inbounds: [], nodes: [] };
    const repository = {
        getConfigProfileByUUID: async () => record,
        getRevisions: async () => [record],
        saveRevision: async () => events.push('revision'),
        createManyConfigProfileInbounds: async rows => events.push(['inbounds', rows]),
        update: async changes => { events.push('write'); Object.assign(record, changes); return record; },
    };
    const queues = { startAllNodesByProfile: async () => { events.push('queue'); if (queueFails) throw Error('redis unavailable'); } };
    const cache = { delMany: async () => events.push('cache') };
    return { service: new ConfigProfileService(repository, queues, {}, cache), record, events };
}

test('missing/misspelled protocol and malformed config are rejected with a config error', () => {
    for (const value of [null, [], 'null', { inbounds: {} }, { inbounds: [null] }, { inbounds: [{ tag: 'SERVICE', protol: 'vless' }] }, { inbounds: [{ tag: 'SERVICE', protocol: 5 }] }]) {
        assert.throws(() => new XRayConfig(value), XrayConfigValidationError);
    }
    assert.throws(() => new XRayConfig({ inbounds: [{ tag: 'SERVICE', protol: 'vless' }] }), /field "protocol" is required/);
    assert.throws(() => new XRayConfig({ inbounds: [{ tag: 'SERVICE', protocol: 'socks' }] }), /Invalid protocol/);
});

test('invalid edit does not write a profile, revision, inbound or queue operation', async () => {
    const { service, events, record } = setup();
    const before = JSON.stringify(record);
    const result = await service.updateConfigProfile('profile', undefined, { inbounds: [{ tag: 'SERVICE', protol: 'vless' }] });
    assert.equal(result.isOk, false);
    assert.equal(result.httpCode, 422);
    assert.match(result.message, /protocol/);
    assert.deepEqual(events, []);
    assert.equal(JSON.stringify(record), before);
});

test('legacy invalid profiles remain readable for correction', async () => {
    const { service, record } = setup();
    record.config = { inbounds: [{ tag: 'legacy', protol: 'vless' }] };
    const result = await service.getConfigProfileByUUID('profile');
    assert.equal(result.isOk, true);
    assert.deepEqual(result.response.config, record.config);
});

test('saved config retains supported service inbounds and clears cache before queuing', async () => {
    const { service, events, record } = setup();
    const next = config();
    next.inbounds.push({ tag: 'SERVICE', protocol: 'http', port: 1080, listen: '127.0.0.1', settings: { accounts: [{ user: 'local', pass: 'test-only' }] } });
    const result = await service.updateConfigProfile('profile', undefined, next);
    assert.equal(result.isOk, true);
    assert.equal(result.response.applyStatus, 'queued');
    assert.deepEqual(record.config.inbounds.find(i => i.tag === 'SERVICE'), next.inbounds.find(i => i.tag === 'SERVICE'));
    const runtime = new XRayConfig(record.config);
    runtime.leaveInbounds(new Set(['VLESS']));
    assert.ok(runtime.getConfig().inbounds.some(i => i.tag === 'SERVICE'));
    assert.ok(events.indexOf('cache') < events.indexOf('queue'));
});

test('queue failure is reported as saved with failed synchronization, not an unsaved config', async () => {
    const { service, events } = setup(true);
    const result = await service.updateConfigProfile('profile', undefined, config());
    assert.equal(result.isOk, true);
    assert.equal(result.response.applyStatus, 'failed');
    assert.ok(events.includes('write'));
    assert.ok(events.includes('revision'));
});
