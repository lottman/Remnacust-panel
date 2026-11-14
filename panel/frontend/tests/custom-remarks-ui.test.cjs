const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MantineProvider } = require('@mantine/core');
const { createInstance } = require('i18next');
const { I18nextProvider, useTranslation } = require('react-i18next');
const load = require('../../backend/tests/load-typescript.cjs');
const contract = load(path.join(__dirname, '../../backend/libs/contract/models/subscription-settings/custom-remarks.schema.ts'));
const src = path.join(__dirname, '../src');

function source(relative) {
    const cache = new Map();
    function read(filename) {
        if (cache.has(filename)) return cache.get(filename);
        const module = { exports: {} };
        const localRequire = createRequire(filename);
        const mocks = {
            '@remnawave/backend-contract': contract,
            '@shared/i18n/interface-text': { useUiText: () => {
                const { t } = useTranslation();
                return (key, values) => t('interface.' + key, values);
            } },
            '@shared/api/hooks': {
                useGetInternalSquads: () => ({ data: { internalSquads: [] }, isPending: false }),
                useGetExternalSquads: () => ({ data: { externalSquads: [] }, isPending: false }),
            },
            '@shared/ui/appearance/appearance': { usePanelReducedMotion: () => true },
            '@shared/ui/flag-picker/flag-picker': { FlagTextInput: require('@mantine/core').TextInput, FlagTextarea: require('@mantine/core').Textarea },
            '@shared/ui/popovers/template-info-popover/template-info-popover.shared': { TemplateInfoPopoverShared: () => null },
            '@formkit/auto-animate/react': { useAutoAnimate: () => [() => {}, () => {}] },
        };
        const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        }).outputText;
        new Function('require', 'module', 'exports', code)(id => {
            if (id in mocks) return mocks[id];
            if (id.endsWith('.module.css')) return { __esModule: true, default: {} };
            let target;
            if (id.startsWith('.')) target = path.resolve(path.dirname(filename), id);
            if (id.startsWith('@shared/')) target = path.join(src, 'shared', id.slice(8));
            if (id.startsWith('@widgets/')) target = path.join(src, 'widgets', id.slice(9));
            if (target) return read(['.ts', '.tsx', ''].map(ext => target + ext).find(file => fs.existsSync(file)));
            return localRequire(id);
        }, module, module.exports);
        cache.set(filename, module.exports);
        return module.exports;
    }
    return read(path.join(src, relative));
}

async function render(language, component, props) {
    const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', language, 'remnawave.json'), 'utf8'));
    const i18n = createInstance();
    await i18n.init({ lng: language, resources: { [language]: { translation: dictionary } } });
    const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n },
        React.createElement(MantineProvider, { forceColorScheme: 'dark' }, React.createElement(component, props))));
    return { html, dictionary, i18n };
}

for (const language of ['en', 'ru', 'fa', 'zh']) {
    test(language + ': actual shared editor renders rule controls, safe example preview and Save/Reset', async () => {
        const { CustomRemarksEditor } = source('shared/ui/forms/custom-remarks/custom-remarks-editor.tsx');
        const { defaultRemarks, newExpiryRule } = source('shared/ui/forms/custom-remarks/remarks-editor.utils.ts');
        const value = { ...defaultRemarks(), activeExpiry: { rules: [newExpiryRule('10000000-0000-4000-8000-000000000001', 'Only {{DAYS_LEFT}} days')] } };
        const { html, dictionary, i18n } = await render(language, CustomRemarksEditor, { value, isPending: false, onSave: async value => value });
        for (const key of ['remarks-active-title', 'remarks-window', 'remarks-scope', 'remarks-host-block', 'remarks-preview', 'remarks-refresh-needed'])
            assert(html.includes(dictionary.interface[key]), key);
        assert(html.includes('Only 3 days'));
        assert(html.includes(i18n.t('common.action.save')));
        assert(html.includes(i18n.t('common.action.reset')));
        assert(!html.includes('interface.remarks-'));
        assert(!html.includes('admin-host-secret'));
    });

    test(language + ': notes-only and full External Squad replacement have explicit translated explanations', async () => {
        const { ActiveExpiryRules } = source('shared/ui/forms/custom-remarks/active-expiry-rules.tsx');
        const rules = [{ id: '10000000-0000-4000-8000-000000000001', enabled: true, daysBeforeExpiry: 7, scope: 'selected', internalSquadUuids: ['10000000-0000-4000-8000-000000000002'], externalSquadUuids: [], remarks: ['Notice only'] }];
        const { html, dictionary } = await render(language, ActiveExpiryRules, { rules, errors: {}, onChange() {} });
        assert(html.includes(dictionary.interface['remarks-notes-only-help']));
        assert(html.includes('10000000-0000-4000-8000-000000000002'));
        const { CustomRemarksEditor } = source('shared/ui/forms/custom-remarks/custom-remarks-editor.tsx');
        const inherited = contract.CustomRemarksSchema.parse(contract.DEFAULT_SUBSCRIPTION_REMARKS);
        const result = await render(language, CustomRemarksEditor, { value: null, inherited, external: true, isPending: false, onSave: async value => value });
        assert(result.html.includes(dictionary.interface['remarks-override-help']));
        assert(result.html.includes(dictionary.interface['remarks-inherited-help']));
    });
}
