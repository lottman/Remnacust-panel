const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { createInstance } = require('i18next')

const root = path.join(__dirname, '../src')
const compiled = new Map()
const pureReact = { ...React, useMemo: compute => compute(), useCallback: callback => callback }
function load(file, mocks = {}) {
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText)
    const exports = {}
    vm.runInNewContext(compiled.get(file), { exports, require: name => {
        if (Object.hasOwn(mocks, name)) return mocks[name]
        if (name === 'react') return pureReact
        if (name === '../node-status') return load('widgets/dashboard/nodes/node-status.ts')
        if (name.startsWith('@features/') && mocks.features) return mocks.features
        return require(name)
    } })
    return exports
}

const health = load('shared/utils/node-health.ts')
const policy = load('shared/utils/node-policy-status.ts')
const billing = load('widgets/dashboard/nodes/node-billing-status.tsx', {
    '@shared/api/hooks': {}, '../infra-billing/billing-date-status': {}, '../infra-billing/use-billing-today': {}
})
const upgrade = '[HOST_POLICY_UPGRADE_REQUIRED] fixture'
const base = { uuid: '10000000-0000-4000-8000-000000000001', name: 'Fixture', address: '127.0.0.1',
    isConnected: true, isConnecting: false, isDisabled: false, xrayUptime: 0, lastStatusMessage: null,
    configProfile: { activeConfigProfileUuid: 'profile', activeInbounds: [{ tag: 'inbound' }] },
    system: null, versions: null, integrationUuids: [], tags: [], countryCode: 'XX',
    trafficUsedBytes: 0, trafficLimitBytes: 0, isTrafficTrackingActive: false, usersOnline: 2 }

function descendants(node) {
    if (Array.isArray(node)) return node.flatMap(descendants)
    return node && typeof node === 'object' ? [node, ...descendants(node.props?.children)] : []
}
function content(node) {
    if (Array.isArray(node)) return node.map(content).join('')
    if (node && typeof node === 'object') return content(node.props?.children)
    return typeof node === 'string' || typeof node === 'number' ? String(node) : ''
}
function badges(t = key => key, days) {
    const mocks = { 'react-i18next': { useTranslation: () => ({ t }) },
        '@shared/utils/node-health': health, '@shared/utils/node-policy-status': policy,
        '../node-billing-status': { ...billing, useNodeBillingDays: () => days } }
    const full = load('widgets/dashboard/nodes/node-status-badge/node-status-badge.widget.tsx', mocks)
    const simple = load('widgets/dashboard/nodes/node-status-simplfied-badge/node-status-simplified-badge.widget.tsx', mocks)
    return {
        full: (node, withText = false, fetchedNode) => full.NodeStatusBadgeWidget.type({ node, withText, fetchedNode }),
        simple: node => simple.NodeStatusSimplfiedBadgeWidget.type({ ...node, nodeUuid: node.uuid })
    }
}

test('disabled and connecting badges retain their translated state despite connected, upgrade or billing flags', async () => {
    for (const language of ['en', 'ru', 'fa', 'zh']) {
        const i18n = createInstance()
        await i18n.init({ lng: language, resources: { [language]: {
            translation: require(`../public/locales/${language}/remnawave.json`)
        } } })
        const widgets = badges(i18n.t.bind(i18n), -1)
        for (const [flags, label, color] of [
            [{ isDisabled: true, isConnecting: true }, 'disabled', 'gray'],
            [{ isConnecting: true }, 'connecting', 'var(--mantine-color-yellow-3)'],
            [{ isConnected: false, isConnecting: true }, 'connecting', 'var(--mantine-color-yellow-3)']
        ]) {
            const node = { ...base, xrayUptime: 20, lastStatusMessage: upgrade, ...flags }
            const icon = widgets.full(node)
            assert.equal(icon.props.children.props['aria-label'], i18n.t(`node-status-badge.widget.${label}`))
            assert.equal(icon.props.label, i18n.t(`node-status-badge.widget.${label}`))
            assert.equal(icon.props.children.props.color, color)
            const text = widgets.full(node, true)
            assert.equal(text.props.children.props.children, i18n.t(`node-status-badge.widget.${label}`))
            assert.equal(text.props.disabled, true)
            const simple = widgets.simple(node)
            assert.equal(simple.props.children.props.color, color)
            assert.equal(simple.props.disabled, true)
        }
    }
})

