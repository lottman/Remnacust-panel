const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const jsx = require('react/jsx-runtime')

function load(file, imports) {
    const module = { exports: {} }
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
    }).outputText
    new Function('require', 'module', 'exports', code)(name => {
        if (name === 'react/jsx-runtime') return jsx
        if (name in imports) return imports[name]
        throw new Error('Unexpected import: ' + name)
    }, module, module.exports)
    return module.exports
}

test('time segments keep a square highlight without an inner focus outline', () => {
    const extend = value => value
    const fields = load('shared/constants/theme/overrides/inputs.ts', {
        '@mantine/core': Object.fromEntries(['InputBase', 'PasswordInput', 'Select', 'TextInput'].map(name => [name, { extend }])),
        '@mantine/dates': { TimePicker: { extend }, DateTimePicker: { extend } }
    }).default.TimePicker.styles.field
    assert.equal(fields.width, fields.height)
    assert.equal(fields.minHeight, fields.height)
    assert.equal(fields.paddingInline, 0)
    assert.equal(fields.outline, 'none')
})

function elements(element) {
    if (Array.isArray(element)) return element.flatMap(elements)
    if (!element || typeof element !== 'object') return []
    return [element, ...elements(element.props?.children)]
}

test('remarks default to requested order while saved order stays untouched', () => {
    const { SubscriptionExtraRemarks } = load('shared/ui/forms/subscription-extra-remarks.tsx', {
        '@mantine/core': Object.fromEntries(['ActionIcon', 'Group', 'Select', 'Stack', 'Switch', 'Text'].map(name => [name, name])),
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        'react-icons/pi': { PiArrowDown: 'down', PiArrowUp: 'up' },
        '@shared/i18n/interface-text': { useUiText: () => key => key }
    })
    const order = value => elements(SubscriptionExtraRemarks({ value, onChange() {} }))
        .filter(el => el.type === 'Group' && el.key !== null).map(el => el.key)
    const expected = ['EXPIRED', 'HWID_REGISTRATION_BLOCKED', 'HWID_BLOCKED', 'DISABLED', 'FROZEN']
    assert.deepEqual(order({}), expected)
    assert.deepEqual(order({ subscriptionAndHwidRemarkOrder: [...expected].reverse() }), [...expected].reverse())
})

test('overlay content survives closing and fast reopen uses fresh content', () => {
    let retained, initialized = false
    const { ExitRetainedContent } = load('shared/ui/overlays/retained-overlays.tsx', {
        '@mantine/core': { Modal: 'modal', Drawer: 'drawer' },
        react: { useState: initial => { if (!initialized) { retained = initial; initialized = true }; return [retained, value => { retained = value }] } }
    })
    const render = (opened, children) => ExitRetainedContent({ opened, children }).props.children
    assert.equal(render(true, 'First'), 'First')
    assert.equal(render(false, null), 'First')
    assert.equal(render(true, 'Reopened'), 'Reopened')
    assert.equal(render(false, null), 'Reopened')
})

const billing = load('widgets/dashboard/infra-billing/billing-date-status.ts', {})
let records = []
let context
let queryOptions
const today = new Date('2026-11-12T00:00:00Z')
const nodeBilling = load('widgets/dashboard/nodes/node-billing-status.tsx', {
    react: { createContext: () => (context = { Provider: 'provider' }), useContext: () => context.value, useMemo: fn => fn() },
    '@shared/api/hooks': { useGetInfraBillingNodes: options => { queryOptions = options; return { data: { billingNodes: records } } } },
    '../infra-billing/billing-date-status': billing,
    '../infra-billing/use-billing-today': { useBillingToday: () => today }
})

test('node billing covers thresholds, invalid dates, duplicate bills and renewal', () => {
    for (const [days, expected] of [[4, null], [3, 'yellow'], [2, 'yellow'], [1, 'red'], [0, 'red'], [-1, 'red'], [undefined, null], [NaN, null]]) {
        assert.equal(nodeBilling.nodeBillingWarning(days), expected)
    }
    records = [{ nodeUuid: 'node', nextBillingAt: '2026-11-13T00:00:00Z' }, { nodeUuid: 'node', nextBillingAt: '2026-11-14T00:00:00Z' }, { nodeUuid: 'bad', nextBillingAt: 'invalid' }]
    context.value = nodeBilling.NodeBillingStatusProvider({ children: null, enabled: true }).props.value
    assert.equal(nodeBilling.useNodeBillingDays('node'), 1)
    assert.equal(nodeBilling.useNodeBillingDays('bad'), undefined)
    assert.equal(queryOptions.rQueryParams.refetchInterval, 60_000)
    records = [{ nodeUuid: 'node', nextBillingAt: '2026-12-13T00:00:00Z' }]
    context.value = nodeBilling.NodeBillingStatusProvider({ children: null, enabled: true }).props.value
    assert.equal(nodeBilling.nodeBillingWarning(nodeBilling.useNodeBillingDays('node')), null)
})

test('billing never replaces disabled, disconnected, connecting, unhealthy or upgrade status', () => {
    const { NodeStatusBadgeWidget } = load('widgets/dashboard/nodes/node-status-badge/node-status-badge.widget.tsx', {
        '@mantine/core': { ActionIcon: 'icon', Badge: 'badge', Tooltip: 'tooltip' },
        react: { memo: value => value },
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        'react-icons/pi': { PiClockDuotone: 'clock', PiCloudArrowUpDuotone: 'cloud', PiProhibitDuotone: 'disabled', PiPulseDuotone: 'pulse', PiWarningCircle: 'warning' },
        '@shared/utils/node-health': { getNodeHealth: node => ({ level: node.level ?? 'healthy', issues: [] }) },
        '@shared/utils/node-policy-status': { nodeNeedsCustomUpgrade: status => status === 'upgrade' },
        '../node-billing-status': { nodeBillingWarning: nodeBilling.nodeBillingWarning, useNodeBillingDays: () => 1 }
    })
    const node = { uuid: 'node', isConnected: true, isDisabled: false, isConnecting: false, xrayUptime: 1 }
    const icon = changes => elements(NodeStatusBadgeWidget({ node: { ...node, ...changes }, withText: false })).find(el => ['clock', 'pulse', 'cloud', 'disabled', 'warning'].includes(el.type))?.type
    assert.equal(icon({}), 'clock')
    for (const changes of [{ isDisabled: true }, { isConnected: false }, { isConnecting: true }, { xrayUptime: 0 }, { level: 'critical' }, { level: 'attention' }, { lastStatusMessage: 'upgrade' }]) assert.notEqual(icon(changes), 'clock')
})
