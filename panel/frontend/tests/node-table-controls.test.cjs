const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const mantine = require('@mantine/core')
const load = require('../../backend/tests/load-typescript.cjs')
const sourceContract = load(path.resolve(__dirname, '../../backend/libs/contract/models/node-control-addresses.schema.ts'))
const controlAddresses = load(path.resolve(__dirname, '../src/shared/utils/node-control-addresses.ts'), { '@remnawave/backend-contract': sourceContract })
const endpoints = load(path.resolve(__dirname, '../src/shared/_modals/nodes/edit-node-modal/node-connection-route.ts'))

const source = fs.readFileSync(path.join(__dirname,
    '../src/widgets/dashboard/nodes/nodes-datatable/use-nodes-table-widget.tsx'), 'utf8')
const ref = { exports: {} }
const mocks = {
    '@shared/i18n/interface-text': { translateUiText: key => key },
    '@shared/ui/node-health/node-health': { NodeHealthBadge: () => null },
    '@shared/ui/node-ips/node-control-addresses-compact-view': { NodeControlAddressesCompactView: () => null },
    '@shared/utils/bytes': { prettySiRealtimeBytesUtil: value => `speed:${value}` },
    '@shared/_modals/nodes/edit-node-modal/node-connection-route': endpoints,
    '@shared/utils/node-control-addresses': controlAddresses,
    '@shared/utils/misc': {},
    '@shared/utils/node-metric': { hasNodeMetric: value => typeof value === 'number' && Number.isFinite(value) && value >= 0 },
    '@shared/utils/time-utils': { formatDurationUtil: value => `uptime:${value}` },
    '../node-status-badge': { NodeStatusBadgeWidget: () => null }
}
new Function('require', 'module', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports)

function columns(language, onEdit = () => {}) {
    const locale = require(`../public/locales/${language}/remnawave.json`)
    const t = key => key.split('.').reduce((value, part) => value?.[part], locale) ?? key
    const filters = { nameQuery: '' }
    for (const key of ['ConfigProfiles', 'Inbounds', 'Integrations', 'Plugins', 'Providers', 'Statuses', 'Health', 'Tags']) {
        filters[`selected${key}`] = []
        filters[`available${key}`] = []
    }
    return { t, values: ref.exports.getNodesTableColumns(t, [], [], [], onEdit, filters) }
}

function markup(element) {
    return renderToStaticMarkup(React.createElement(mantine.MantineProvider, null, element))
}

for (const language of ['en', 'ru', 'fa', 'zh']) {
    test(`${language}: node table shows only a boolean proxy indicator`, () => {
        const { values, t } = columns(language)
        const proxy = values.find(column => column.accessor === 'proxy')
        assert.ok(proxy)
        assert.equal(proxy.title, t('use-nodes-table-widget.proxy'))
        for (const proxyUrl of [undefined, null, '', 'socks5://fixture:synthetic-secret@proxy.example.test:1080']) {
            const html = markup(proxy.render({ proxyUrl }))
            assert.ok(html.includes(t(proxyUrl
                ? 'use-nodes-table-widget.proxy-enabled'
                : 'use-nodes-table-widget.proxy-disabled')))
            assert.ok(!html.includes('socks5:') && !html.includes('synthetic-secret') && !html.includes('proxy.example.test'))
        }
        assert.ok(markup(proxy.render({ hasProxy: true, proxyUrl: null })).includes(t('use-nodes-table-widget.proxy-enabled')))
        assert.ok(markup(proxy.render({ hasProxy: false, proxyUrl: 'socks5://fixture:synthetic-secret@proxy.example.test:1080' })).includes(t('use-nodes-table-widget.proxy-disabled')))
    })
}

test('the edit control names its node and opens that node with keyboard button semantics', () => {
    const opened = []
    const { values, t } = columns('en', uuid => opened.push(uuid))
    const action = values.find(column => column.accessor === 'actions')
    const rendered = action.render({ uuid: 'fixture-node', name: 'Fixture IPv6 node' })
    const button = rendered.props.children
    assert.equal(button.props['aria-label'], `${t('common.action.edit')}: Fixture IPv6 node`)
    assert.match(markup(rendered), /<button\b/)
    button.props.onClick()
    assert.deepEqual(opened, ['fixture-node'])
})

test('the preferred endpoint uses enabled canonical priority and formats IPv6 without reviving the anchor', () => {
    const { values } = columns('en')
    const column = values.find(column => column.accessor === 'address')
    const node = { address: '192.0.2.1', port: 2222, controlAddresses: [
        { address: '192.0.2.1', enabled: false }, { address: '2001:db8::2', enabled: true }
    ] }
    assert.ok(markup(column.render(node)).includes('[2001:db8::2]:2222'))
    assert.equal(column.render({ ...node, controlAddresses: node.controlAddresses.map(entry => ({ ...entry, enabled: false })) }), '—')
    assert.equal(column.render({ ...node, controlAddresses: [] }), '—')
})

test('unknown per-metric values show a dash while real zeros and available measurements remain visible', () => {
    const { values } = columns('en')
    const users = values.find(column => column.accessor === 'usersOnline')
    const uptime = values.find(column => column.accessor === 'xrayUptime')
    const rx = values.find(column => column.accessor === 'system.stats.interface.rxBytesPerSec')
    const tx = values.find(column => column.accessor === 'system.stats.interface.txBytesPerSec')
    for (const value of [null, undefined, NaN, Infinity, -1]) {
        assert.equal(users.render({ usersOnline: value }).props.children, '—')
        assert.equal(uptime.render({ xrayUptime: value }), '—')
        assert.equal(rx.render({ system: { stats: { interface: { rxBytesPerSec: value } } } }), '—')
        assert.equal(tx.render({ system: { stats: { interface: { txBytesPerSec: value } } } }), '—')
    }
    for (const value of [0, 42]) {
        assert.equal(users.render({ usersOnline: value, xrayUptime: 0 }).props.children, value)
        assert.equal(rx.render({ system: { stats: { interface: { rxBytesPerSec: value } } } }), `speed:${value}`)
    }
    assert.equal(uptime.render({ xrayUptime: 0 }), '—')
    assert.equal(uptime.render({ xrayUptime: 42 }), 'uptime:42')
})