test('connected without finite positive uptime is limited; hardware telemetry is independent', () => {
    const widgets = badges()
    for (const xrayUptime of [0, -1, NaN, Infinity, undefined]) {
        const node = { ...base, xrayUptime }
        const result = widgets.full(node)
        assert.equal(result.props.children.props['aria-label'], 'xera-node-health.limited')
        assert.equal(result.props.children.props.color, 'blue')
        assert.equal(result.props.label, 'xera-node-health.limited')
        assert.equal(widgets.simple(node).props.children.props.color, 'blue')
    }
    assert.equal(health.getNodeHealth(base).level, 'limited')
    assert.equal(health.getNodeHealth(base).score, 0)
    for (const xrayUptime of [1, 321]) {
        const node = { ...base, xrayUptime }
        assert.equal(widgets.full(node).props.children.props['aria-label'], 'node-status-badge.widget.connected')
        assert.equal(widgets.full(node).props.children.props.color, 'teal')
        assert.equal(health.getNodeHealth(node).level, 'limited')
    }
    assert.equal(widgets.full(base, false, { ...base, isConnecting: true }).props.children.props['aria-label'],
        'node-status-badge.widget.connecting')
    assert.equal(widgets.full({ ...base, xrayUptime: 1, lastStatusMessage: upgrade }).props.children.props.color, 'violet')
})

test('known upgrade and health warnings remain visible when core uptime is unconfirmed', () => {
    const widgets = badges()
    const upgraded = { ...base, lastStatusMessage: upgrade }
    assert.equal(widgets.full(upgraded).props.children.props.color, 'violet')
    assert.equal(widgets.full(upgraded).props.label, 'xera-node-health.upgrade-required-message')
    assert.equal(widgets.simple(upgraded).props.children.props.color, 'violet')
    const pressured = { ...base, system: { info: { memoryTotal: 100, cpus: 2 },
        stats: { memoryUsed: 95, loadAvg: [0.4, 0.4, 0.4] } } }
    assert.equal(widgets.full(pressured).props.children.props.color, 'yellow')
    assert.equal(widgets.full(pressured).props.label, 'xera-node-health.high-memory')
    const unconfigured = { ...base, configProfile: { activeConfigProfileUuid: null, activeInbounds: [] } }
    assert.equal(widgets.full(unconfigured).props.children.props.color, 'yellow')
    assert.equal(widgets.full(unconfigured).props.label, 'xera-node-health.configuration')
})

