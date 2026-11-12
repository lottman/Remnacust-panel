const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MantineProvider } = require('@mantine/core')
const { Spotlight } = require('@mantine/spotlight')

function load(file, mocks = {}) {
    const filename = path.join(__dirname, '../src', file)
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText
    const ref = { exports: {} }
    new Function('require', 'module', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports)
    return ref.exports
}

const translation = { useTranslation: () => ({ t: key => key }) }
const { NodeStatusBadgeWidget } = load('widgets/dashboard/nodes/node-status-badge/node-status-badge.widget.tsx', {
    '../node-billing-status': { useNodeBillingDays: () => undefined, nodeBillingWarning: () => null },
    'react-i18next': translation,
    '@shared/utils/node-health': load('shared/utils/node-health.ts'),
    '@shared/utils/node-policy-status': load('shared/utils/node-policy-status.ts')
})
const actions = []
const addresses = load('shared/utils/node-addresses.ts')
const { NodesSpotlightSearchWidget } = load('widgets/dashboard/nodes/nodes-spotlight-search/nodes-spotlight-search.widget.tsx', {
    '@shared/_modals/show-modal': { showModal: (...args) => actions.push(args) },
    '@shared/ui/universal-spotlight': { UniversalSpotlightContentShared: 'spotlight' },
    '../node-status-badge': { NodeStatusBadgeWidget },
    '@shared/utils/node-addresses': addresses
})
const node = {
    uuid: '00000000-0000-4000-8000-000000000001', name: 'Example <node>', address: 'node.example.test',
    countryCode: 'DE', provider: { name: 'Example Provider' }, usersOnline: null,
    configProfile: { activeConfigProfileUuid: 'profile', activeInbounds: ['inbound'] },
    isConnected: true, xrayUptime: 20, system: null
}

test('node results present useful metadata while retaining UUID search and the original selection target', () => {
    const result = NodesSpotlightSearchWidget({ nodes: [node] })
    const action = result.props.actions[0]
    assert.equal(action.description, 'node.example.test · Example Provider')
    assert(!action.description.includes(node.uuid))
    assert(action.keywords.includes(node.uuid))
    assert.equal(action.id, node.uuid)
    assert.equal(action.rightSection.props.children[1].props.children, '—')
    action.onClick()
    assert.deepEqual(actions.pop(), ['nodes_editNodeModal', { nodeUuid: node.uuid }])
    const zero = NodesSpotlightSearchWidget({ nodes: [{ ...node, usersOnline: 0, provider: null }] }).props.actions[0]
    assert.equal(zero.description, 'node.example.test')
    assert.equal(zero.rightSection.props.children[1].props.children, 0)
})

test('real spotlight rows keep status indicators non-interactive, escape names and filter by UUID', () => {
    const data = NodesSpotlightSearchWidget({ nodes: [node] }).props.actions
    const html = renderToStaticMarkup(React.createElement(MantineProvider, { env: 'test' },
        React.createElement(Spotlight, { actions: data, forceOpened: true, withinPortal: false, query: node.uuid, transitionProps: { duration: 0 } })))
    assert(html.includes('Example &lt;node&gt;'))
    assert(html.includes('role="img"'))
    assert(html.includes('node-status-badge.widget.connected'))
    assert(!/<button\b[^>]*>[\s\S]*?<button\b/.test(html.replace(/<\/button>/g, '\n')))
    assert.equal((html.match(/<button\b/g) ?? []).length, 1)
})

test('shared search bounds its viewport and applies one presentation to all consumers', () => {
    const css = new Proxy({}, { get: (_, key) => String(key) })
    const { UniversalSpotlightContentShared } = load('shared/ui/universal-spotlight/universal-spotlight-content.shared.tsx', {
        'react-i18next': translation,
        '../layouts/empty-page': { EmptyPageLayout: 'empty' },
        './spotlight.module.css': { __esModule: true, default: css }
    })
    const result = UniversalSpotlightContentShared({ actions: [] })
    assert.equal(result.props.classNames, css)
    assert.equal(result.props.scrollable, true)
    assert.equal(result.props.size, 'min(680px, calc(100vw - 24px))')
    assert.equal(result.props.maxHeight, 'min(540px, calc(100dvh - 160px))')
    assert.equal(result.props.searchProps.placeholder, 'common.action.search...')
    assert.equal(result.props.searchProps.style['--input-height'], '60px')
    assert.equal(result.props.searchProps.leftSectionWidth, 54)
    assert.equal(result.props.searchProps.leftSectionPointerEvents, 'none')
})

test('real spotlight finds secondary IPv4 and IPv6 addresses without duplicating the main address', () => {
    const main = '192.0.2.10'
    const secondary = '198.51.100.25'
    const ipv6 = '2001:db8::25'
    const original = { ...node, address: main, ips: [
        { ip: main, status: 'AVAILABLE' },
        { ip: secondary, status: 'UNKNOWN' },
        { ip: ipv6, status: 'BLOCKED' }
    ] }
    const before = structuredClone(original)
    const data = NodesSpotlightSearchWidget({ nodes: [original] }).props.actions
    assert.equal(data[0].description.split(main).length - 1, 1)
    for (const query of [secondary, '198.51.100.', ipv6, main, node.uuid, node.provider.name]) {
        const html = renderToStaticMarkup(React.createElement(MantineProvider, { env: 'test' },
            React.createElement(Spotlight, { actions: data, forceOpened: true, withinPortal: false, query, transitionProps: { duration: 0 } })))
        assert(html.includes('Example &lt;node&gt;'), query)
        assert.equal((html.match(/<button\b/g) ?? []).length, 1)
    }
    const missing = renderToStaticMarkup(React.createElement(MantineProvider, { env: 'test' },
        React.createElement(Spotlight, { actions: data, forceOpened: true, withinPortal: false, query: '203.0.113.99', nothingFound: 'No matching node', transitionProps: { duration: 0 } })))
    assert(missing.includes('No matching node'))
    assert.deepEqual(original, before)
})
