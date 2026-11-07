const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const load = require('../../backend/tests/load-typescript.cjs');
const root = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor');
const model = load(path.join(root, 'geofile-address-rules.ts'));
const targets = load(path.join(root, 'geofile-targets.ts'));

function harness(config, format, language = 'en', mobile = false) {
    const strings = JSON.parse(fs.readFileSync(path.join(__dirname, `../public/locales/${language}/remnawave.json`), 'utf8'));
    const t = (key, parameters = {}) => {
        const value = key.split('.').reduce((value, part) => value?.[part], strings);
        assert.equal(typeof value, 'string', `Missing ${language} translation: ${key}`);
        return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => String(parameters[name] ?? ''));
    };
    let text = format === 'XRAY_JSON' || format === 'SINGBOX' ? JSON.stringify(config) : require('yaml').stringify(config);
    const states = [];
    let stateIndex = 0;
    const confirmations = [];
    const componentNames = ['Alert', 'Badge', 'Button', 'Card', 'Group', 'Modal', 'Pagination', 'Select', 'Stack', 'Text', 'Textarea', 'Title'];
    const mocks = {
        react: {
            useState(initial) {
                const index = stateIndex++;
                if (!(index in states)) states[index] = initial;
                return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
            },
            useMemo: callback => callback(),
        },
        '@mantine/core': Object.fromEntries(componentNames.map(name => [name, name])),
        '@mantine/hooks': { useMediaQuery: () => mobile },
        '@mantine/modals': { modals: { openConfirmModal: options => confirmations.push(options) } },
        'react-i18next': { useTranslation: () => ({ t }) },
        './autoselect-panel.module.css': {},
        './geofile-address-rules': model,
        './geofile-targets': targets,
    };
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'geofile-address-rules-panel.tsx'), 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports);
    const elements = value => {
        if (Array.isArray(value)) return value.flatMap(elements);
        if (!value || typeof value !== 'object') return [];
        return [value, ...elements(value.props?.children)];
    };
    const render = () => {
        stateIndex = 0;
        return elements(ref.exports.GeofileAddressRules({ config, format, getValue: () => text, onChange: value => { text = value; } }));
    };
    return { render, t, confirmations, getText: () => text, setText: value => { text = value; } };
}

for (const language of ['en', 'ru', 'fa', 'zh']) test(`${language}: oversized groups remain visible on mobile with editing disabled`, () => {
    const config = { rules: Array.from({ length: 20001 }, (_, index) => `DOMAIN,a${index}.example,DIRECT`) };
    const panel = harness(config, 'MIHOMO', language, true);
    const view = panel.render();
    assert(view.some(element => element.type === 'Alert' && element.props.role === 'status'));
    assert(view.some(element => element.type === 'Alert' && element.props.children.join(' ').includes(panel.t('geofiles.manual-limit'))));
    assert(!view.some(element => element.type === 'Text' && element.props.children === panel.t('geofiles.manual-empty')));
    const edit = view.find(element => element.type === 'Button' && element.props.children === panel.t('common.action.edit'));
    assert.equal(edit.props.disabled, true);
    const add = view.find(element => element.type === 'Button' && element.props.children === panel.t('geofiles.manual-add'));
    add.props.onClick();
    assert.equal(panel.render().find(element => element.type === 'Modal').props.fullScreen, true);
});

test('malformed native rules show an error rather than an empty success state', () => {
    const panel = harness({ routing: { rules: {} } }, 'XRAY_JSON');
    const view = panel.render();
    assert(view.some(element => element.type === 'Alert' && element.props.role === 'alert'));
    assert(!view.some(element => element.type === 'Text' && element.props.children === panel.t('geofiles.manual-empty')));
    assert.equal(view.find(element => element.type === 'Button' && element.props.children === panel.t('geofiles.manual-add')).props.disabled, true);
});

for (const format of ['XRAY_JSON', 'SINGBOX', 'MIHOMO', 'CLASH', 'STASH']) test(`${format}: the actual panel selects a literal DIRECT independently of action labels`, () => {
    const config = format === 'XRAY_JSON'
        ? { outbounds: [{ tag: 'DIRECT', protocol: 'vless' }], routing: { rules: [{ domain: ['domain:private.example'], outboundTag: 'DIRECT' }] } }
        : format === 'SINGBOX'
          ? { outbounds: [{ tag: 'DIRECT', type: 'vless' }], route: { rules: [{ domain_suffix: ['private.example'], outbound: 'DIRECT' }] } }
          : { 'proxy-groups': [{ name: 'DIRECT', type: 'select', proxies: ['vpn'] }], rules: ['DOMAIN-SUFFIX,private.example,DIRECT'] };
    const panel = harness(config, format);
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('common.action.edit')).props.onClick();
    const select = panel.render().find(element => element.type === 'Select');
    const kind = format === 'XRAY_JSON' || format === 'SINGBOX' ? 'outbound' : 'route';
    const key = targets.addressRuleTargetKey({ kind, name: 'DIRECT' });
    assert.equal(select.props.value, key);
    const literal = select.props.data.find(option => option.value === key);
    assert.equal(literal.label, panel.t('geofiles.route-target', { name: 'DIRECT' }));
    assert.notEqual(literal.label, panel.t('geofiles.direct'));
    assert.equal(new Set(select.props.data.map(option => option.value)).size, select.props.data.length);
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('common.action.save')).props.onClick();
    const output = load(path.join(root, 'client-template-model.ts')).readClientTemplate(panel.getText(), format);
    if (kind === 'route') assert.deepEqual(output.rules, config.rules);
    else assert.equal(output[format === 'XRAY_JSON' ? 'routing' : 'route'].rules[0][format === 'XRAY_JSON' ? 'outboundTag' : 'outbound'], 'DIRECT');
});