test('node details icon follows disabled, connecting, diagnostics and limited readiness across uptime changes', () => {
    const memo = []
    let memoCursor = 0
    const { NodeDetailsCardWidget } = load('widgets/dashboard/nodes/node-details-card/node-details-card.widget.tsx', {
        react: { ...pureReact, useMemo: (compute, dependencies) => {
            const index = memoCursor++
            const previous = memo[index]
            if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index])))
                return previous.value
            const value = compute()
            memo[index] = { value, dependencies }
            return value
        } },
        features: new Proxy({}, { get: () => 'feature' }),
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        '@shared/api': { queryClient: {} }, '@shared/api/hooks': { QueryKeys: {},
            useDisableNode: () => ({}), useEnableNode: () => ({}), useGetNodeMetadata: () => ({}) },
        '@shared/i18n/interface-text': { translateUiText: key => key },
        '@shared/ui': { Logo: 'logo' }, '@shared/ui/logos': { XrayLogo: 'xray' },
        '@shared/ui/node-health/node-health': { NodeHealthDetails: 'health' },
        '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: 'header' },
        '@shared/ui/section-card': { SectionCard: { Root: 'section', Section: 'section' } },
        '@shared/utils/bytes': { prettifyBytesUtil: String },
        '@shared/utils/time-utils': { getNodeResetDaysUtil: () => 0, getXrayUptimeUtil: value => `${value}s` },
        '@shared/utils/node-policy-status': policy, '@shared/utils/node-health': health,
        'json-edit-react': { JsonViewer: 'json' }, '@json-edit-react/themes': {},
        './node-details-card.module.css': { __esModule: true, default: {} }
    })
    for (const [flags, color] of [
        [{}, 'blue'], [{ xrayUptime: 321 }, 'teal'], [{ xrayUptime: 0 }, 'blue'],
        [{ xrayUptime: NaN }, 'blue'], [{ xrayUptime: Infinity }, 'blue'], [{ xrayUptime: -1 }, 'blue'],
        [{ isDisabled: true, isConnecting: true }, 'gray'], [{ isConnecting: true }, 'yellow'],
        [{ lastStatusMessage: upgrade }, 'violet'], [{ isConnected: false }, 'red'],
        [{ system: { info: { memoryTotal: 100, cpus: 2 }, stats: { memoryUsed: 95, loadAvg: [0.4, 0.4, 0.4] } } }, 'yellow'],
        [{ configProfile: { activeConfigProfileUuid: null, activeInbounds: [] } }, 'red']
    ]) {
        memoCursor = 0
        const result = NodeDetailsCardWidget.type({ node: { ...base, ...flags } })
        assert.equal(descendants(result).find(element => element.type === 'header').props.iconColor, color)
        if (color === 'blue') {
            assert(content(result).includes('xera-node-health.limited'))
            assert(!content(result).includes('0s'))
            for (const invalid of ['NaNs', 'Infinitys', '-1s']) assert(!content(result).includes(invalid))
        }
    }
})

test('limited badges and the status filter reuse the translated label and blue styling in four locales', async () => {
    const { getNodesTableColumns } = load('widgets/dashboard/nodes/nodes-datatable/use-nodes-table-widget.tsx', {
        '@shared/i18n/interface-text': { translateUiText: key => key },
        '@shared/ui/node-health/node-health': { NodeHealthBadge: 'health' },
        '@shared/ui/node-ips': { NodeIpsCompactView: 'ips' }, '@shared/utils/bytes': {},
        '@shared/utils/misc': {}, '@shared/utils/time-utils': {},
        '../node-status-badge': { NodeStatusBadgeWidget: 'status' }
    })
    for (const language of ['en', 'ru', 'fa', 'zh']) {
        const i18n = createInstance()
        await i18n.init({ lng: language, resources: { [language]: {
            translation: require(`../public/locales/${language}/remnawave.json`)
        } } })
        const t = i18n.t.bind(i18n)
        const widgets = badges(t, -1)
        assert.equal(widgets.full(base).props.children.props['aria-label'], t('xera-node-health.limited'))
        assert.equal(widgets.full(base, true).props.children.props.children, t('xera-node-health.limited'))
        assert.equal(widgets.simple(base).props.children.props['aria-label'], t('xera-node-health.limited'))
        let selected
        const filters = new Proxy({ nameQuery: '', selectedStatuses: [], setSelectedStatuses: value => { selected = value } }, {
            get: (target, key) => Object.hasOwn(target, key) ? target[key] : []
        })
        const filter = getNodesTableColumns(t, [], [], [], () => {}, filters)
            .find(column => column.accessor === 'isConnected').filter
        const option = filter.props.data.find(item => item.value === 'limited')
        assert(option)
        assert.equal(option.label, t('xera-node-health.limited'))
        assert(descendants(filter.props.renderOption({ option })).some(element =>
            element.props?.style?.color === 'var(--mantine-color-blue-6)'))
        filter.props.onChange(['limited'])
        assert.deepEqual(selected, ['limited'])
    }
})

