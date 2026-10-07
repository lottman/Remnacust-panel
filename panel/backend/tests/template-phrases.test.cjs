const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validateHeaderValue } = require('node:http');
const load = require('./load-typescript.cjs');
const directory = path.join(__dirname, '../src/common/utils/templates');
const keys = load(path.join(__dirname, '../libs/contract/constants/templates/template-keys.ts'));
const constants = {
    USERS_STATUS_VALUES: ['ACTIVE', 'DISABLED', 'LIMITED', 'EXPIRED'],
    RESET_PERIODS_VALUES: ['NO_RESET', 'DAY', 'WEEK', 'MONTH', 'MONTH_ROLLING'],
    RESET_PERIODS: Object.fromEntries(['NO_RESET', 'DAY', 'WEEK', 'MONTH', 'MONTH_ROLLING'].map(key => [key, key])),
};
const variables = load(path.join(directory, 'template-variables.ts'), {
    '@libs/contracts/constants': constants,
    '@libs/contracts/constants/templates/template-keys': keys,
});
const parser = load(path.join(directory, 'template-parser.ts'), { './template-variables': variables });
const bytes = load(path.join(directory, '../bytes/pretty-bytes.util.ts'));
const locationReset = load(path.join(directory, 'get-next-location-reset-at.ts'));
const { TemplateEngine } = load(path.join(directory, 'replace-templates-values.ts'), {
    '@libs/contracts/constants': constants,
    '../bytes': bytes,
    '../get-next-traffic-reset-at.util': load(path.join(directory, '../get-next-traffic-reset-at.util.ts'), { '@libs/contracts/constants': constants }),
    './get-next-location-reset-at': locationReset,
    './template-parser': parser,
    './template-variables': variables,
});
const { isTextRemark } = load(path.join(directory, 'is-text-remark.ts'));
const { safeTemplateHeader } = load(path.join(directory, 'safe-template-header.ts'));
const schema = load(path.join(__dirname, '../libs/contract/models/subscription-settings/custom-remarks.schema.ts'));
const { renderSubscriptionAction } = load(path.join(directory, 'render-subscription-action.ts'), {
    '@libs/contracts/models/subscription-settings/custom-remarks.schema': schema,
    './replace-templates-values': { TemplateEngine },
});
const user = {
    id: 42n, username: 'test_user', status: 'ACTIVE', email: null, telegramId: null,
    description: 'Описание {{STATUS}}', shortUuid: 'short42', tag: null, hwidDeviceLimit: null,
    expireAt: new Date(Date.now() + 5 * 86400000), createdAt: new Date('2026-01-01T00:00:00Z'),
    trafficLimitBytes: 100n, trafficLimitStrategy: 'NO_RESET', lastTrafficResetAt: null,
    userTraffic: { usedTrafficBytes: 120n, lifetimeUsedTrafficBytes: 120n },
};
const settings = { hwidSettings: { fallbackDeviceLimit: 3 } };
const map = (hosts = [], host, override = {}) => TemplateEngine.createUserValueMap({ ...user, ...override }, settings, 'sub.example.test', hosts, host);

test('every advertised template variable has a working resolver; zero and missing optional data stay valid', () => {
    const resolvers = map();
    assert.deepEqual(Object.keys(resolvers).sort(), [...keys.TEMPLATE_KEYS].sort());
    for (const key of keys.TEMPLATE_KEYS) {
        const rendered = TemplateEngine.replace(`{{${key}}}`, resolvers);
        assert.equal(typeof rendered, 'string', key);
        assert.ok(!['undefined', 'null', 'NaN', 'Invalid Date'].includes(rendered), key);
    }
    assert.equal(TemplateEngine.replace('{{TRAFFIC_LEFT_BYTES}} / {{TRAFFIC_LEFT}}', resolvers), '0 / 0');
    assert.equal(TemplateEngine.replace('{{SS_HWID_LIMIT}}', map([], undefined, { hwidDeviceLimit: 0 })), '0');
    assert.equal(TemplateEngine.replace('{{SS_HWID_LIMIT}}', map([], undefined, { hwidDeviceLimit: undefined })), '3');
    assert.equal(TemplateEngine.replace('{{DAYS_LEFT}}', map([], undefined, { expireAt: new Date(0) })), '0');
    assert.equal(TemplateEngine.replace('{{STATUS}}', map([], undefined, { expireAt: new Date(0) })), 'Expired');
    assert.equal(TemplateEngine.replace('{{STATUS}}', map([], undefined, { status: 'DISABLED', expireAt: new Date(0) })), 'Disabled');
});

