const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const mantine = require('@mantine/core')
function load(name, mocks = {}) {
    const module = { exports: {} }
    const source = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/home/components', name), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    new Function('require', 'module', 'exports', compiled)(id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), module, module.exports)
    return module.exports
}
const model = load('database-diagnostics.ts')
const database = { version: '17.6', connections: 9, activeQueries: 2, lockWaits: 1, idleInTransaction: 1, longestQuerySeconds: 3.5, visibility: 'complete' }
const response = { status: 'ok', sampledAt: '2026-11-06T07:00:00.000Z', database }

test('diagnostics distinguish unknown values from measured zero and reject invalid API samples', () => {
    assert.equal(model.databaseDiagnosticValues({ ...database, lockWaits: 0 }).lockWaits, 0)
    for (const visibility of ['partial', 'disabled']) {
        const values = model.databaseDiagnosticValues({ ...database, visibility })
        assert.equal(values.connections, 9)
        assert.equal(values.activeQueries, '—')
        assert.equal(values.lockWaits, '—')
        assert.equal(values.idleInTransaction, '—')
    }
    assert.equal(model.databaseDiagnosticValues(null).connections, '—')
    assert.equal(model.diagnosticsResponseSchema.safeParse({ response }).success, true)
    for (const value of [{ ...response, database: null }, { ...response, status: 'unavailable' }, { ...response, database: { ...database, connections: -1 } }])
        assert.equal(model.diagnosticsResponseSchema.safeParse({ response: value }).success, false)
})

test('database widget keeps data failures local and polls with cancellation and a finite timeout', async () => {
    let state, options, request
    const { DatabaseDiagnosticsWidget } = load('database-diagnostics.widget.tsx', {
        './database-diagnostics': model,
        '@tanstack/react-query': { useQuery: value => { options = value; return { isPending: false, isFetching: false, refetch() {}, ...state } } },
        'react-i18next': { useTranslation: () => ({ t: key => key, i18n: { resolvedLanguage: 'en' } }) },
        '@shared/api/axios': { instance: { get: async (...args) => { request = args; return { data: { response } } } } },
        '@shared/ui/metrics/metric-card': { MetricCardShared: props => React.createElement('article', { 'data-title': props.title }, props.isLoading ? 'loading' : props.value) }
    })
    const render = () => renderToStaticMarkup(React.createElement(mantine.MantineProvider, null, React.createElement(DatabaseDiagnosticsWidget)))
    state = { data: response }
    let html = render()
    assert.match(html, /PostgreSQL 17.6/)
    assert.match(html, /data-title="home-diagnostics.connections">9<\/article>/)
    assert.equal(options.refetchInterval, 30000)
    assert.equal(options.refetchIntervalInBackground, false)
    assert.equal(options.retry, false)
    const signal = new AbortController().signal
    await options.queryFn({ signal })
    assert.equal(request[0], '/api/system/diagnostics')
    assert.deepEqual(request[1], { signal, timeout: 4000 })
    state = { data: response, isError: true }
    html = render()
    assert.match(html, /home-diagnostics.unavailable/)
    assert.match(html, /data-title="home-diagnostics.connections">—<\/article>/)
    state = { data: { ...response, database: { ...database, visibility: 'disabled' } } }
    html = render()
    assert.match(html, /home-diagnostics.partial/)
    assert.match(html, /data-title="home-diagnostics.active-queries">—<\/article>/)
})
