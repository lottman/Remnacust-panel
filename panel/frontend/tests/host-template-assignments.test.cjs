const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const uuid = '10000000-0000-4000-8000-000000000001';
function load(file, mocks) {
    const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const ref = { exports: {} };
    new Function('require', 'module', 'exports', js)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports);
    return ref.exports;
}
function elements(value) {
    if (Array.isArray(value)) return value.flatMap(elements);
    return value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : [];
}
for (const language of ['ru', 'en', 'fa', 'zh']) test(`${language}: saved template origin, balancer and safe editor links are visible`, () => {
    const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', language, 'remnawave.json')));
    const t = key => key.split('.').reduce((value, field) => value?.[field], dictionary) ?? key;
    let query = { data: { source: 'HOST_ASSIGNMENT', templates: [{ uuid, name: 'Regional <template>', balancerTag: 'auto-de' }] } };
    const { HostTemplateAssignments } = load('shared/ui/forms/hosts/base-host-form/host-template-assignments.tsx', {
        '@mantine/core': Object.fromEntries(['Alert', 'Anchor', 'Badge', 'Button', 'Group', 'Loader', 'Stack', 'Text'].map(name => [name, name])),
        'react-i18next': { useTranslation: () => ({ t }) },
        'react-router': { Link: 'Link', generatePath: (_route, params) => `/dashboard/templates/${params.type}/${params.uuid}` },
        '@shared/constants': { ROUTES: { DASHBOARD: { TEMPLATES: { TEMPLATE_EDITOR: '/template/:uuid' } } } },
        '@shared/api/hooks/hosts/host-template-assignments.query': { useHostTemplateAssignments: value => { assert.equal(value, uuid); return query; } },
    });
    for (const source of ['HOST', 'HOST_ASSIGNMENT', 'TAG_ASSIGNMENT', 'DEFAULT']) {
        query.data.source = source;
        const all = elements(HostTemplateAssignments({ uuid }));
        const badge = all.find(item => item.type === 'Badge');
        assert.equal(badge.props.children, t('host-template-assignments.' + source));
        assert(!badge.props.children.startsWith('host-template-assignments.'));
        const link = all.find(item => item.type === 'Anchor');
        assert.equal(link.props.to, `/dashboard/templates/XRAY_JSON/${uuid}`);
        assert.equal(link.props.rel, 'noopener noreferrer');
        assert.equal(link.props.children, 'Regional <template>');
        assert(all.some(item => item.props?.children === 'auto-de'));
        assert(all.some(item => item.props?.style?.maxHeight === 160));
    }
    query = { isPending: true };
    assert(elements(HostTemplateAssignments({ uuid })).some(item => item.type === 'Loader'));
    let retries = 0;
    query = { isError: true, data: { source: 'DEFAULT', templates: [] }, refetch: () => retries++ };
    const failed = elements(HostTemplateAssignments({ uuid }));
    assert(!failed.some(item => item.type === 'Badge'));
    const retry = failed.find(item => item.type === 'Button');
    assert.equal(retry.props.type, 'button');
    retry.props.onClick();
    assert.equal(retries, 1);
});

test('assignment inspection validates responses, isolates cache by host and forwards cancellation', async () => {
    let options;
    const signal = new AbortController().signal;
    const calls = [];
    let response = { source: 'DEFAULT', templates: [] };
    const query = load('shared/api/hooks/hosts/host-template-assignments.query.ts', {
        '@tanstack/react-query': { useQuery: value => { options = value; return value; } },
        '@shared/api/axios': { instance: { get: async (...args) => { calls.push(args); return { data: { response } }; } } },
    });
    query.useHostTemplateAssignments(uuid);
    assert.deepEqual(options.queryKey, ['host-template-assignments', uuid]);
    assert.equal(options.retry, false);
    assert.equal(options.refetchOnMount, 'always');
    assert.deepEqual(await options.queryFn({ signal }), response);
    assert.equal(calls[0][0], `/api/hosts/panel-template-assignments/${uuid}`);
    assert.equal(calls[0][1].signal, signal);
    response = { source: 'not-authoritative', templates: [] };
    await assert.rejects(options.queryFn({ signal }));
    assert.equal(query.hostTemplateAssignmentsSchema.safeParse({ source: 'HOST', templates: [{ uuid: 'bad', name: 'Bad', balancerTag: null }] }).success, false);
});
