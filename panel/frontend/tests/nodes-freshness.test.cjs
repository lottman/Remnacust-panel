const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const { QueryClient, QueryObserver } = require('@tanstack/react-query')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/nodes/ui/connectors/nodes.page.connector.tsx'), 'utf8')
function render(nodes, auxiliary) {
    const notifications = []
    const mountedHooks = []
    let options
    const exports = {}
    const page = 'nodes-page'
    const failure = 'query-error'
    const pending = { isLoading: true, data: undefined }
    const hooks = new Proxy({}, { get: (_, name) => value => {
        mountedHooks.push(name)
        if (name === 'useGetNodes') { options = value; return nodes }
        return auxiliary?.[name] ?? auxiliary ?? pending
    } })
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }
    }).outputText, { exports, require: name => {
        if (name === '@shared/api/hooks') return hooks
        if (name === '@mantine/notifications') return { notifications: { show: info => notifications.push(info) } }
        if (name === 'react-i18next') return { useTranslation: () => ({ t: key => key }) }
        if (name === '@shared/ui/page-query-error') return {
            hasPageQueryError: queries => queries.some(q => q.isError && q.data === undefined && !q.isFetching),
            PageQueryError: failure
        }
        if (name.includes('components')) return { __esModule: true, default: page }
        return require(name)
    } })
    return { element: exports.NodesPageConnector(), options, page, failure, notifications, mountedHooks }
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


test('manual refresh joins pending reads, waits for displayed data, and confirms completion', async () => {
    const calls = []
    let finish
    const query = name => ({
        data: [],
        isLoading: false,
        refetch(options) {
            calls.push([name, options.cancelRefetch])
            if (name === 'nodes') return new Promise(resolve => { finish = resolve })
            return Promise.resolve({ isSuccess: true })
        }
    })
    const { element, notifications, mountedHooks } = render(query('nodes'), {
        useGetNodePlugins: query('plugins'),
        useGetNodeIntegrations: query('integrations'),
        useGetConfigProfiles: query('profiles')
    })

    const refreshing = element.props.onRefresh()
    assert.deepEqual(calls, [['nodes', false], ['plugins', false], ['integrations', false], ['profiles', false]])
    assert.equal(notifications.length, 0)
    finish({ isSuccess: true })
    await refreshing
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].message, 'nodesRefresh.completed')
    assert.equal(mountedHooks.includes('useGetNodeSecretKey'), false)
})

test('manual refresh never reports success for an API error response or a rejected query', async () => {
    const nodes = { data: [], isLoading: false, refetch: async () => ({ isSuccess: false }) }
    const query = { data: [], refetch: async () => ({ isSuccess: true }) }
    const { element, notifications } = render(nodes, query)
    await element.props.onRefresh()
    assert.equal(notifications.length, 0)
    const rejected = render({ ...nodes, refetch: async () => { throw new Error('Offline') } }, query)
    await rejected.element.props.onRefresh()
    assert.equal(rejected.notifications.length, 0)
})
