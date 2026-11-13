const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const load = require('../../backend/tests/load-typescript.cjs');
const { poolAddressMatches } = require('@remnawave/backend-contract');
const root = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor');
const model = load(path.join(root, 'autoselect-model.ts'));
const native = load(path.join(root, 'client-template-model.ts'));
const preview = load(path.join(root, 'autoselect-sources.ts'));
const host = (n, address, extra = {}) => ({
    uuid: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    address, remark: `Host ${n}`, port: 443, tags: ['pool'], isDisabled: false,
    isHidden: false, excludeFromSubscriptionTypes: [], ...extra,
});
const hosts = [
    host(1, '192.0.2.1'), host(2, '2001:db8::1'), host(3, '[2001:db8::2]'),
    host(4, 'server.example.test'), host(5, undefined), host(6, 'fe80::1%eth0'),
    host(7, '192.0.2.9', { isDisabled: true }), host(8, '2001:db8::9', { isHidden: true }),
    host(9, '2001:db8::8', { excludeFromSubscriptionTypes: ['XRAY_JSON', 'SINGBOX', 'MIHOMO', 'CLASH', 'STASH'] }),
    host(10, 'node.example.test', { node: { address: '2001:db8::3', ips: [{ ip: '192.0.2.3' }] } }),
];

test('IPv6 option labels keep address and port unambiguous', () => {
    for (const [address, endpoint] of [['2001:db8::1', '[2001:db8::1]:443'], ['[2001:db8::1]', '[2001:db8::1]:443'], ['192.0.2.1', '192.0.2.1:443'], ['example.test', 'example.test:443']]) {
        const option = preview.autoselectHostOption(host(1, address));
        assert.equal(option.value, hosts[0].uuid);
        assert.equal(option.label, `Host 1 · ${endpoint}`);
    }
    assert.equal(poolAddressMatches('[192.0.2.1]', 'ipv4'), false);
});

test('Xray and native previews match shared literal filtering without inferring DNS or secondary API IPs', () => {
    for (const family of [undefined, 'any', 'ipv4', 'ipv6']) {
        const pool = { addressFamily: family, selectFrom: 'ALL', selector: { type: 'uuids', values: hosts.map(h => h.uuid) } };
        const eligible = hosts.filter(h => !h.isDisabled && !h.excludeFromSubscriptionTypes.length && poolAddressMatches(h.address, family));
        assert.equal(preview.xrayPoolPreview(pool, [...hosts, hosts[0]]), eligible.length);
        for (const format of ['SINGBOX', 'MIHOMO', 'CLASH', 'STASH'])
            assert.equal(preview.clientPoolPreview(pool, hosts, format), eligible.length);
    }
    const pool = { addressFamily: 'ipv6', selectFrom: 'ALL', selector: { type: 'tags', values: ['pool'] } };
    assert.equal(preview.xrayPoolPreview(pool, hosts), 3);
    assert.equal(preview.xrayPoolPreview({ ...pool, selectFrom: 'NOT_HIDDEN' }, hosts), 2);
    assert.equal(preview.xrayPoolPreview({ ...pool, selectFrom: 'HIDDEN' }, hosts), 1);
    assert.equal(preview.clientPoolPreview({ ...pool, selectFrom: undefined }, hosts, 'SINGBOX'), 2);
    assert.equal(preview.xrayPoolPreview({ ...pool, mode: 'group', selector: { type: 'uuids', groups: { one: [hosts[0].uuid, hosts[1].uuid], two: [hosts[1].uuid, hosts[2].uuid] } } }, hosts), 2);
    assert.equal(preview.xrayPoolPreview({ ...pool, selector: { type: 'remarkRegex', pattern: '.*' } }, hosts), null);
    assert.equal(preview.clientPoolPreview({ ...pool, selector: { type: 'tagRegex', pattern: '.*' } }, hosts, 'MIHOMO'), null);
});

test('GUI/code family edits preserve Xray strategy, routing and selection mode and validate the optional enum', () => {
    const initial = model.addPool('{"custom":"keep","outbounds":[]}', hosts.slice(0, 4).map(h => h.uuid));
    const before = model.parseTemplate(initial);
    assert.equal(before.remnawave.injectHosts[0].addressFamily, undefined);
    for (const family of ['any', 'ipv4', 'ipv6']) {
        const changed = model.parseTemplate(model.updatePool(initial, 0, ['addressFamily'], family));
        const expected = structuredClone(before);
        expected.remnawave.injectHosts[0].addressFamily = family;
        assert.deepEqual(changed, expected);
        assert.equal(model.validationPath(changed), null);
        assert.equal(model.connectionPool(changed.remnawave.injectHosts[0]).addressFamily, family);
    }
    for (const value of ['IPv6', 'auto', 6, null]) {
        const invalid = model.parseTemplate(model.updatePool(initial, 0, ['addressFamily'], value));
        assert.equal(model.validationPath(invalid), 'remnawave.injectHosts.0.addressFamily');
    }
});