test('templates handle whitespace, translations, Unicode, repeat tokens, unknown names and nonrecursive values', () => {
    const values = map();
    assert.equal(TemplateEngine.replace('{{ USERNAME }} / {{USERNAME}}', values), 'test_user / test_user');
    assert.equal(TemplateEngine.replace('{{STATUS:ACTIVE= Работает |DISABLED=Выключена }}', values), 'Работает');
    assert.equal(TemplateEngine.replace('{{UNKNOWN}} / {{constructor}} / {{unfinished', values), '{{UNKNOWN}} / {{constructor}} / {{unfinished');
    assert.equal(TemplateEngine.replace('{{DESCRIPTION}}', values), 'Описание {{STATUS}}');
    const encoded = TemplateEngine.replace('rwEncodeBase64:Привет {{USERNAME}}', values);
    assert.equal(Buffer.from(encoded.slice(7), 'base64').toString(), 'Привет test_user');
    assert.equal(Object.getPrototypeOf(parser.parseTemplate('{{STATUS:__proto__=bad|ACTIVE=OK}}').nodes[0].args), null);
});

test('host and tag variables select their own quotas without double counting tags', () => {
    const host = { uuid: 'a', remark: 'Host {{TRAFFICLOCATIONLEFT}}', address: 'example.test', usedBytes: '110', userTrafficLimitBytes: 100n, effectiveLimitBytes: 150n, trafficLimitResetValue: 0, trafficLimitResetUnit: 'DAYS', trafficLimitResetAnchorAt: new Date('2026-01-01'), tagTrafficLimits: [{ tag: 'group', usedBytes: 200n, limitBytes: 300n, resetValue: 0, resetUnit: 'DAYS', resetAnchorAt: new Date('2026-01-01') }] };
    const value = TemplateEngine.replace('{{TRAFFICLOCATIONLIMIT}}', map([host], host));
    assert.equal(value, bytes.prettyBytesUtil(150n, true, 3));
    assert.equal(TemplateEngine.replace('{{TRAFFICLOCATIONLIMITTEG}}', map([host], host)), bytes.prettyBytesUtil(300n, true, 3));
    const left = TemplateEngine.replace('{{TRAFFICLOCATIONLEFT}}', map([host], host));
    assert.equal(left, bytes.prettyBytesUtil(40n, true, 3));
    assert.equal(TemplateEngine.replace('{{TRAFFICLOCATIONLEFTTEG}}', map([host], host)), bytes.prettyBytesUtil(100n, true, 3));
    const all = TemplateEngine.replace('{{TRAFFICLOCATIONUSE}}', map([host, { ...host, uuid: 'b', remark: 'Other' }]));
    assert.equal(all.split('Host:').length - 1, 1);
    assert.equal(TemplateEngine.replace('{{TRAFFICLOCATIONUSETEG}}', map([host, { ...host, uuid: 'b', remark: 'Other' }])), `group: ${bytes.prettyBytesUtil(200n, true, 3)}`);
    assert.equal(TemplateEngine.replace('{{TRAFFICLOCATIONLEFT}}', map()), '0');
});

test('host reset dates clamp month end correctly and use requested date format', () => {
    assert.equal(locationReset.getNextLocationResetAt(new Date('2024-01-31T00:00:00Z'), 1, 'MONTHS', new Date('2024-02-01T00:00:00Z')).toISOString(), '2024-02-29T00:00:00.000Z');
    assert.equal(TemplateEngine.replace('{{LAST_TRAFFIC_RESET_AT:format=YYYY-MM-DD }}', map([], undefined, { lastTrafficResetAt: new Date('2026-01-05T12:00:00Z') })), '2026-01-05');
});

