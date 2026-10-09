const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

function load(relative, imports) {
    const exports = {}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }
    }).outputText, { exports, require: name => imports(name) ?? require(name) })
    return exports
}

const helper = load('shared/ui/page-query-error.tsx', name => {
    if (name === '@mantine/core') return { Stack: 'stack', Alert: 'alert', Button: 'button' }
    if (name === 'react-i18next') return { useTranslation: () => ({ t: key => key }) }
})

function query(overrides = {}) {
    return { data: undefined, isError: false, isFetching: false, isLoading: false, refetch: async () => {}, ...overrides }
}

test('retry targets failed queries only, localizes the error and never exposes its cause', async () => {
    let calls = 0
    const failed = query({ isError: true, refetch: async () => calls++, error: new Error('private upstream credentials') })
    const cached = query({ data: {}, isError: true, refetch: async () => assert.fail('cached query retried') })
    assert.equal(helper.hasPageQueryError([failed, cached]), true)
    assert.equal(helper.hasPageQueryError([cached]), false)
    const element = helper.PageQueryError({ queries: [failed, cached] })
    assert.equal(element.props.role, 'alert')
    assert.equal(element.props.children[0].props.children, 'common.message.unknown-error')
    const button = element.props.children[1]
    assert.equal(button.props.children, 'common.action.try-again')
    button.props.onClick()
    await Promise.resolve()
    assert.equal(calls, 1)
    assert.equal(helper.PageQueryError({ queries: [{ ...failed, isFetching: true }] }).props.children[1].props.loading, true)
})

const pages = [
    ['home/connectors/home.page.connector.tsx', 'HomePageConnector'],
    ['internal-squads/connectors/internal-squads.page.connector.tsx', 'InternalSquadsPageConnector'],
    ['external-squads/connectors/external-squads.page.connector.tsx', 'ExternalSquadsPageConnector'],
    ['config-profiles/connectors/config-profiles.page.connector.tsx', 'ConfigProfilesPageConnector'],
    ['http-stats/ui/connectors/http-stats.page.connector.tsx', 'HttpStatsPageConnector'],
    ['subscription-settings/connectors/subscription-settings.page.connector.tsx', 'SubscriptionSettingsConnector'],
    ['remnawave-settings/connectors/remnawave-settings.page.connector.tsx', 'RemnawaveSettingsConnector'],
    ['subpage-config/ui/connectors/subpage-config-base-page.connector.tsx', 'SubpageConfigBasePageConnector'],
    ['subpage-config/ui/connectors/subpage-config-editor-page.connector.tsx', 'SubpageConfigEditorPageConnector'],
    ['node-plugins/ui/connectors/node-plugins-base-page.connector.tsx', 'NodePluginsBasePageConnector'],
    ['node-plugins/ui/connectors/node-plugin-editor-page.connector.tsx', 'NodePluginEditorPageConnector'],
    ['templates/ui/connectors/template-base-page.connector.tsx', 'TemplateBasePageConnector'],
    ['templates/ui/connectors/template-editor-page.connector.tsx', 'TemplateEditorPageConnector'],
    ['nodes/ui/connectors/nodes.page.connector.tsx', 'NodesPageConnector'],
    ['hosts/ui/connectors/hosts.page.connector.tsx', 'HostsPageConnector'],
    ['users/ui/connectors/users.page.connector.tsx', 'UsersPageConnector'],
    ['response-rules/connectors/response-rules.page.connector.tsx', 'ResponseRulesPageConnector']
]

const data = { templates: [], configProfiles: [], internalSquads: [], externalSquads: [], nodePlugins: [], configs: [], tags: [], templateType: 'XRAY_JSON' }

function render(relative, exported, state, params = { type: 'XRAY_JSON', uuid: 'selected' }) {
    const options = []
    const page = new Proxy({ __esModule: true }, { get: (object, key) => key in object ? object[key] : key })
    const module = load('pages/dashboard/' + relative, name => {
        if (name === '@shared/api/hooks') return new Proxy({}, { get: () => option => { options.push(option); return state } })
        if (name === '@shared/ui/page-query-error') return helper
        if (name === '@shared/ui' || name === '@shared/ui/loading-screen') return { LoadingScreen: 'loading' }
        if (name === 'react-i18next') return { useTranslation: () => ({ t: key => key }) }
        if (name === 'react-router') return { useParams: () => params, Navigate: 'navigate' }
        if (name === '@shared/constants') return { ROUTES: { DASHBOARD: { HOME: '/home' } } }
        if (name === '@remnawave/backend-contract') return { SUBSCRIPTION_TEMPLATE_TYPE: Object.fromEntries(['CLASH', 'MIHOMO', 'SINGBOX', 'STASH', 'XRAY_JSON'].map(key => [key, key])) }
        if (name === '@shared/utils/time-utils') return { sToMs: n => n * 1000 }
        if (name.includes('components')) return page
    })
    return { element: module[exported](), options }
}

for (const [relative, exported] of pages) {
    test(`${exported}: terminal failure offers retry; success and stale data remain usable`, () => {
        const failed = render(relative, exported, query({ isError: true })).element
        assert.equal(failed.type, helper.PageQueryError)
        assert.ok(failed.props.queries.length > 0)
        for (const isError of [false, true]) {
            const ready = render(relative, exported, query({ data, isError })).element
            assert.notEqual(ready.type, helper.PageQueryError)
            assert.notEqual(ready.type, 'loading')
            assert.notEqual(ready.type, 'navigate')
            assert.notEqual(ready.props.isLoading, true)
        }
        const pending = render(relative, exported, query({ isLoading: true, isFetching: true })).element
        assert.ok(pending.type === 'loading' || pending.props.isLoading === true)
    })
}

for (const [relative, exported] of pages.filter(([file]) => file.startsWith('templates/'))) {
    test(`${exported}: unsupported route does not fetch data or stay in loading`, () => {
        const { element, options } = render(relative, exported, query(), { type: 'invalid', uuid: 'selected' })
        assert.equal(element.type, 'navigate')
        assert.ok(options.every(option => option.rQueryParams.enabled === false))
    })
}

test('template editor does not edit a template as a different format from its stored type', () => {
    const result = render(pages[12][0], pages[12][1], query({ data: { ...data, templateType: 'MIHOMO' } }))
    assert.equal(result.element.type, 'navigate')
})