test('switching the panel from a literal route to an explicit built-in action changes only the intended destination', () => {
    const config = { outbounds: [{ tag: 'DIRECT', type: 'vless' }], route: { rules: [{ domain: ['private.example'], outbound: 'DIRECT' }] } };
    const panel = harness(config, 'SINGBOX');
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('common.action.edit')).props.onClick();
    panel.render().find(element => element.type === 'Select').props.onChange(targets.addressRuleTargetKey({ kind: 'action', name: 'REJECT' }));
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('common.action.save')).props.onClick();
    const output = JSON.parse(panel.getText());
    assert.deepEqual(output.outbounds, config.outbounds);
    assert.deepEqual(output.route.rules, [{ action: 'reject', domain: ['private.example'] }]);
});

test('the panel keeps no-resolve visible and preserves it on save', () => {
    const config = { rules: ['IP-CIDR,192.0.2.0/24,DIRECT,no-resolve', 'MATCH,REJECT'] };
    const panel = harness(config, 'STASH', 'fa', true);
    assert(panel.render().some(element => element.type === 'Badge' && element.props.children === 'no-resolve'));
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('common.action.edit')).props.onClick();
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('common.action.save')).props.onClick();
    assert.deepEqual(require('yaml').parse(panel.getText()).rules, config.rules);
});

test('a shadowed YAML DIRECT requires explicit selection, and closing an untouched form needs no discard', () => {
    const config = { 'proxy-groups': [{ name: 'DIRECT', type: 'select', proxies: ['vpn'] }], rules: [] };
    const panel = harness(config, 'MIHOMO');
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('geofiles.manual-add')).props.onClick();
    const view = panel.render();
    const select = view.find(element => element.type === 'Select');
    assert.equal(select.props.value, null);
    assert(!select.props.data.some(option => option.value === targets.addressRuleTargetKey({ kind: 'action', name: 'DIRECT' })));
    view.find(element => element.type === 'Button' && element.props.children === panel.t('common.action.cancel')).props.onClick();
    assert.equal(panel.confirmations.length, 0);
    assert.equal(panel.render().find(element => element.type === 'Modal').props.opened, false);
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('geofiles.manual-add')).props.onClick();
    panel.render().find(element => element.type === 'Textarea').props.onChange({ currentTarget: { value: 'private.example' } });
    assert.equal(panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('common.action.save')).props.disabled, true);
    panel.render().find(element => element.type === 'Select').props.onChange(targets.addressRuleTargetKey({ kind: 'route', name: 'DIRECT' }));
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('common.action.save')).props.onClick();
    assert.deepEqual(require('yaml').parse(panel.getText()).rules, ['DOMAIN-SUFFIX,private.example,DIRECT']);
});