test('HOST_SPEED is last and resolves the host or all entitled hosts using the tightest personal limit', () => {
    const a={uuid:'a',remark:'Germany {{HOST_SPEED}}',serverSpeedLimitMbps:10,
        totalSpeedLimitMbps:1,tagTrafficLimits:[{speedLimitMbps:5},{speedLimitMbps:2}]};
    const b={uuid:'b',remark:'UK',serverSpeedLimitMbps:3,tagTrafficLimits:[{speedLimitMbps:0}]};
    const c={uuid:'c',remark:'Free',serverSpeedLimitMbps:null,tagTrafficLimits:[]};
    assert.equal(keys.TEMPLATE_KEYS.at(-1),'HOST_SPEED');
    assert.equal(TemplateEngine.replace('{{HOST_SPEED}}',map([a,b,c],a)),'2 Mbps');
    assert.equal(TemplateEngine.replace('{{HOST_SPEED}}',map([a,b,c],b)),'3 Mbps');
    assert.equal(TemplateEngine.replace('{{HOST_SPEED}}',map([a,b,c])), 'Germany: 2 Mbps; UK: 3 Mbps; Free: 0 Mbps');
    assert.equal(TemplateEngine.replace('{{HOST_SPEED}}',map()),'0 Mbps');
    a.serverSpeedLimitMbps=1;
    assert.equal(TemplateEngine.replace('{{HOST_SPEED}}',map([a],a)),'1 Mbps');
});

test('host variables and subscription blocking ignore opted-out tag dimensions', () => {
    const {isHostTrafficLimited}=load(path.join(__dirname,'../src/modules/hosts/utils/host-traffic-limit.ts'));
    const h={uuid:'a',remark:'Own',serverSpeedLimitMbps:10,userTrafficLimitBytes:1000n,usedBytes:0n,
        tagTrafficLimits:[{tag:'shared',speedLimitMbps:2,limitBytes:100n,usedBytes:200n,paused:true}],
        useTagTrafficLimit:false,useTagSpeedLimit:false};
    assert.equal(TemplateEngine.replace('{{HOST_SPEED}}',map([h],h)),'10 Mbps');
    assert.equal(TemplateEngine.replace('{{TRAFFICLOCATIONUSE}}',map([h],h)),'0');
    assert.equal(isHostTrafficLimited(h),false);
    h.useTagSpeedLimit=true;
    assert.equal(TemplateEngine.replace('{{HOST_SPEED}}',map([h],h)),'2 Mbps');
    assert.equal(isHostTrafficLimited(h),false);
    h.useTagTrafficLimit=true;
    assert.equal(isHostTrafficLimited(h),true);
    h.useTagTrafficLimit=false;h.trafficPaused=true;
    assert.equal(isHostTrafficLimited(h),true,'own pause must still apply');
});

test('HWID and registration remarks retain leading templates but cannot introduce hosts or action objects', () => {
    for (const value of ['{{USERNAME}} заблокирован', '{{ STATUS }}', '  {{DAYS_LEFT}} дней']) assert.equal(isTextRemark(value), true);
    for (const value of ['', '{{FREE_HOST}}', '{"finalRemark":"host"}', '{"type":"link"}']) assert.equal(isTextRemark(value), false);
    const { registrationBlockedRemarks } = load(path.join(__dirname, '../src/modules/subscription/utils/registration-blocked-remarks.ts'), { '@common/utils/templates/is-text-remark': { isTextRemark } });
    assert.deepEqual(registrationBlockedRemarks(user, { customRemarks: { HWIDRegistrationBlocked: ['{{USERNAME}}: новые устройства запрещены'] } }), ['{{USERNAME}}: новые устройства запрещены']);
});

