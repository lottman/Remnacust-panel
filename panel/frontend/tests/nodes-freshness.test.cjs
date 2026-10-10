const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const { QueryClient, QueryObserver } = require('@tanstack/react-query')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/nodes/ui/connectors/nodes.page.connector.tsx'), 'utf8')
function render(nodes, auxiliary) {
    let options
    const exports = {}
    const page = 'nodes-page'
    const failure = 'query-error'
    const pending = { isLoading: true, data: undefined }
    const hooks = new Proxy({}, { get: (_, name) => name === 'useGetNodes'
        ? value => { options = value; return nodes }
        : () => auxiliary ?? pending })
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }
    }).outputText, { exports, require: name => {
        if (name === '@shared/api/hooks') return hooks
        if (name === '@shared/ui/page-query-error') return {
            hasPageQueryError: queries => queries.some(q => q.isError && q.data === undefined && !q.isFetching),
            PageQueryError: failure
        }
        if (name.includes('components')) return { __esModule: true, default: page }
        return require(name)
    } })
    return { element: exports.NodesPageConnector(), options, page, failure }
}

test('node data is displayed while profiles, plugins and integrations are still loading', () => {
    const nodes = [{ uuid: 'node', onlineUsers: 12 }]
    const { element, page } = render({ data: nodes, isLoading: false })
    assert.equal(element.type, page)
    assert.equal(element.props.nodes, nodes)
    assert.equal(element.props.isLoading, false)
    assert.equal(element.props.nodePlugins, undefined)
    assert.equal(element.props.nodeIntegrations, undefined)
    assert.equal(render({ data: undefined, isLoading: true }).element.props.isLoading, true)
})

test('returning to the nodes page refreshes even a fresh cached response immediately', async () => {
    const { options } = render({ data: [], isLoading: false })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const key = ['nodes', 'freshness-regression']
    client.setQueryData(key, [{ onlineUsers: 1 }])
    let reads = 0
    const observer = new QueryObserver(client, {
        queryKey: key, staleTime: 5000, ...options.rQueryParams,
        queryFn: async () => { reads++; return [{ onlineUsers: 9 }] }
    })
    const unsubscribe = observer.subscribe(() => {})
    try {
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(reads, 1)
        assert.equal(observer.getCurrentResult().data[0].onlineUsers, 9)
    } finally { unsubscribe(); client.clear() }
})

test('terminal auxiliary errors still expose retry instead of treating failure as an empty list', () => {
    const { element, failure } = render({ data: [], isLoading: false }, { isError: true, isFetching: false, data: undefined })
    assert.equal(element.type, failure)
    assert.equal(element.props.queries.length, 4)
})
