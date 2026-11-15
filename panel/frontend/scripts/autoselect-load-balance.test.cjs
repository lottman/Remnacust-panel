const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const load = require('../../backend/tests/load-typescript.cjs');
const directory = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor');
const m = load(path.join(directory, 'autoselect-model.ts'));
const native = load(path.join(directory, 'client-template-model.ts'));
const { setClientAutoselectStrategy } = load(path.join(directory, 'client-autoselect-model.ts'));
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('load distribution is saved as a native round-robin preset, retains IPv6 and grouped membership, and reopens', () => {
    const config = { outbounds: [], dns: { servers: ['192.0.2.53'] },
        remnawave: { injectHosts: [{ tagPrefix: 'pool', mode: 'group', addressFamily: 'ipv6',
            selectFrom: 'HIDDEN', selector: { type: 'tagRegex', pattern: '^EU$',
                groups: { a: [id(1)], b: [id(2)] }, expected: 1 } }] },
        routing: { balancers: [{ tag: 'auto', selector: ['pool'], fallbackTag: 'pool',
            strategy: { type: 'leastLoad', settings: { expected: 1, tolerance: 0.02 } } }], rules: [] } };
    const text = m.setBalancerStrategy(JSON.stringify(config), 0, 'loadBalance');
    const reopened = m.parseTemplate(text), pool = reopened.remnawave.injectHosts[0];
    assert.deepEqual(reopened.routing.balancers[0].strategy,
        { type: 'roundRobin', settings: { remnacustLoadBalance: true } });
    assert.equal(reopened.routing.balancers[0].fallbackTag, undefined);
    assert.equal(pool.mode, 'all');
    assert.equal(pool.addressFamily, 'ipv6');
    assert.equal(pool.selectFrom, 'HIDDEN');
    assert.equal(pool.selector.pattern, '^EU$');
    assert.deepEqual(pool.selector.groups, config.remnawave.injectHosts[0].selector.groups);
    assert.equal(pool.selector.expected, undefined);
    assert.deepEqual(reopened.dns, config.dns);
    assert.equal(m.validationPath(reopened), null);
    assert.deepEqual(reopened.observatory.subjectSelector, ['pool']);
});

test('leaving distribution removes only its preset marker and preserves explicit fallback and IPv4', () => {
    let text = m.addPool('{"outbounds":[{"tag":"backup","protocol":"blackhole"}]}', [id(1), id(2)]);
    text = m.updatePool(text, 0, ['addressFamily'], 'ipv4');
    text = m.editTemplate(text, ['routing', 'balancers', 0, 'fallbackTag'], 'backup');
    text = m.setBalancerStrategy(text, 0, 'loadBalance');
    let config = m.parseTemplate(text);
    assert.equal(config.routing.balancers[0].strategy.settings.remnacustLoadBalance, true);
    config = m.parseTemplate(m.setBalancerStrategy(text, 0, 'leastPing'));
    assert.deepEqual(config.routing.balancers[0].strategy, { type: 'leastPing' });
    assert.equal(config.routing.balancers[0].fallbackTag, 'backup');
    assert.equal(config.remnawave.injectHosts[0].addressFamily, 'ipv4');
});

for (const format of ['MIHOMO', 'CLASH', 'STASH', 'SINGBOX']) {
    test(`${format}: changing strategy saves the full pool and reopens with protocol, DNS and custom fields intact`, () => {
        const sing = format === 'SINGBOX', key = sing ? 'outbounds' : 'proxy-groups';
        let text = native.addClientGroup('{}', format, [id(1), id(2)]);
        text = native.editClientTemplate(text, format, [key, 0, 'remnawave', 'pool', 'mode'], 'random');
        text = native.editClientTemplate(text, format, [key, 0, 'remnawave', 'pool', 'selector', 'expected'], 1);
        text = native.editClientTemplate(text, format, [key, 0, 'remnawave', 'pool', 'addressFamily'], 'ipv6');
        text = native.editClientTemplate(text, format, [key, 0, 'url'], 'https://probe.example.test/custom');
        text = native.editClientTemplate(text, format, [key, 0, 'interval'], sing ? '71s' : 71);
        text = native.editClientTemplate(text, format, [key, 0, 'custom-setting'], { udp: true });
        text = native.editClientTemplate(text, format, ['dns'], { servers: ['192.0.2.53'] });
        text = native.editClientTemplate(text, format, sing ? ['outbounds', 1] : ['proxies'],
            sing ? { tag: 'manual', type: 'shadowsocks', server: '2001:db8::77', server_port: 8443,
                password: 'synthetic-only', method: 'aes-128-gcm' }
                : [{ name: 'manual', type: 'ss', server: '2001:db8::77', port: 8443,
                    password: 'synthetic-only', cipher: 'aes-128-gcm' }]);
        const before = native.readClientTemplate(text, format);
        if (!sing) text = text.replace(/^(\s*)url:/m, '$1# keep custom probe\n$1url:');
        text = setClientAutoselectStrategy(text, format, 0, 'loadBalance');
        const reopened = native.readClientTemplate(text, format), group = reopened[key][0];
        assert.equal(group.type, sing ? 'urltest' : 'load-balance');
        assert.equal(group.strategy, sing ? undefined : 'round-robin');
        assert.equal(group.remnawave.loadBalance, true);
        assert.equal(group.remnawave.pool.mode, 'all');
        assert.equal(group.remnawave.pool.selector.expected, undefined);
        assert.equal(group.remnawave.pool.addressFamily, 'ipv6');
        assert.deepEqual(group.remnawave.pool.selector.values, [id(1), id(2)]);
        assert.equal(group.url, 'https://probe.example.test/custom');
        assert.equal(group.interval, sing ? '71s' : 71);
        assert.deepEqual(group['custom-setting'], { udp: true });
        assert.deepEqual(reopened.dns, before.dns);
        assert.deepEqual(sing ? reopened.outbounds[1] : reopened.proxies,
            sing ? before.outbounds[1] : before.proxies);
        if (!sing) assert(text.includes('# keep custom probe'));
        const changed = native.readClientTemplate(setClientAutoselectStrategy(text, format, 0,
            sing ? 'urltest' : 'url-test'), format)[key][0];
        assert.equal(changed.remnawave.loadBalance, undefined);
        assert.equal(changed.strategy, undefined);
        assert.equal(changed.remnawave.pool.addressFamily, 'ipv6');
    });
}

