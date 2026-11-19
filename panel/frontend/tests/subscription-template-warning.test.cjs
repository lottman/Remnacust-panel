const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function harness(template, editorType = 'json') {
    const states = [], refs = [];
    const settings = { isSuccess: true, data: { geofilesSystemEnabled: true, serveJsonAtBaseSubscription: true } };
    const hostsQuery = { data: [], isError: false };
    let stateIndex, refIndex;
    const recoveries = [];
    let checkNavigation, beforeUnload;
    const blocker = { state: 'unblocked' };
    let resetCount = 0, proceedCount = 0;
    blocker.reset = () => { resetCount++; blocker.state = 'unblocked'; };
    blocker.proceed = () => { proceedCount++; blocker.state = 'proceeding'; };
    const components = new Proxy({}, { get: (_, name) => name });
    const mocks = {
        react: {
            useState(initial) {
                const index = stateIndex++;
                if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
                return [states[index], value => { states[index] = value; }];
            },
            useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
            useMemo: callback => callback(), useDeferredValue: value => value, useLayoutEffect() {}, Suspense: 'Suspense',
        },
        '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks': { useGetSubscriptionSettings: () => settings },
        'react-router': {
            useBlocker: predicate => { checkNavigation = predicate; return blocker; },
            useBeforeUnload: handler => { beforeUnload = handler; },
        },
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        '@mantine/core': { ...Object.fromEntries(['Box', 'Alert', 'Button', 'Group', 'Modal', 'Paper'].map(name => [name, name])),
            Tabs: Object.assign(() => {}, { List: 'TabList', Tab: 'Tab', Panel: 'TabPanel' }) },
        '@shared/hooks/use-editor-recovery': { useEditorRecovery: () => ({ track() {}, saved: async (...args) => { recoveries.push(args); }, entry: null, status: 'ready' }) },
        '@shared/hooks': { usePseudoFullscreen: () => ({}), useViewportFillHeight: () => ({}) },
        '@shared/ui/page-query-error': { hasPageQueryError: queries => queries.some(query => query.isError && query.data === undefined), PageQueryError: 'PageQueryError' },
        '@shared/utils/lazy-with-recovery': { lazyWithRecovery: load => {
            for (const [file, name] of [['client-autoselect-panel', 'ClientAutoselectPanel'], ['autoselect-panel', 'AutoselectPanel'], ['geofiles-panel', 'GeofilesPanel'], ['template-history', 'TemplateHistory']]) {
                if (load.toString().includes('./' + file)) return name;
            }
            throw new Error('Unexpected lazy component');
        } },
        '@shared/utils/setup-monaco/setup-suggest-monaco': { setupSuggestWidget() {} },
        './autoselect-model': { parseTemplate: JSON.parse, poolsOf: () => [], validationPath: config => config.error ?? null, templateChanges: () => [] },
        './client-template-model': { readClientTemplate: JSON.parse, geofileEditorShapeError: () => null, clientValidationPath: () => null },
        './utils/setup-template-monaco': { getTemplateModelPath: () => 'xray-config://template' },
        'monaco-yaml/yaml.worker.js': {},
    };
    const filename = path.join(__dirname, '../src/widgets/dashboard/templates/subscription-template-editor/subscription-template-editor.widget.tsx');
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const ref = { exports: {} };
    const revealed = [];
    new Function('require', 'module', 'exports', 'requestAnimationFrame', compiled)(name => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name.startsWith('@shared/') || name.startsWith('@features/') || name.startsWith('./')) return components;
        return require(name);
    }, ref, ref.exports, callback => callback());
    function elements(value) {
        if (Array.isArray(value)) return value.flatMap(elements);
        if (!value || typeof value !== 'object') return [];
        return [value, ...elements(value.props?.children)];
    }
    function render() {
        stateIndex = refIndex = 0;
        return elements(ref.exports.SubscriptionTemplateEditorWidget({ editorType, hostsQuery, template }));
    }
    return {
        render,
        recoveries,
        settings,
        hostsQuery,
        navigate(to) {
            render();
            blocker.state = checkNavigation?.({
                currentLocation: { pathname: '/template/abc' }, nextLocation: { pathname: to },
            }) ? 'blocked' : 'unblocked';
            return render().find(element => element.type === 'Modal')?.props.opened === true;
        },
        stay() {
            render().find(element => element.props?.children === 'config-editor.widget.stay').props.onClick();
            return resetCount;
        },
        leave() {
            render().find(element => element.props?.children === 'config-editor.widget.leave').props.onClick();
            return proceedCount;
        },
        reload() {
            render();
            let prevented = false;
            beforeUnload?.({ preventDefault() { prevented = true; } });
            return prevented;
        },
        selectTab(value) { render().find(element => element.props?.keepMounted).props.onChange(value); },
        confirm(data, submitted) { return render().find(element => element.type === 'TemplateEditorActionsFeature').props.onSaved(data, submitted); },
        edit(value) { render().find(element => element.type === 'CodeEditor').props.onChange(value); },
        reveal() {
            const all = render();
            all.find(element => element.type === 'CodeEditor').props.onMount({
                getModel: () => ({ getPositionAt: offset => ({ lineNumber: 1, column: offset + 1 }) }),
                setPosition: position => revealed.push(position), revealPositionInCenter() {}, focus() {},
            }, {});
            all.find(element => element.props?.title === 'autoselect.reveal-issue').props.onClick();
            return revealed;
        },
    };
}

