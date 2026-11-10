const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function connector(queries) {
    const source = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/home/connectors/home.page.connector.tsx'), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const ref = { exports: {} }
    new Function('require', 'module', 'exports', compiled)(name => {
        if (name === '@pages/dashboard/home/components') return { HomePage: 'home' }
        if (name === '@shared/api/hooks') return {
            useGetSystemStats: () => queries[0],
            useGetBandwidthStats: () => queries[1],
            useGetRemnawaveHealth: () => queries[2]
        }
        if (name === '@shared/ui/loading-screen') return { LoadingScreen: 'loading' }
        if (name === '@shared/ui/page-query-error') return { hasPageQueryError: () => false }
        return require(name)
    }, ref, ref.exports)
    return ref.exports.HomePageConnector()
}

test('home refresh requests every displayed data source and waits for partial failures', async () => {
    const calls = []
    let complete
    const queries = [0, 1, 2].map(index => ({
        data: { index }, isFetching: false,
        refetch(options) {
            calls.push([index, options])
            if (index === 1) return Promise.reject(new Error('unavailable'))
            if (index === 2) return new Promise(resolve => { complete = resolve })
            return Promise.resolve({ data: index })
        }
    }))
    const element = connector(queries)
    assert.equal(element.type, 'home')
    assert.equal(element.props.systemInfo, queries[0].data)
    assert.equal(element.props.bandwidthStats, queries[1].data)
    assert.equal(element.props.remnawaveHealth, queries[2].data)
    let done = false
    const pending = element.props.onRefresh().then(result => { done = true; return result })
    await Promise.resolve()
    assert.equal(done, false)
    assert.deepEqual(calls, [0, 1, 2].map(index => [index, { cancelRefetch: false }]))
    complete({ data: 2 })
    assert.deepEqual((await pending).map(result => result.status), ['fulfilled', 'rejected', 'fulfilled'])
})

test('home refresh remains busy while any source is fetching, and database polling is not mounted', () => {
    const queries = [0, 1, 2].map(() => ({ data: {}, isFetching: false, refetch() {} }))
    assert.equal(connector(queries).props.isRefreshing, false)
    for (let index = 0; index < queries.length; index++) {
        queries[index].isFetching = true
        assert.equal(connector(queries).props.isRefreshing, true)
        queries[index].isFetching = false
    }
    const source = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/home/components/home.page.tsx'), 'utf8')
    const tree = ts.createSourceFile('home.page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const tags = []
    function visit(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.push(node.tagName.getText(tree))
        ts.forEachChild(node, visit)
    }
    visit(tree)
    assert(tags.includes('RefreshActionIcon'))
    assert(!tags.includes('DatabaseDiagnosticsWidget'))
    assert(!source.includes("from './database-diagnostics.widget'"))
})
