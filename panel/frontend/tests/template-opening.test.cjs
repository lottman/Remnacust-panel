const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')

const types = ['XRAY_JSON', 'SINGBOX', 'MIHOMO', 'CLASH', 'STASH']

function connectorFixture(type) {
    const template = { uuid: 'selected-template', templateType: type, draftContent: '{unfinished' }
    const templateQuery = { data: template, isLoading: false, isError: false }
    const hostsQuery = { data: undefined, isLoading: true, isError: false }
    let completeHosts
    const delayedHosts = new Promise(resolve => { completeHosts = resolve }).then(data => {
        Object.assign(hostsQuery, { data, isLoading: false, isError: false })
    })
    const exports = {}
    const filename = path.join(__dirname, '../src/pages/dashboard/templates/ui/connectors/template-editor-page.connector.tsx')
    const source = fs.readFileSync(filename, 'utf8')
    const compiled = ts.transpileModule(source, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }
    }).outputText
    new Function('require', 'exports', compiled)(name => {
        if (name === '@remnawave/backend-contract') return { SUBSCRIPTION_TEMPLATE_TYPE: Object.fromEntries(types.map(type => [type, type])) }
        if (name === 'react-router') return { useParams: () => ({ type, uuid: template.uuid }), Navigate: 'redirect' }
        if (name === '@shared/api/hooks') return { useGetHosts: () => hostsQuery, useGetSubscriptionTemplate: () => templateQuery }
        if (name === '@shared/constants') return { ROUTES: { DASHBOARD: { HOME: '/' } } }
        if (name === '@shared/ui') return { LoadingScreen: 'loading' }
        if (name === '@shared/ui/page-query-error') return {
            hasPageQueryError: queries => queries.some(query => query.isError && query.data === undefined),
            PageQueryError: 'query-error'
        }
        if (name.includes('template-editor-page.component')) return { TemplateEditorPageComponent: 'editor' }
        return require(name)
    }, exports)
    return { template, templateQuery, hostsQuery, render: exports.TemplateEditorPageConnector,
        async resolveHosts(data) { completeHosts(data); await delayedHosts } }
}

for (const type of types) {
    test(`${type}: text opens while the independent hosts request is unresolved`, async () => {
        const fixture = connectorFixture(type)
        const pending = fixture.render()
        assert.equal(pending.type, 'editor', 'a ready template must not wait for hosts')
        assert.equal(pending.props.template, fixture.template)
        assert.equal(pending.props.hostsQuery, fixture.hostsQuery)
        assert.equal(fixture.hostsQuery.data, undefined)
        const hosts = [{ uuid: 'available-host' }]
        await fixture.resolveHosts(hosts)
        const ready = fixture.render()
        assert.equal(ready.type, 'editor')
        assert.equal(ready.props.template, pending.props.template)
        assert.equal(ready.props.hostsQuery.data, hosts)
    })

    test(`${type}: host failures leave the template accessible, template failures remain blocking`, () => {
        const fixture = connectorFixture(type)
        Object.assign(fixture.hostsQuery, { isLoading: false, isError: true })
        assert.equal(fixture.render().type, 'editor')
        Object.assign(fixture.templateQuery, { data: undefined, isError: true })
        assert.equal(fixture.render().type, 'query-error')
    })
}

test('a template with the wrong format cannot open through another format route', () => {
    const fixture = connectorFixture('MIHOMO')
    fixture.hostsQuery.data = []
    fixture.hostsQuery.isLoading = false
    fixture.template.templateType = 'XRAY_JSON'
    assert.equal(fixture.render().type, 'redirect')
})
