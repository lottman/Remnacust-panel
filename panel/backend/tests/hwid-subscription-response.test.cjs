const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const load = require('./load-typescript.cjs');
const filename = path.join(__dirname, '../src/modules/subscription/subscription.service.ts');
const mocks = Object.fromEntries([...fs.readFileSync(filename, 'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(match => [match[1], {}]));
class Query {}
class Response { constructor(value) { Object.assign(this, value); } }
mocks['@nestjs/common'] = { Injectable: () => value => value, Logger: class {} };
mocks['@libs/contracts/constants'] = { USERS_STATUS: { ACTIVE: 'ACTIVE', DISABLED: 'DISABLED', EXPIRED: 'EXPIRED' } };
mocks['@modules/users/queries/get-user-by-unique-field'] = { GetUserByUniqueFieldQuery: Query };
mocks['@modules/hwid-user-devices/queries/check-hwid-exists/check-hwid-exists.query'] = { CheckHwidExistsQuery: Query };
mocks['@common/utils/templates/replace-templates-values'] = { TemplateEngine: {
    formatWithUser: value => 'base64:' + Buffer.from(value.replace('rwEncodeBase64:', '')).toString('base64'),
} };
mocks['./models'] = { SubscriptionWithConfigResponse: Response };
const { SubscriptionService } = load(filename, mocks);

test('geofile title follows case-insensitive response overrides and falls back to the subscription domain', async () => {
    const service=Object.create(SubscriptionService.prototype);service.subPublicDomain='sub.example.com/path';
    let rendered;service.renderTemplatesService={generateSubscription:async args=>(rendered=args)};
    const user={id:42n};
    await service.renderSubscription({user,hosts:[],srrContext:{subscriptionSettings:{customResponseHeaders:{'profile-title':'Base'}},headersToApply:{'Profile-Title':'Моя подписка'}}});
    assert.equal(Buffer.from(rendered.profileTitle.slice(7),'base64').toString(),'Моя подписка');
    assert.equal(rendered.profileKey,'sub.example.com/path:42');
    await service.renderSubscription({user,hosts:[],srrContext:{subscriptionSettings:{},headersToApply:{}}});
    assert.equal(rendered.profileTitle,'sub.example.com');
});

function fixture(personal, settings, unsupported = false) {
    const user = { id: 1n, shortUuid: 'fixture', status: 'ACTIVE', expireAt: new Date(Date.now() + 86400000) };
    const context = { matchedResponseType: 'XRAY_JSON', userAgent: 'fixture-client', hwidHeaders: { hwid: 'fixture-device' }, subscriptionSettings: settings };
    const service = Object.create(SubscriptionService.prototype);
    const rendered = [];
    let query = 0;
    Object.assign(service, {
        logger: { error(error) { throw error; } }, subPublicDomain: 'sub.example.com',
        queryBus: { execute: async () => ({ isOk: true, response: query++ === 0 ? user : { exists: false, blocked: false } }) },
        deviceAccess: { enabled: personal, registrationDenied: async () => false, register: async () => 'LIMIT_REACHED' },
        applyMaybeExternalSquadOverrides: async () => ({ subscriptionSettings: settings }),
        getUserProfileHeadersInfo: (_user, _settings, _active, remarks) => ({ 'profile-title': remarks.join(' | ') }),
        checkHwidDeviceLimit: async () => ({ isOk: true, response: {
            subscriptionAllowed: false, maxDeviceReached: !unsupported, hwidNotSupported: unsupported, limitBypassed: false, deviceBlocked: false,
        } }),
        renderTemplatesService: { generateSubscription: async args => {
            rendered.push(args);
            return { subscription: JSON.stringify({ remarks: args.fallbackOptions.showHwidMaxDeviceRemarks ? settings.customRemarks.HWIDMaxDevicesExceeded : settings.customRemarks.HWIDNotSupported }), contentType: 'application/json' };
        } },
    });
    return { run: () => service.getSubscriptionByShortUuid(context, 'fixture'), rendered };
}

for (const remarks of [['Limit of devices reached'], ['Мой лимит'], ['My limit', 'Contact support']]) {
    test(`both subscription modes preserve configured limit remarks ${JSON.stringify(remarks)}`, async () => {
        const settings = { hwidSettings: { enabled: true }, isShowCustomRemarks: true, customRemarks: { HWIDMaxDevicesExceeded: remarks } };
        const ordinary = fixture(false, settings), personal = fixture(true, settings);
        const first = await ordinary.run(), second = await personal.run();
        assert.deepEqual(second, first);
        assert.deepEqual(JSON.parse(second.body).remarks, remarks);
        assert.equal(second.contentType, 'application/json');
        assert.equal(second.headers['x-hwid-max-devices-reached'], 'true');
        assert.equal(second.headers['x-hwid-limit'], 'true');
        assert.equal(second.headers['x-hwid-active'], 'true');
        assert.deepEqual(personal.rendered[0].hosts, [], 'denial cannot emit usable hosts');
    });
}
test('hidden remarks and configured announcement work in both modes without a hard-coded body', async () => {
    const settings = { hwidSettings: { enabled: true, maxDevicesAnnounce: 'My device announcement' }, isShowCustomRemarks: false, customRemarks: { HWIDMaxDevicesExceeded: ['My limit'] } };
    for (const personal of [false, true]) {
        const f = fixture(personal, settings), response = await f.run();
        assert.equal(response.body, '');
        assert.equal(response.contentType, 'text/plain');
        assert.equal(Buffer.from(response.headers.announce.slice(7), 'base64').toString(), 'My device announcement');
        assert.equal(f.rendered.length, 0);
    }
});
test('the ordinary unsupported-client path retains its distinct flags and message', async () => {
    const settings = { hwidSettings: { enabled: true }, isShowCustomRemarks: true, customRemarks: { HWIDMaxDevicesExceeded: ['Limit'], HWIDNotSupported: ['App not supported'] } };
    const response = await fixture(false, settings, true).run();
    assert.deepEqual(JSON.parse(response.body).remarks, ['App not supported']);
    assert.equal(response.headers['x-hwid-not-supported'], 'true');
    assert.equal(response.headers['x-hwid-max-devices-reached'], undefined);
});
