const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { QueryClient, QueryObserver } = require('@tanstack/react-query')
const load = require('../../backend/tests/load-typescript.cjs')

const filename = path.join(__dirname, '../src/widgets/dashboard/nodes/nodes-metrics/node-metrics.widget.tsx')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText
const ready = { uuid: 'fixture', isConnected: true, isConnecting: false, isDisabled: false, xrayUptime: 321, system: null }

function descendants(node) {
    if (Array.isArray(node)) return node.flatMap(descendants)
    return node && typeof node === 'object' ? [node, ...descendants(node.props?.children)] : []
}

function fixture() {
    const state = { nodes: [ready], options: undefined }
    const exports = {}
    const mocks = {
        react: { ...React, useMemo: compute => compute(), useCallback: callback => callback,
            useState: initial => [initial, () => {}] },
        'react-i18next': { useTranslation: () => ({ i18n: { language: 'en' } }) },
        '@shared/_modals/show-modal': {},
        '@shared/api/hooks': {
            useGetNodes: options => { state.options = options; return { data: state.nodes } },
            useGetNodesMetrics: () => ({ data: { nodes: [{ nodeUuid: 'fixture', nodeName: 'Fixture',
                usersOnline: 7, providerName: 'fixture', inboundsStats: [{ tag: 'fixture' }], outboundsStats: [] }] },
                isLoading: false, dataUpdatedAt: 1 })
        },
        '@shared/hooks': { useIsMobile: () => false },
        '@shared/i18n/interface-text': { useUiText: () => key => key },
        '@shared/ui/metrics/metric-card': { MetricCardShared: 'metric' },
        '@shared/utils/node-health': {},
        '../node-status': load(path.join(__dirname, '../src/widgets/dashboard/nodes/node-status.ts')),
        './node-details-card': { NodeDetailsCard: 'detail' },
        './NodeDetails.module.css': { __esModule: true, default: {} }
    }
    vm.runInNewContext(compiled, { exports, require: name => mocks[name] ?? require(name) })
    return { state, render: () => Object.fromEntries(descendants(exports.NodeMetricsWidget())
        .filter(element => element.type === 'metric').map(element => [element.props.title, element.props.value])) }
}

test('overview excludes warming, disabled, offline and unconfirmed cores while accepting missing hardware data', () => {
    const f = fixture()
    for (const flags of [{ isConnecting: true }, { isDisabled: true }, { isConnected: false },
        ...[0, -1, NaN, Infinity, undefined].map(xrayUptime => ({ xrayUptime }))]) {
        f.state.nodes = [{ ...ready, ...flags }]
        assert.equal(f.render()['connected-nodes-2ed1e6f'], 0)
    }
    f.state.nodes = [ready, { ...ready, uuid: 'second', xrayUptime: 1 },
        { ...ready, uuid: 'warming', isConnecting: true }]
    assert.equal(f.render()['connected-nodes-2ed1e6f'], 2)
    assert.equal(f.render()['users-online-85517c0'], 7)
    assert.equal(f.render()['inbounds-with-metrics-1e40621'], 1)
})

test('overview follows repeated readiness updates without converting unavailable nodes into zero', () => {
    const f = fixture()
    for (const [node, expected] of [[ready, 1], [{ ...ready, xrayUptime: 0 }, 0],
        [{ ...ready, isConnected: false }, 0], [{ ...ready, xrayUptime: 1 }, 1]]) {
        f.state.nodes = [node]
        assert.equal(f.render()['connected-nodes-2ed1e6f'], expected)
    }
    f.state.nodes = undefined
    assert.equal(f.render()['connected-nodes-2ed1e6f'], '—')
})

test('overview polls node state and refreshes a fresh cached response on mount', async () => {
    const f = fixture()
    f.render()
    const options = f.state.options?.rQueryParams
    assert(options, 'overview must configure its own node-state refresh')
    assert.equal(options.refetchOnMount, 'always')
    assert(Number.isFinite(options.refetchInterval) && options.refetchInterval > 0 && options.refetchInterval <= 5000)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const key = ['nodes', 'metrics-readiness-regression']
    client.setQueryData(key, [ready])
    let reads = 0
    const observer = new QueryObserver(client, { queryKey: key, staleTime: 60000, ...options,
        queryFn: async () => { reads++; return [{ ...ready, isConnected: false }] } })
    const unsubscribe = observer.subscribe(() => {})
    try {
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(reads, 1)
        assert.equal(observer.getCurrentResult().data[0].isConnected, false)
    } finally {
        unsubscribe()
        client.clear()
    }
})