test('expiry of a previously positive uptime becomes limited and can recover without an offline claim', () => {
    const widgets = badges()
    for (const [xrayUptime, expected] of [[321, 'node-status-badge.widget.connected'],
        [0, 'xera-node-health.limited'], [1, 'node-status-badge.widget.connected']]) {
        assert.equal(widgets.full({ ...base, xrayUptime }).props.children.props['aria-label'], expected)
    }
})

test('billing expiry icons apply only to confirmed active nodes', () => {
    for (const [days, label] of [[-1, 'overdue'], [0, 'due-today'], [2, 'remaining']]) {
        const widgets = badges(key => key, days)
        const active = widgets.full({ ...base, xrayUptime: 1 })
        assert.equal(active.props.children.props['aria-label'], `billing-date-status.${label}`)
        assert.equal(active.props.children.props.color, days <= 1 ? 'red' : 'yellow')
        for (const flags of [{ isConnecting: true }, { isDisabled: true }, { isConnected: false }]) {
            const result = widgets.full({ ...base, xrayUptime: 20, ...flags })
            assert(!result.props.children.props['aria-label'].startsWith('billing-date-status.'))
        }
        for (const xrayUptime of [0, -1, NaN, Infinity]) {
            assert.equal(widgets.full({ ...base, xrayUptime }).props.children.props['aria-label'], 'xera-node-health.limited')
        }
    }
})

test('card stripe and uptime text distinguish confirmed, unconfirmed and offline cores on both layouts', () => {
    const { NodeCardWidget } = load('widgets/dashboard/nodes/node-card/node-card.widget.tsx', {
        '@dnd-kit/dom/sortable': {}, '@dnd-kit/react/sortable': { useSortable: () => ({ isDragging: false }) },
        '@mantine/hooks': { useClipboard: () => ({ copy() {} }) },
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        '@shared/i18n/interface-text': { translateUiText: key => key },
        '@shared/ui/logo': { Logo: 'logo' }, '@shared/ui/logos': { XrayLogo: 'xray' },
        '@shared/ui/node-health/node-health': { NodeHealthBadge: 'health' },
        '@shared/ui/provider-tags/provider-tags': { ProviderTags: 'tags' },
        '@shared/utils/bytes': { prettifyBytesUtil: String, prettySiRealtimeBytesUtil: String },
        '@shared/utils/node-policy-status': policy,
        '@shared/utils/time-utils': { getNodeResetDaysUtil: () => 0, getXrayUptimeUtil: value => `${value}s` },
        '../node-status-badge': { NodeStatusBadgeWidget: 'status' },
        './NodeCard.module.css': { __esModule: true, default: {} }
    })
    for (const isMobile of [false, true]) {
        for (const [flags, expected] of [
            [{ xrayUptime: 321 }, 'connected'], [{}, 'limited'], [{ xrayUptime: NaN }, 'limited'],
            [{ lastStatusMessage: upgrade }, 'upgrade-required'],
            [{ isConnecting: true }, 'connecting'],
            [{ isDisabled: true, isConnecting: true }, 'disabled'],
            [{ isConnected: false, isConnecting: true }, 'connecting'],
            [{ isConnected: false }, 'offline']
        ]) {
            const element = NodeCardWidget.type({ node: { ...base, ...flags }, index: 0,
                isMobile, disableReordering: true, integrationNameByUuid: new Map() })
            assert.equal(element.props['data-node-status'], expected)
            if (expected === 'connected') {
                assert(content(element).includes('321s'))
                assert(!content(element).includes('design-ui.node-offline'))
            }
            if (expected === 'limited') {
                assert(content(element).includes('xera-node-health.limited'))
                assert(!content(element).includes('design-ui.node-offline'))
            }
        }
    }
})