test('distribution probe edits remain measured and invalid or script-controlled intent is identified', () => {
    let text = m.setBalancerStrategy(m.addPool('{}', [id(1)]), 0, 'loadBalance');
    text = m.editTemplate(text, ['routing', 'balancers', 0, 'selector'], ['other']);
    const measured = m.parseTemplate(m.observerFor(text, ['other'], 'loadBalance'));
    assert.deepEqual(measured.observatory.subjectSelector, ['auto', 'other']);
    for (const marker of ['true', 1, null]) {
        const config = m.parseTemplate(text);
        config.routing.balancers[0].strategy.settings.remnacustLoadBalance = marker;
        assert.equal(m.validationPath(config), 'routing.balancers.0.strategy.settings.remnacustLoadBalance');
    }
    const script = m.parseTemplate(text);
    script.routing.script = '/test/route.lua';
    assert.equal(m.validationPath(script), 'routing.script');
});

const compiled = new Map();
function component(file, name, language) {
    const strings = JSON.parse(fs.readFileSync(path.join(__dirname,
        `../public/locales/${language}/remnawave.json`), 'utf8'));
    const t = (key, args) => key.split('.').reduce((value, part) => value?.[part], strings)
        ?? args?.defaultValue ?? key;
    const accordion = Object.assign(() => null, { Item: 'Item', Control: 'Control', Panel: 'Panel' });
    const mocks = {
        '@mantine/core': { ...Object.fromEntries(['Alert', 'Badge', 'Button', 'Group', 'MultiSelect',
            'NumberInput', 'Card', 'Select', 'Stack', 'Switch', 'Text', 'TextInput', 'Title', 'TagsInput']
            .map(name => [name, name])), Accordion: accordion },
        react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
            useMemo: fn => fn(), useDeferredValue: value => value },
        'react-i18next': { useTranslation: () => ({ t }) },
        './autoselect-panel.module.css': {}, './priority-order': { PriorityOrder: 'PriorityOrder' },
        './template-assignment-panel': { LegacyAssignments: 'LegacyAssignments', TemplateAssignmentPanel: 'TemplateAssignmentPanel' },
        './template-changes': { TemplateChanges: 'TemplateChanges' },
    };
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(
        fs.readFileSync(path.join(directory, file), 'utf8'), {
            compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        }).outputText + (name === 'BalancerCard' ? '\nexports.BalancerCard = BalancerCard;' : ''));
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', compiled.get(file))(key => {
        if (Object.hasOwn(mocks, key)) return mocks[key];
        if (key.startsWith('.')) return load(path.join(directory, key + '.ts'));
        return require(key);
    }, ref, ref.exports);
    return { render: props => elements(ref.exports[name](props)), t };
}
function elements(value) {
    if (Array.isArray(value)) return value.flatMap(elements);
    return value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : [];
}
for (const language of ['en', 'ru', 'fa', 'zh']) {
    test(`${language}: actual strategy controls save and reopen the preset and distinguish sing-box fallback`, () => {
        const xray = component('autoselect-panel.tsx', 'BalancerCard', language);
        let text = m.addPool('{}', [id(1), id(2)]);
        const props = () => ({ balance: m.parseTemplate(text).routing.balancers[0], index: 0,
            selectors: [], showRemove: false, edit: operation => { text = operation(text); } });
        xray.render(props()).find(e => e.type === 'Select' && e.props.label === xray.t('autoselect.strategy'))
            .props.onChange('loadBalance');
        const view = xray.render(props());
        assert.equal(view.find(e => e.type === 'Select').props.value, 'loadBalance');
        assert(view.some(e => e.props.children === xray.t('autoselect.load-balance-help')));
        for (const format of ['MIHOMO', 'CLASH', 'STASH', 'SINGBOX']) {
            const sing = format === 'SINGBOX';
            const ui = component('client-autoselect-panel.tsx', 'ClientAutoselectPanel', language);
            let code = native.addClientGroup('{}', format, [id(1), id(2)]);
            const props = () => ({ text: code, config: native.readClientTemplate(code, format), format,
                hosts: [], onChange: next => { code = next; } });
            const control = ui.render(props()).find(e => e.type === 'Select' && e.props.label === ui.t('autoselect.strategy'));
            assert(control.props.data.some(option => option.value === 'loadBalance'));
            if (sing) assert(control.props.data.find(option => option.value === 'loadBalance').label.endsWith('→ urltest'));
            control.props.onChange('loadBalance');
            const reopened = ui.render(props());
            assert.equal(reopened.find(e => e.type === 'Select' && e.props.label === ui.t('autoselect.strategy')).props.value, 'loadBalance');
            const help = ui.t(sing ? 'autoselect.load-balance-singbox-help' : 'autoselect.load-balance-help');
            assert(reopened.some(e => e.props.children === help));
            if (sing) assert(!reopened.some(e => e.props.children === ui.t('autoselect.load-balance-help')));
        }
    });
}