const template = () => ({ uuid: 'template', templateType: 'XRAY_JSON', templateJson: {},
    draftContent: '{"remnawave":{"assignments":[{"balancerTag":"missing"}]}}',
    validationWarnings: ['remnawave.assignments.0.balancerTag'] });

test('saved draft shows one banner with the first server reason and a working reveal action', () => {
    const h = harness(template()), all = h.render();
    const alerts = all.filter(element => element.type === 'Alert');
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].props.title, 'template-draft.saved-title');
    assert.equal(all.find(element => element.type === 'span' && element.props.dir === 'ltr').props.children, 'remnawave.assignments.0.balancerTag');
    assert.deepEqual(h.reveal(), [{ lineNumber: 1, column: template().draftContent.indexOf('"missing"') + 1 }]);
});

test('new edits use their current error and never claim the unsaved text is a saved draft', () => {
    const h = harness(template());
    h.edit('{"error":"routing.balancers.0.strategy.settings.tolerance"}');
    let all = h.render();
    assert.deepEqual(all.filter(element => element.type === 'Alert').map(element => element.props.title), ['template-draft.warning']);
    assert.equal(all.find(element => element.type === 'span' && element.props.dir === 'ltr').props.children, 'routing.balancers.0.strategy.settings.tolerance');
    assert.ok(all.find(element => element.type === 'Alert').props.children.includes('template-draft.tolerance-help'));
    h.edit('{}');
    assert.equal(h.render().filter(element => element.type === 'Alert').length, 0);
    h.edit(template().draftContent);
    assert.equal(h.render().find(element => element.type === 'Alert').props.title, 'template-draft.saved-title');
});

test('applied numeric tolerance warnings never show a saved-draft banner', () => {
    const saved = template();
    saved.draftContent = null;
    saved.templateJson = { error: 'routing.balancers.0.strategy.settings.tolerance' };
    saved.validationWarnings = ['routing.balancers.0.strategy.settings.tolerance'];
    const alerts = harness(saved).render().filter(element => element.type === 'Alert');
    assert.deepEqual(alerts.map(element => element.props.title), ['template-draft.warning']);
    assert(alerts[0].props.children.includes('template-draft.applied-warning-help'));
});

test('confirmed template saves clear their own recovery but retain text typed after submission', async () => {
    const h = harness(template());
    h.edit('{"submitted":true}');
    h.edit('{newer unfinished');
    await h.confirm({ ...template(), draftContent: null, templateJson: { submitted: true } }, '{"submitted":true}');
    assert.equal(h.render().find(element => element.type === 'CodeEditor').props.value, '{newer unfinished');
    assert.deepEqual(h.recoveries, [[JSON.stringify({ submitted: true }, null, 2), '{"submitted":true}']]);
});

test('saved server drafts and YAML retain their actual text as the recovery baseline', async () => {
    const h = harness(template());
    h.edit('{unfinished');
    await h.confirm({ ...template(), draftContent: '{unfinished' }, '{unfinished');
    assert.deepEqual(h.recoveries, [['{unfinished', '{unfinished']]);
    const yaml = 'proxies:\n  - name: example\n';
    const y = harness({ uuid: 'yaml-template', templateType: 'MIHOMO', encodedTemplateYaml: Buffer.from(yaml).toString('base64'), draftContent: null }, 'yaml');
    assert.equal(y.render().find(element => element.type === 'CodeEditor').props.value, yaml);
    y.edit(yaml + 'rules: []\n');
    await y.confirm({ uuid: 'yaml-template', templateType: 'MIHOMO', encodedTemplateYaml: Buffer.from(yaml + 'rules: []\n').toString('base64'), draftContent: null }, yaml + 'rules: []\n');
    assert.deepEqual(y.recoveries, [[yaml + 'rules: []\n', yaml + 'rules: []\n']]);
});