test('status filters distinguish unconfirmed uptime from connected, disabled and connecting states', () => {
    const states = []
    let cursor = 0, filters
    const { NodesDataTableWidget } = load('widgets/dashboard/nodes/nodes-datatable/nodes-datatable.widget.tsx', {
        react: { ...pureReact, useState: initial => {
            const index = cursor++
            if (!(index in states)) states[index] = initial
            return [states[index], value => { states[index] = value }]
        } },
        '@kastov/mantine-datatable': { DataTable: 'table', useDataTableColumns: () => ({ effectiveColumns: [] }) },
        '@mantine/hooks': { useDebouncedValue: value => [value] },
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        '@shared/_modals/show-modal': {},
        '@shared/api/hooks': { useGetConfigProfiles: () => ({}), useGetNodePlugins: () => ({}),
            useGetNodeIntegrations: () => ({}), useGetNodes() {} },
        '@shared/hooks': { usePreventTableBackScroll() {} },
        '@shared/ui': { sortRecords: value => value, DataTableControls: 'controls' },
        '@shared/utils/node-health': health, '@shared/utils/time-utils': { sToMs: value => value * 1000 },
        './use-nodes-table-widget': { getNodesTableColumns: (...args) => { filters = args[5]; return [] } }
    })
    const nodes = [base, { ...base, uuid: 'confirmed', xrayUptime: 321 },
        { ...base, uuid: 'warming', isConnecting: true },
        { ...base, uuid: 'disabled', isDisabled: true, isConnecting: true },
        { ...base, uuid: 'offline', isConnected: false }]
    const render = () => {
        cursor = 0
        return descendants(NodesDataTableWidget.type({ nodes, selectedRecords: [], setSelectedRecords() {} }))
            .find(element => element.type === 'table').props.records
    }
    render()
    for (const [status, uuid] of [['limited', base.uuid], ['connected', 'confirmed'], ['connecting', 'warming'],
        ['disabled', 'disabled'], ['disconnected', 'offline']]) {
        filters.setSelectedStatuses([status])
        assert.deepEqual(Array.from(render(), node => node.uuid), [uuid])
    }
    filters.setSelectedStatuses(['connected'])
    filters.setSelectedHealth(['limited'])
    assert.deepEqual(Array.from(render(), node => node.uuid), ['confirmed'])
})

test('online count requires confirmed uptime but not hardware telemetry; inactive samples stay excluded', () => {
    const { NodesRealtimeUsageMetrics } = load('widgets/dashboard/nodes/nodes-realtime-metrics/nodes-realtime-metrics.widget.tsx', {
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        '@shared/ui/metrics/metric-card': { MetricCardShared: 'metric' },
        '@shared/utils/bytes': { prettySiRealtimeBytesUtil: value => String(value ?? 0) }
    })
    const node = { ...base, xrayUptime: 321, system: { stats: { interface: { rxBytesPerSec: 3, txBytesPerSec: 4 } } } }
    const nodes = [node, { ...base, xrayUptime: 1, usersOnline: 1 }, { ...base, usersOnline: 0 },
        ...[{ isConnecting: true }, { isDisabled: true }, { isConnected: false }]
        .map(flags => ({ ...node, ...flags, usersOnline: 100 }))]
    const values = Object.fromEntries(descendants(NodesRealtimeUsageMetrics({ nodes, isLoading: false }))
        .filter(element => element.type === 'metric').map(element => [element.props.title, element.props.value]))
    assert.equal(values['nodes-quick-stats.widget.online-nodes'], 2)
    assert.equal(values['nodes-quick-stats.widget.users-online'], 3)
    assert.equal(values['nodes-realtime-metrics.widget.download-speed'], '3')
    assert.equal(values['nodes-realtime-metrics.widget.upload-speed'], '4')
    for (const xrayUptime of [0, -1, NaN, Infinity, undefined]) {
        const result = descendants(NodesRealtimeUsageMetrics({ nodes: [{ ...base, xrayUptime }], isLoading: false }))
            .find(element => element.type === 'metric' && element.props.title === 'nodes-quick-stats.widget.online-nodes')
        assert.equal(result.props.value, 0)
    }
})