test('action text and button templates render; URL variables cannot add query parameters or credentials', () => {
    const result = renderSubscriptionAction({ text: 'Привет {{USERNAME}}', buttonText: 'Открыть {{ID}}', url: 'https://example.test/pay?user={{USERNAME}}&return={{SUBSCRIPTION_URL}}' }, map([], undefined, { username: 'name&admin=true#extra' }));
    assert.equal(result.text, 'Привет name&admin=true#extra');
    assert.equal(result.buttonText, 'Открыть 42');
    const url = new URL(result.url);
    assert.equal(url.searchParams.get('user'), 'name&admin=true#extra');
    assert.equal(url.searchParams.has('admin'), false);
    assert.equal(url.searchParams.get('return'), 'https://sub.example.test/short42');
    assert.equal(renderSubscriptionAction({ text: '', buttonText: 'x', url: 'javascript:alert(1)' }, map()), null);
    assert.equal(renderSubscriptionAction({ text: '', buttonText: '{{EMAIL}}', url: 'https://example.test' }, map()), null);
});

test('template header values cannot inject new headers or fail on Unicode', () => {
    const header = safeTemplateHeader('Привет\r\nInjected: value');
    assert.doesNotThrow(() => validateHeaderValue('announce', header));
    assert.equal(Buffer.from(header.slice(7), 'base64').toString(), 'Привет  Injected: value');
    assert.equal(safeTemplateHeader('plain-value'), 'plain-value');
});


test('fixed MB/GB variables preserve host context, grouped quotas, unlimited values and large counters', () => {
    const gb=1073741824n;
    const host={uuid:'fixed-a',remark:'Alpha',address:'a.test',usedBytes:String(gb+gb/2n),userTrafficLimitBytes:2n*gb,trafficLimitResetValue:0,tagTrafficLimits:[]};
    const render=(text,hosts=[host],current=host)=>TemplateEngine.replace(text,map(hosts,current));
    assert.equal(render('{{TRAFFICLOCATIONUSEDMB}} / {{TRAFFICLOCATIONUSEDGB}}'),'1536 / 1.5');
    assert.equal(render('{{TRAFFICLOCATIONLIMITMB}} / {{TRAFFICLOCATIONLIMITGB}}'),'2048 / 2');
    assert.equal(render('{{TRAFFICLOCATIONLEFTMB}} / {{TRAFFICLOCATIONLEFTGB}}'),'512 / 0.5');
    const unlimited={...host,userTrafficLimitBytes:0n};
    assert.equal(render('{{TRAFFICLOCATIONLIMITGB}} / {{TRAFFICLOCATIONLEFTMB}}',[unlimited],unlimited),'∞ / ∞');
    const exhausted={...host,usedBytes:String(3n*gb)};
    assert.equal(render('{{TRAFFICLOCATIONLEFTMB}}',[exhausted],exhausted),'0');
    assert.equal(TemplateEngine.replace('{{TRAFFICLOCATIONUSEDGB}}',map()),'0');
    const tagged={...host,userTrafficLimitBytes:0n,tagTrafficLimits:[{tag:'shared',usedBytes:gb,limitBytes:2n*gb,resetValue:0}]};
    assert.equal(render('{{TRAFFICLOCATIONUSEDMB}}',[tagged],tagged),'1536');
    assert.equal(render('{{TRAFFICLOCATIONUSEDMBTEG}}',[tagged],tagged),'1024');
    assert.equal(render('{{TRAFFICLOCATIONLIMITGBTEG}}',[tagged],tagged),'2');
    assert.equal(render('{{TRAFFICLOCATIONLEFTMBTEG}}',[tagged],tagged),'1024');
    assert.equal(render('{{TRAFFICLOCATIONUSEDGBTEG}}',[host],host),'1.5','a host without tags falls back to its own quota');
    assert.equal(TemplateEngine.replace('{{TRAFFICLOCATIONUSEDMBTEG}}',map([tagged,{...tagged,uuid:'b'}])),'shared: 1024');
    const huge=9007199254740993n*gb;
    assert.equal(TemplateEngine.replace('{{TRAFFIC_USED_GB}}',map([],undefined,{userTraffic:{usedTrafficBytes:huge,lifetimeUsedTrafficBytes:huge}})),'9007199254740993 GB');
    assert.equal(render('{{TRAFFICLOCATIONUSE}}'),bytes.prettyBytesUtil(gb+gb/2n,true,3),'legacy still works');
});