for (const language of ['en', 'ru', 'fa', 'zh']) test(`${language}: mobile JSON import previews every address and requires an explicit action`, () => {
    const config = { outbounds: [{ tag: 'vpn', protocol: 'vless' }], routing: { rules: [{ network: 'tcp,udp', outboundTag: 'vpn' }] }, dns: { servers: ['localhost'] } };
    const panel = harness(config, 'XRAY_JSON', language, true);
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('geofiles.manual-import')).props.onClick();
    const source = JSON.stringify({ type: 'field', domain: Array.from({ length: 516 }, (_, i) => `domain:site${i}.example`), outboundTag: 'unknown-pasted-target' }) + ',';
    panel.render().find(element => element.type === 'Textarea').props.onChange({ currentTarget: { value: source } });
    let view = panel.render();
    assert.equal(view.find(element => element.type === 'Modal').props.fullScreen, true);
    assert(view.some(element => element.props?.role === 'status' && element.props.children === panel.t('geofiles.manual-import-summary', { rules: 1, count: 516 })));
    assert.equal(view.find(element => element.type === 'Button' && element.props.children === panel.t('geofiles.manual-import-apply')).props.disabled, true);
    view.find(element => element.type === 'Select').props.onChange('pasted');
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('geofiles.manual-import-apply')).props.onClick();
    assert(panel.render().some(element => element.type === 'Alert' && element.props.children === panel.t('geofiles.choose-target')));
    assert.deepEqual(JSON.parse(panel.getText()), config);
    panel.render().find(element => element.type === 'Select').props.onChange(targets.addressRuleTargetKey({ kind: 'action', name: 'DIRECT' }));
    // The import must apply to the latest draft, including edits made elsewhere.
    panel.setText(JSON.stringify({ ...config, dns: { servers: ['changed.example'] }, extra: 'newer edit' }));
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('geofiles.manual-import-apply')).props.onClick();
    const output = JSON.parse(panel.getText());
    assert.equal(output.routing.rules[0].domain.length, 516);
    assert.equal(output.outbounds.find(item => item.tag === output.routing.rules[0].outboundTag).protocol, 'freedom');
    assert.deepEqual(output.routing.rules.slice(1), config.routing.rules);
    assert.deepEqual(output.dns, { servers: ['changed.example'] });
    assert.equal(output.extra, 'newer edit');
    assert.equal(panel.render().find(element => element.type === 'Modal').props.opened, false);
});

test('unsupported import conditions show an explicit error and never enable apply', () => {
    const panel = harness({ outbounds: [], routing: { rules: [] } }, 'XRAY_JSON');
    panel.render().find(element => element.type === 'Button' && element.props.children === panel.t('geofiles.manual-import')).props.onClick();
    panel.render().find(element => element.type === 'Select').props.onChange(targets.addressRuleTargetKey({ kind: 'action', name: 'DIRECT' }));
    panel.render().find(element => element.type === 'Textarea').props.onChange({ currentTarget: { value: '{"domain":["domain:example.com"],"network":"tcp","port":"443"}' } });
    const view = panel.render();
    assert(view.some(element => element.type === 'Alert' && element.props.children === panel.t('geofiles.manual-import-conditions')));
    assert.equal(view.find(element => element.type === 'Button' && element.props.children === panel.t('geofiles.manual-import-apply')).props.disabled, true);
});

for (const format of ['XRAY_JSON', 'SINGBOX', 'MIHOMO', 'CLASH', 'STASH']) test(`${format}: autoselect includes the shared manual rules/import UI with the current draft callbacks`, () => {
    const json = format === 'XRAY_JSON' || format === 'SINGBOX';
    const config = format === 'XRAY_JSON' ? { outbounds: [], routing: { rules: [] } }
        : format === 'SINGBOX' ? { outbounds: [], route: { rules: [] } } : { 'proxy-groups': [], rules: [] };
    const text = json ? JSON.stringify(config) : require('yaml').stringify(config);
    const Accordion = Object.assign(() => {}, { Item: 'AccordionItem', Control: 'AccordionControl', Panel: 'AccordionPanel' });
    const components = ['Alert', 'TagsInput', 'Badge', 'Button', 'Group', 'MultiSelect', 'NumberInput', 'Card', 'Select', 'Stack', 'Switch', 'Text', 'TextInput', 'Title'];
    const mocks = {
        react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useMemo: callback => callback(), useDeferredValue: value => value },
        '@mantine/core': { ...Object.fromEntries(components.map(name => [name, name])), Accordion },
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        './autoselect-model': { poolsOf: () => [], autoselectGroups: () => [], parseTemplate: JSON.parse, templateChanges: () => [], needsProbes: () => false },
        './client-template-model': load(path.join(root, 'client-template-model.ts')),
        './autoselect-panel.module.css': {},
        './autoselect-sources': {},
        './geofile-address-rules-panel': { GeofileAddressRules: 'ManualRules' },
        './priority-order': {}, './template-assignment-panel': {}, './template-changes': { TemplateChanges: 'TemplateChanges' }
    };
    const filename = format === 'XRAY_JSON' ? 'autoselect-panel.tsx' : 'client-autoselect-panel.tsx';
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, filename), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports);
    let updated;
    const props = { text, baseline: text, config, format, hosts: [], onChange: value => { updated = value; } };
    const component = format === 'XRAY_JSON' ? ref.exports.AutoselectPanel : ref.exports.ClientAutoselectPanel;
    const elements = value => Array.isArray(value) ? value.flatMap(elements) : !value || typeof value !== 'object' ? [] : [value, ...elements(value.props?.children)];
    const manual = elements(component(props)).find(element => element.type === 'ManualRules');
    assert(manual);
    assert.equal(manual.props.format, format);
    assert.equal(manual.props.config, config);
    assert.equal(manual.props.getValue(), text);
    manual.props.onChange('updated draft');
    assert.equal(updated, 'updated draft');
});