test('geofiles tab follows its confirmed template flag and preserves the unsaved editor value', () => {
    const saved = template();
    const h = harness(saved);
    const tabs = () => h.render().filter(element => element.type === 'Tab').map(element => element.props.value);
    assert(!tabs().includes('geofiles'));
    h.edit('{"unsaved":"kept"}');
    saved.geofilesEnabled = true;
    assert(tabs().includes('geofiles'));
    saved.geofilesEnabled = false;
    assert(!tabs().includes('geofiles'));
    assert.equal(h.render().find(element => element.type === 'CodeEditor').props.value, '{"unsaved":"kept"}');
    saved.geofilesEnabled = true;
    h.settings.data.geofilesSystemEnabled = false;
    assert(!tabs().includes('geofiles'));
    h.settings.data.geofilesSystemEnabled = true;
    h.settings.data.serveJsonAtBaseSubscription = false;
    assert(!tabs().includes('geofiles'));
    h.settings.data.serveJsonAtBaseSubscription = true;
    h.settings.isSuccess = false;
    assert(!tabs().includes('geofiles'));
    assert.equal(h.render().find(element => element.type === 'CodeEditor').props.value, '{"unsaved":"kept"}');
});

for (const type of ['XRAY_JSON', 'SINGBOX', 'MIHOMO', 'CLASH', 'STASH']) {
    test(`${type}: auxiliary panels wait for first activation and hosts without losing editor text`, () => {
        const h = harness({ ...template(), templateType: type, draftContent: '{}', geofilesEnabled: true });
        assert.equal(h.render().find(element => element.props?.keepMounted).props.keepMountedMode, 'display-none');
        const panels = () => h.render().filter(element => ['AutoselectPanel', 'ClientAutoselectPanel', 'GeofilesPanel', 'TemplateHistory'].includes(element.type));
        assert.deepEqual(panels(), []);
        h.hostsQuery.data = undefined;
        h.edit('{"unsaved":true}');
        h.selectTab('autoselect');
        assert.deepEqual(panels(), []);
        h.hostsQuery.isError = true;
        assert(h.render().some(element => element.type === 'PageQueryError'));
        assert.deepEqual(panels(), []);
        h.hostsQuery.data = [];
        h.hostsQuery.isError = false;
        const name = type === 'XRAY_JSON' ? 'AutoselectPanel' : 'ClientAutoselectPanel';
        assert.equal(panels()[0].type, name);
        h.selectTab('code');
        assert.equal(panels()[0].type, name);
        assert.equal(h.render().find(element => element.type === 'CodeEditor').props.value, '{"unsaved":true}');
        h.selectTab('geofiles');
        assert(panels().some(element => element.type === 'GeofilesPanel'));
        h.selectTab('history');
        assert(panels().some(element => element.type === 'TemplateHistory' && element.props.draft === '{"unsaved":true}'));
        assert(!panels().some(element => element.type === 'GeofilesPanel'));
    });
}

test('dirty templates confirm route exits and reload while keeping edits when staying', () => {
    const h = harness(template());
    assert.equal(h.navigate('/hosts'), false);
    h.edit('{unfinished');
    assert.equal(h.navigate('/template/abc'), false);
    assert.equal(h.navigate('/hosts'), true);
    assert.equal(h.stay(), 1);
    assert.equal(h.render().find(element => element.type === 'CodeEditor').props.value, '{unfinished');
    assert.equal(h.reload(), true);
    assert.equal(h.navigate('/template/other'), true);
    assert.equal(h.leave(), 1);
});

test('confirmed saves and explicit undo clear the leave warning but newer edits remain protected', async () => {
    const data = template();
    const h = harness(data);
    const saved = '{ "saved": true }';
    h.edit(saved);
    await h.confirm({ ...data, draftContent: saved }, saved);
    assert.equal(h.navigate('/hosts'), false);
    assert.equal(h.reload(), false);
    h.edit('{later');
    await h.confirm({ ...data, draftContent: saved }, saved);
    assert.equal(h.navigate('/hosts'), true);
    h.edit(saved);
    assert.equal(h.reload(), false);
});
