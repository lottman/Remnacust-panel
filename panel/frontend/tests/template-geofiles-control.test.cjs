const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function elements(value) {
    if (Array.isArray(value)) return value.flatMap(elements);
    return value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : [];
}

function fixture(language = 'en') {
    const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', language, 'remnawave.json')));
    const t = key => key.split('.').reduce((value, part) => value?.[part], dictionary) ?? key;
    const requests = [], changes = [];
    const update = { isPending: false, mutate: value => requests.push(value) };
    let callbacks;
    const mocks = {
        '@mantine/core': Object.fromEntries(['ThemeIcon', 'Tooltip'].map(key => [key, key])).valueOf(),
        '@tanstack/react-query': { useQueryClient: () => ({ setQueryData: (...args) => changes.push(['detail', ...args]), invalidateQueries: async value => changes.push(['settings', value]) }) },
        'react-i18next': { useTranslation: () => ({ t }) },
        '@shared/api/hooks/subscription-template/subscription-template.mutation.hooks': { useUpdateSubscriptionTemplate: options => { callbacks = options.mutationFns; return update; } },
        '@shared/api/hooks/subscription-template/subscription-template.query.hooks': { subscriptionTemplateQueryKeys: { getSubscriptionTemplates: { queryKey: ['templates'] }, getSubscriptionTemplate: ({ uuid }) => ({ queryKey: ['template', uuid] }) } },
        '@shared/api/hooks/subscription-template/subscription-template-cache': { cacheCreatedTemplate: async (_client, _key, template) => changes.push(['list', template]) },
        '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks': { subscriptionSettingsQueryKeys: { getSubscriptionSettings: { queryKey: ['settings'] } } },
        '@shared/ui/geofile-icon/geofile-icon': { GeofileIcon: 'GeofileIcon' },
    };
    mocks['@mantine/core'].Menu = { Item: 'Menu.Item' };
    const filename = path.join(__dirname, '../src/widgets/dashboard/templates/template-card/template-geofiles-control.tsx');
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports);
    return { ...ref.exports, requests, changes, update, t, confirm: value => callbacks.onSuccess(value), reject: () => callbacks.onError() };
}

for (const language of ['ru', 'en', 'fa', 'zh']) test(`${language}: both states are visible and translated without opening the menu`, () => {
    const f = fixture(language);
    for (const enabled of [false, true]) {
        const view = elements(f.TemplateGeofilesStatus({ enabled }));
        const status = view.find(value => value.type === 'ThemeIcon');
        assert.equal(status.props['aria-label'], f.t(enabled ? 'geofiles.template-on' : 'geofiles.template-off'));
        assert(!status.props['aria-label'].startsWith('geofiles.'));
        assert.equal(view.find(value => value.type === 'GeofileIcon').props.disabled, !enabled);
        assert.equal(status.props.tabIndex, 0);
    }
    assert.deepEqual(f.requests, []);
});

test('a menu change submits only this template flag and updates caches after server confirmation', async () => {
    const f = fixture();
    const template = { uuid: 'template-a', name: 'A', geofilesEnabled: false, draftContent: 'unsaved draft' };
    const menu = elements(f.TemplateGeofilesMenuItem({ template, allowEnable: true }));
    const item = menu.find(value => value.type === 'Menu.Item');
    let stopped = false;
    item.props.onClick({ stopPropagation: () => { stopped = true; } });
    assert(stopped);
    assert.deepEqual(f.requests, [{ variables: { uuid: 'template-a', geofilesEnabled: true } }]);
    assert.equal(template.geofilesEnabled, false);
    assert.deepEqual(f.changes, []);
    const response = { ...template, geofilesEnabled: true };
    await f.confirm(response);
    assert.deepEqual(f.changes.map(value => value[0]), ['list', 'detail', 'settings']);
    assert.equal(f.changes[0][1].draftContent, 'unsaved draft');
});

test('unknown JSON availability, pending updates and drag overlays cannot enable a template', () => {
    const f = fixture();
    for (const options of [{ allowEnable: false }, { allowEnable: true, inactive: true }, { allowEnable: true, pending: true }]) {
        f.update.isPending = options.pending === true;
        const item = elements(f.TemplateGeofilesMenuItem({ template: { uuid: 'a', geofilesEnabled: false }, ...options })).find(value => value.type === 'Menu.Item');
        assert.equal(item.props.disabled, true);
        item.props.onClick({ stopPropagation() {} });
    }
    assert.deepEqual(f.requests, []);
    f.update.isPending = false;
    const item = elements(f.TemplateGeofilesMenuItem({ template: { uuid: 'a', geofilesEnabled: true }, allowEnable: false })).find(value => value.type === 'Menu.Item');
    assert.equal(item.props.disabled, false);
    item.props.onClick({ stopPropagation() {} });
    assert.deepEqual(f.requests, [{ variables: { uuid: 'a', geofilesEnabled: false } }]);
});

test('a rejected flag change refreshes authoritative state without writing a false success', async () => {
    const f = fixture();
    const template = { uuid: 'changed-concurrently', geofilesEnabled: false };
    f.TemplateGeofilesMenuItem({ template, allowEnable: true });
    await f.reject();
    assert.deepEqual(f.changes.map(value => value[1].queryKey), [['settings'], ['templates'], ['template', template.uuid]]);
    assert.equal(template.geofilesEnabled, false);
    assert.equal(f.changes.some(value => ['detail', 'list'].includes(value[0])), false);
});

for (const language of ['ru', 'en', 'fa', 'zh']) test(`${language}: JSON prerequisite errors use a translated notification`, () => {
    const f = fixture(language), notices = [];
    const file = path.join(__dirname, '../src/shared/api/hooks/subscription-template/subscription-template.mutation.hooks.ts');
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const ref = { exports: {} };
    const mocks = {
        '@mantine/notifications': { notifications: { show: value => notices.push(value) } },
        i18next: { t: f.t },
        '../../tsq-helpers': { createMutationHook: value => value },
        '@shared/utils/translate-mutation-message': { translateMutationMessage: value => value },
        './subscription-template-cache': {},
        './subscription-template.query.hooks': {},
    };
    new Function('require', 'module', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports);
    ref.exports.useUpdateSubscriptionTemplate.rMutationParams.onError(new Error('GEOFILES_REQUIRE_BASE_JSON'));
    assert.equal(notices[0].message, f.t('geofiles.requires-json'));
    assert(!notices[0].message.includes('GEOFILES_'));
});