for (const format of ['SINGBOX', 'MIHOMO', 'CLASH', 'STASH']) test(`${format}: family edits round-trip without changing native strategy, comments or routing`, () => {
    let text = native.addClientGroup('{"custom":"keep"}', format, hosts.slice(0, 4).map(h => h.uuid));
    if (format !== 'SINGBOX') text = '# keep this comment\n' + text;
    const before = native.readClientTemplate(text, format), key = native.nativeGroupPath(format)[0];
    for (const family of ['any', 'ipv4', 'ipv6']) {
        const changedText = native.editClientTemplate(text, format, [key, 0, 'remnawave', 'pool', 'addressFamily'], family);
        const changed = native.readClientTemplate(changedText, format), expected = structuredClone(before);
        expected[key][0].remnawave.pool.addressFamily = family;
        assert.deepEqual(changed, expected);
        assert.equal(native.clientValidationPath(changed, format), null);
        const converted = native.readClientTemplate(native.selectClientOnConnection(changedText, format, 0), format);
        assert.equal(converted[key][0].remnawave.pool.addressFamily, family);
        if (format !== 'SINGBOX') assert(changedText.includes('# keep this comment'));
    }
    const invalid = structuredClone(before);
    invalid[key][0].remnawave.pool.addressFamily = 'auto';
    assert.equal(native.clientValidationPath(invalid, format), `${key}.0.remnawave.pool`);
});

const compiled = new Map();
function component(file, name, language) {
    const strings = JSON.parse(fs.readFileSync(path.join(__dirname, `../public/locales/${language}/remnawave.json`), 'utf8'));
    const t = (key, args) => {
        const value = key.split('.').reduce((value, part) => value?.[part], strings);
        assert.equal(typeof value, 'string', `${language}: ${key}`);
        return value.replace(/{{count}}/g, String(args?.count ?? ''));
    };
    const accordion = Object.assign(() => null, { Item: 'Item', Control: 'Control', Panel: 'Panel' });
    const mocks = {
        '@mantine/core': { ...Object.fromEntries(['Accordion', 'Alert', 'Badge', 'Button', 'Group', 'MultiSelect', 'NumberInput', 'Card', 'Select', 'Stack', 'Switch', 'Text', 'TextInput', 'Title', 'TagsInput'].map(n => [n, n])), Accordion: accordion },
        react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useMemo: fn => fn(), useDeferredValue: v => v },
        'react-i18next': { useTranslation: () => ({ t }) },
        './autoselect-panel.module.css': {},
        './priority-order': { PriorityOrder: 'PriorityOrder' },
        './template-assignment-panel': { LegacyAssignments: 'LegacyAssignments', TemplateAssignmentPanel: 'TemplateAssignmentPanel' },
        './template-changes': { TemplateChanges: 'TemplateChanges' },
    };
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText + (name === 'PoolCard' ? '\nexports.PoolCard=PoolCard;' : ''));
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', compiled.get(file))(key => {
        if (Object.hasOwn(mocks, key)) return mocks[key];
        if (key.startsWith('.')) return load(path.join(root, key + '.ts'));
        return require(key);
    }, ref, ref.exports);
    return { render: props => elements(ref.exports[name](props)), t };
}
function elements(value) {
    if (Array.isArray(value)) return value.flatMap(elements);
    return value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : [];
}

for (const language of ['ru', 'en', 'fa', 'zh']) test(`${language}: both editors expose a separate family Select and edit only pool membership`, () => {
    const xray = component('autoselect-panel.tsx', 'PoolCard', language);
    let text = model.addPool('{}', hosts.slice(0, 4).map(h => h.uuid));
    const before = JSON.parse(text);
    const view = xray.render({ pool: before.remnawave.injectHosts[0], index: 0, hostOptions: [], tags: [], showRemove: false, hasBalancer: true, possibleHosts: 4, priority: false, edit: change => { text = change(text); } });
    const control = view.find(e => e.type === 'Select' && e.props.label === xray.t('autoselect.address-family'));
    assert.equal(control.props.value, 'any');
    assert.equal(control.props.allowDeselect, false);
    assert.deepEqual(control.props.data.map(v => v.value), ['any', 'ipv4', 'ipv6']);
    assert.equal(control.props.description, xray.t('autoselect.address-family-help'));
    control.props.onChange(null);
    assert.deepEqual(JSON.parse(text), before);
    control.props.onChange('ipv6');
    const expected = structuredClone(before);
    expected.remnawave.injectHosts[0].addressFamily = 'ipv6';
    assert.deepEqual(JSON.parse(text), expected);
    for (const format of ['SINGBOX', 'MIHOMO', 'CLASH', 'STASH']) {
        const ui = component('client-autoselect-panel.tsx', 'ClientAutoselectPanel', language);
        let code = native.addClientGroup('{}', format, hosts.slice(0, 4).map(h => h.uuid));
        const config = native.readClientTemplate(code, format), key = native.nativeGroupPath(format)[0];
        const controls = ui.render({ text: code, config, format, hosts, onChange: next => { code = next; } });
        const family = controls.find(e => e.type === 'Select' && e.props.label === ui.t('autoselect.address-family'));
        assert.equal(family.props.value, 'any');
        assert.deepEqual(family.props.data.map(v => v.value), ['any', 'ipv4', 'ipv6']);
        family.props.onChange('ipv4');
        const expected = structuredClone(config);
        expected[key][0].remnawave.pool.addressFamily = 'ipv4';
        assert.deepEqual(native.readClientTemplate(code, format), expected);
    }
});

test('Monaco injector schema completes and constrains optional addressFamily without changing the strategy schema', () => {
    const { injectorJsonSchema } = load(path.join(root, 'utils/injector-json-schema.ts'), { i18next: { t: key => key } });
    const schema = injectorJsonSchema([], [], []);
    const family = schema.properties.remnawave.properties.injectHosts.items.properties.addressFamily;
    assert.deepEqual(family.enum, ['any', 'ipv4', 'ipv6']);
    assert.equal(family.type, 'string');
    assert.equal(family.default, 'any');
    assert(!schema.properties.remnawave.properties.injectHosts.items.required.includes('addressFamily'));
});
