const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const load = require('../../backend/tests/load-typescript.cjs');
const fixture = require('../../backend/tests/api-permissions-fixture.cjs');
const contract = require('../../backend/libs/contract/build/backend');
const directory = path.join(__dirname, '../src/widgets/remnawave-settings/api-tokens-card/modals');
const presets = load(path.join(directory, 'api-token-presets.ts'));
const dependencies = load(path.join(directory, 'scope-read-dependencies.ts'));
const scopes = load(path.join(directory, 'scopes.utils.tsx'), { '@shared/ui/logos': { XrayLogo: () => null } });
const component = ts.transpileModule(fs.readFileSync(path.join(directory, 'create-api-token-modal.widget.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
function render(selected, { full = false, editing = false } = {}) {
    const mutations = [];
    let index = 0;
    const hooks = {
        useGetScopes: () => ({ data: fixture.catalog.getGroupedCatalog(), isLoading: false, isError: false }),
        useCreateApiToken: () => ({ mutate: payload => mutations.push({ type: 'create', payload }), isPending: false }),
        useUpdateApiToken: () => ({ mutate: payload => mutations.push({ type: 'update', payload }), isPending: false }),
    };
    const elements = new Proxy({}, { get: (_, name) => name });
    const jsx = (type, props) => ({ type, props });
    const modules = {
        '@mantine/core': elements,
        '@mantine/form': { useField: () => ({ error: null, getValue: () => 'Review fixture', getInputProps: () => ({}) }) },
        '@mantine/modals': {}, '@mantine/notifications': {},
        '@remnawave/backend-contract': contract,
        react: { useState: initial => {
            const slot = index++;
            return [slot === 0 ? new Set(selected) : slot === 4 ? full : slot === 5 ? true : initial, () => {}];
        } },
        'react/jsx-runtime': { jsx, jsxs: jsx },
        'react-i18next': { Trans: 'Trans', useTranslation: () => ({ t: (key, options) => options?.defaultValue ?? key }) },
        '@shared/i18n/interface-text': { useUiText: () => key => key },
        '@shared/api/hooks': hooks,
        './api-token-presets': presets,
        './scope-read-dependencies': dependencies,
        './scopes.utils': scopes,
    };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', component)(id => modules[id] ?? elements, module, module.exports);
    const tree = module.exports.CreateApiTokenContentWidget({
        isMobile: false,
        ...(editing ? { token: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Review fixture', scopes: selected } } : {}),
    });
    const all = [];
    const walk = element => {
        if (Array.isArray(element)) return element.forEach(walk);
        if (!element || typeof element !== 'object' || !element.props) return;
        all.push(element);
        walk(element.props.children);
    };
    walk(tree);
    const button = all.find(element => element.type === 'Button' && element.props.children === (editing ? 'common.action.save' : 'common.action.create'));
    assert.ok(button);
    return { mutations, button, alerts: all.filter(element => element.type === 'Alert') };
}
test('the actual token editor blocks every incomplete read dependency on create and edit', () => {
    for (const { scope, requiredScope } of dependencies.SCOPE_READ_DEPENDENCIES) {
        for (const editing of [false, true]) {
            const editor = render([scope], { editing });
            assert.equal(editor.button.props.disabled, true, scope);
            assert.ok(editor.alerts.some(alert => alert.props.title === 'Read permission required'));
            editor.button.props.onClick();
            assert.deepEqual(editor.mutations, []);
            const valid = render([scope, requiredScope], { editing });
            assert.equal(valid.button.props.disabled, false, scope);
            valid.button.props.onClick();
            assert.equal(valid.mutations.length, 1);
            assert.deepEqual(new Set(valid.mutations[0].payload.variables.scopes), new Set([scope, requiredScope]));
        }
    }
});
test('the token editor retains explicit presets, empty permissions and non-user resources', () => {
    const resources = fixture.catalog.getGroupedCatalog().resources;
    for (const selection of [[], ['nodes:get'], ['users:create'], presets.SUBSCRIPTION_PAGE_SCOPES, presets.getUserManagementKeys(resources), fixture.catalog.getCatalog().filter(entry => entry.kind === 'read').map(entry => entry.key)]) {
        const editor = render(selection);
        assert.equal(editor.button.props.disabled, false);
        editor.button.props.onClick();
        assert.equal(editor.mutations.length, 1);
        assert.deepEqual(new Set(editor.mutations[0].payload.variables.scopes), new Set(selection));
        assert.ok(!editor.mutations[0].payload.variables.scopes.includes('*'));
    }
    const full = render([], { full: true });
    assert.equal(full.button.props.disabled, false);
    full.button.props.onClick();
    assert.deepEqual(full.mutations[0].payload.variables.scopes, ['*']);
});
