const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const React = require('react')
const mantine = require('@mantine/core')
const sourceContract = require('../../backend/tests/load-typescript.cjs')(
    path.resolve(__dirname, '../../backend/libs/contract/models/node-control-addresses.schema.ts'))
sourceContract.NodeIpSchema = require('@remnawave/backend-contract').NodeIpSchema

function load(file, mocks = {}) {
    const source = fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8')
    const ref = { exports: {} }
    new Function('require', 'module', 'exports', ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText)(name => name === '@remnawave/backend-contract' ? sourceContract
        : Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports)
    return ref.exports
}
const helpers = load('shared/utils/node-control-addresses.ts')
const validation = load('shared/ui/node-ips/validate-node-control-addresses.ts', {
    '@shared/utils/node-control-addresses': helpers, i18next: { t: key => key }
})
const address = (value, enabled = true) => ({ address: value, enabled })

function elements(value) {
    if (Array.isArray(value)) return value.flatMap(elements)
    return value?.props ? [value, ...elements(value.props.children)] : []
}
function editor(initial, saved = initial, ips = [{ ip: '198.51.100.2', status: 'INBOUND' }]) {
    let cursor = 0
    const states = []
    const values = { controlAddresses: structuredClone(initial), address: '192.0.2.1', ips: structuredClone(ips) }
    const before = structuredClone(values)
    let baseline = structuredClone(values)
    const form = {
        errors: {}, getValues: () => values, getInputProps: key => ({ 'data-path': `fixture-${key}` }), isDirty: key => JSON.stringify(values[key]) !== JSON.stringify(baseline[key]),
        useWatchValue: key => values[key], clearFieldError: key => { delete form.errors[key] },
        setFieldValue: (key, value) => { values[key] = value }
    }
    const t = (key, options = {}) => key + Object.values(options).join(':')
    const { NodeControlAddressesEditor } = load('shared/ui/node-ips/node-control-addresses-editor.tsx', {
        react: { ...React, useState: initial => {
            const index = cursor++
            if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
            return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
        } },
        'react-i18next': { useTranslation: () => ({ t }) },
        '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: 'header' },
        '@shared/ui/section-card': { SectionCard: { Root: 'section', Section: 'section' } },
        '@shared/utils/node-control-addresses': helpers,
        './node-ip-status.constants': load('shared/ui/node-ips/node-ip-status.constants.ts'),
        './validate-node-ips': { MAX_NODE_IPS: 64 },
        '@shared/utils/node-addresses': load('shared/utils/node-addresses.ts')
    })
    const render = (extra = {}) => { cursor = 0; return elements(NodeControlAddressesEditor({ form, savedAddresses: saved, ...extra })) }
    const inputs = () => render().filter(item => item.type === mantine.TextInput)
    const toggles = () => render().filter(item => item.type === mantine.Switch)
    const control = key => render().find(item => item.props['aria-label']?.startsWith(key))
    const add = () => render().find(item => item.type === mantine.Button).props.onClick()
    return { form, values, before, render, inputs, toggles, control, add, markSaved: () => { baseline = structuredClone(values) } }
}

test('canonical addresses are authoritative, including empty lists and a disabled legacy anchor', () => {
    for (const controlAddresses of [[], [address('192.0.2.1', false), address('2001:db8::2')]]) {
        const node = { address: '192.0.2.1', ips: [{ ip: '198.51.100.1', status: 'MANAGEMENT' }], controlAddresses }
        const actual = helpers.getNodeControlAddresses(node)
        assert.deepEqual(actual, controlAddresses)
        assert.notEqual(actual, controlAddresses)
        if (actual.length) actual[0].enabled = true
        assert.deepEqual(node.controlAddresses, controlAddresses)
    }
})

test('the status icon offers editable IP roles without changing panel routing', () => {
    const state = editor([address('198.51.100.2')])
    assert.ok(state.control('node-control-addresses.actions'), 'IP status must have an interactive control')
    const outbound = state.render().find(item => item.type === mantine.Menu.Item && item.key === 'OUTBOUND')
    assert.ok(outbound, 'status options must remain available in the unified editor')
    outbound.props.onClick()
    assert.deepEqual(state.values.ips, [{ ip: '198.51.100.2', status: 'OUTBOUND' }])
    assert.deepEqual(state.values.controlAddresses, state.before.controlAddresses)
    assert.equal(state.values.address, state.before.address)
    const reopened = editor(state.values.controlAddresses, state.values.controlAddresses, state.values.ips)
    assert.ok(reopened.control('node-control-addresses.actions'))
})

test('IPv6 aliases share one saved status and unrelated metadata remains untouched', () => {
    const state = editor([address('[2001:db8::2]')], [], [
        { ip: '2001:0db8:0:0::2', status: 'INBOUND' },
        { ip: '198.51.100.2', status: 'RESERVE' },
        { ip: '2001:db8::2', status: 'UNKNOWN' }
    ])
    state.render().find(item => item.type === mantine.Menu.Item && item.key === 'OUTBOUND').props.onClick()
    assert.deepEqual(state.values.ips, [
        { ip: '2001:0db8:0:0::2', status: 'OUTBOUND' },
        { ip: '198.51.100.2', status: 'RESERVE' }
    ])
    assert.deepEqual(state.values.controlAddresses, state.before.controlAddresses)
})

test('manual IPs acquire status metadata while hostnames provide removal only', () => {
    const state = editor([address('192.0.2.1'), address('manual.example.test')], [], [])
    state.render().find(item => item.type === mantine.Menu.Item && item.key === 'MANAGEMENT').props.onClick()
    assert.deepEqual(state.values.ips, [{ ip: '192.0.2.1', status: 'MANAGEMENT' }])
    assert.equal(state.render().filter(item => item.type === mantine.Menu.Target).length, 2)
    assert.equal(state.render().filter(item => item.type === mantine.Menu.Item && item.key !== null).length, 10)
    assert.ok(state.render().some(item => item.props.label === 'node-control-addresses.hostname-status'))
    state.control('node-control-addresses.remove' + 'manual.example.test').props.onClick()
    assert.deepEqual(state.values.controlAddresses, [address('192.0.2.1')])
})

test('status edits obey busy and metadata-capacity guards and existing statuses remain editable at capacity', () => {
    const ips = Array.from({ length: 64 }, (_, index) => ({ ip: `198.51.100.${index + 1}`, status: 'INBOUND' }))
    const state = editor([address('192.0.2.1', false), address('panel.example.test')], [], ips)
    assert.equal(state.control('node-control-addresses.actions').props.disabled, false)
    const unavailable = state.render().find(item => item.type === mantine.Menu.Item && item.key === 'OUTBOUND')
    assert.equal(unavailable.props.disabled, true)
    unavailable.props.onClick()
    assert.deepEqual(state.values.ips, ips)
    state.control('node-control-addresses.remove192.0.2.1').props.onClick()
    assert.deepEqual(state.values.controlAddresses, [address('panel.example.test')])
    const existing = editor([address(ips[0].ip)], [], ips)
    const locked = existing.render({ disabled: true })
    locked.find(item => item.type === mantine.Menu.Item && item.key === 'OUTBOUND').props.onClick()
    assert.deepEqual(existing.values.ips, ips)
    assert.equal(existing.control('node-control-addresses.actions').props.disabled, false)
    existing.render().find(item => item.type === mantine.Menu.Item && item.key === 'OUTBOUND').props.onClick()
    assert.equal(existing.values.ips[0].status, 'OUTBOUND')
    assert.equal(existing.values.ips.length, 64)
})

test('legacy fallback preserves order and seeds only management/reserve roles as enabled', () => {
    const legacy = { address: '2001:0DB8::1', ips: [
        { ip: '2001:db8::1', status: 'MANAGEMENT' },
        { ip: '192.0.2.2', status: 'INBOUND' },
        { ip: '192.0.2.3', status: 'RESERVE' },
        { ip: '192.0.2.4', status: 'MANAGEMENT' },
        { ip: '192.0.2.5', status: 'AVAILABLE' }
    ] }
    const before = structuredClone(legacy)
    assert.deepEqual(helpers.getNodeControlAddresses(legacy), [
        address(legacy.address), address('192.0.2.2', false), address('192.0.2.3'),
        address('192.0.2.4'), address('192.0.2.5', false)
    ])
    assert.deepEqual(legacy, before)
})

test('hostname and IPv6 validation uses the backend schema and retains measured role metadata', () => {
    for (const value of ['node.example.test', 'node_service', '192.0.2.1', '[2001:DB8::1]']) {
        assert.deepEqual(validation.getNodeControlAddressesErrors([address(value)]), {})
    }
    for (const value of ['socks5://user:secret@proxy.invalid:1080', 'host/path', 'host:2222', '2001:invalid::', 'a b']) {
        assert.equal(validation.getNodeControlAddressesErrors([address(value)])['controlAddresses.0.address'], 'node-control-addresses.invalid')
    }
    for (const pair of [['NODE.example.', 'node.EXAMPLE'], ['2001:0db8:0:0:0:0:0:1', '[2001:db8::1]']]) {
        assert.equal(validation.getNodeControlAddressesErrors(pair.map(value => address(value)))['controlAddresses.1.address'], 'node-control-addresses.duplicate')
    }
    assert.equal(validation.getNodeControlAddressesErrors([address('')])['controlAddresses.0.address'], 'node-control-addresses.required')
    assert.deepEqual(validation.getNodeControlAddressesErrors([]), {})
    assert.deepEqual(validation.getNodeControlAddressesErrors([], { required: true }), { controlAddresses: 'node-control-addresses.required' })
    assert.deepEqual(validation.getNodeControlAddressesErrors(undefined, { required: true }), { controlAddresses: 'node-control-addresses.required' })
    assert.deepEqual(validation.getNodeControlAddressesErrors([address('192.0.2.1', false)]), {})
    const full = Array.from({ length: 65 }, (_, index) => address(`node-${index}.example.test`))
    assert.deepEqual(validation.getNodeControlAddressesErrors(full), {})
    assert.equal(validation.getNodeControlAddressesErrors([...full, address('extra.example.test')]).controlAddresses, 'node-control-addresses.invalid-list')
})

test('saved addresses have no remove control and the last enabled address is guarded without changing the anchor or IP roles', () => {
    const state = editor([address('192.0.2.1'), address('2001:db8::2')])
    assert.ok(state.inputs().every(item => item.props.readOnly))
    assert.ok(!state.control('node-control-addresses.discard'))
    state.toggles()[0].props.onChange({ currentTarget: { checked: false } })
    assert.equal(state.toggles()[1].props.disabled, true)
    state.toggles()[1].props.onChange({ currentTarget: { checked: false } })
    assert.deepEqual(state.values.controlAddresses, [address('192.0.2.1', false), address('2001:db8::2')])
    assert.equal(state.values.address, state.before.address)
    assert.deepEqual(state.values.ips, state.before.ips)
})

test('legacy all-off stays off until explicitly enabled and blank drafts never bypass the final address guard', () => {
    const state = editor([address('node.example.test', false)])
    assert.equal(state.toggles()[0].props.disabled, false)
    assert.ok(state.render().some(item => item.props.children === 'node-control-addresses.all-off'))
    state.toggles()[0].props.onChange({ currentTarget: { checked: true } })
    state.add()
    assert.equal(state.toggles()[0].props.disabled, true)
    assert.equal(state.toggles()[1].props.disabled, false)
    state.toggles()[0].props.onChange({ currentTarget: { checked: false } })
    assert.equal(state.values.controlAddresses[0].enabled, true)
    state.toggles()[1].props.onChange({ currentTarget: { checked: false } })
    assert.deepEqual(state.values.controlAddresses, [address('node.example.test')])
    const locked = state.render({ disabled: true }).filter(item => item.type === mantine.Switch)
    locked[0].props.onChange({ currentTarget: { checked: false } })
    assert.deepEqual(state.values.controlAddresses, [address('node.example.test')])
})

test('keyboard reorder preserves each toggle and payload order; a draft matching a saved address remains editable', () => {
    const state = editor([address('192.0.2.1', false), address('node.example.test')])
    state.control('node-control-addresses.upnode.example.test').props.onClick()
    assert.deepEqual(state.values.controlAddresses, [address('node.example.test'), address('192.0.2.1', false)])
    state.add()
    const draft = state.inputs().at(-1)
    draft.props.onChange({ currentTarget: { value: '192.0.2.1' } })
    assert.equal(state.inputs().at(-1).props.readOnly, false)
    assert.equal(state.inputs().at(-1).props.autoFocus, true)
    assert.ok(!state.control('node-control-addresses.discard'))
    state.toggles().at(-1).props.onChange({ currentTarget: { checked: false } })
    assert.equal(state.values.controlAddresses.length, 3)
    assert.deepEqual(state.values.controlAddresses.at(-1), address('192.0.2.1', false))
    assert.ok(state.values.controlAddresses.every(item => Object.keys(item).sort().join(',') === 'address,enabled'))
    const reopened = editor(state.values.controlAddresses)
    assert.deepEqual(reopened.inputs().map(item => item.props.value), ['node.example.test', '192.0.2.1', '192.0.2.1'])
    assert.deepEqual(reopened.toggles().map(item => item.props.checked), [true, false, false])
})

test('switching off an empty unsaved row discards only the blank draft', () => {
    const state = editor([address('node.example.test')])
    state.add()
    state.toggles().at(-1).props.onChange({ currentTarget: { checked: false } })
    assert.deepEqual(state.values.controlAddresses, [address('node.example.test')])
    assert.ok(!state.control('node-control-addresses.discard'))
})

test('all 65 legacy addresses fit and the editor bounds additions', () => {
    const legacy = { address: '192.0.2.1', ips: Array.from({ length: 64 }, (_, index) => ({ ip: `198.51.100.${index + 1}`, status: 'INBOUND' })) }
    const rows = helpers.getNodeControlAddresses(legacy)
    assert.equal(rows.length, 65)
    const state = editor(rows)
    const button = state.render().find(item => item.type === mantine.Button)
    assert.equal(button.props.disabled, true)
    button.props.onClick()
    assert.equal(state.values.controlAddresses.length, 65)
})

test('preferred endpoint sorting follows enabled priority and keeps legacy anchors and arrays unchanged', () => {
    const nodes = [
        { address: 'a-anchor.example', controlAddresses: [address('z.example')] },
        { address: 'z-anchor.example', controlAddresses: [address('a.example')] },
        { address: 'disabled.example', controlAddresses: [address('disabled.example', false)] }
    ]
    const before = structuredClone(nodes)
    assert.deepEqual(helpers.sortNodesByControlAddress(nodes, 'asc'), [nodes[1], nodes[0], nodes[2]])
    assert.deepEqual(helpers.sortNodesByControlAddress(nodes, 'desc'), nodes)
    assert.deepEqual(nodes, before)
    assert.equal(helpers.getPreferredNodeControlAddress({ ...nodes[0], controlAddresses: [] }), null)
})

test('acknowledging an unchanged save locks a new address without relying on a keyed remount', () => {
    const state = editor([address('192.0.2.1')])
    state.add()
    state.inputs().at(-1).props.onChange({ currentTarget: { value: '2001:db8::20' } })
    assert.equal(state.inputs().at(-1).props.readOnly, false)
    state.markSaved()
    const tree = state.render({ savedAddresses: state.values.controlAddresses })
    assert.ok(tree.filter(item => item.type === mantine.TextInput).every(item => item.props.readOnly))
    assert.ok(!tree.some(item => item.props['aria-label']?.startsWith('node-control-addresses.discard')))
})

test('manual consumers retain disabled addresses while geocheck keeps only literal IPs and automatic priority stays separate', () => {
    const node = { address: 'legacy.example.test', controlAddresses: [address('disabled.example.test', false), address('[2001:DB8::2]')],
        ips: [{ ip: '2001:0db8:0:0:0:0:0:2', status: 'INBOUND' }, { ip: '192.0.2.8', status: 'RESERVE' }] }
    const before = structuredClone(node)
    assert.deepEqual(helpers.getConfiguredNodeAddresses(node), ['disabled.example.test', '2001:db8::2', '192.0.2.8'])
    assert.deepEqual(helpers.getNodeLiteralIps(node), ['2001:db8::2', '192.0.2.8'])
    assert.equal(helpers.getNodeSshDefaultAddress(node), '[2001:DB8::2]')
    assert.equal(helpers.normalizeNodeLiteralIp('node.example.test'), null)
    assert.equal(helpers.normalizeNodeLiteralIp('1.2.3'), null)
    assert.equal(helpers.normalizeNodeLiteralIp('[2001:DB8::2]'), '2001:db8::2')
    const allOff = { ...node, controlAddresses: node.controlAddresses.map(row => ({ ...row, enabled: false })) }
    assert.equal(helpers.getPreferredNodeControlAddress(allOff), null)
    assert.equal(helpers.getNodeSshDefaultAddress(allOff), 'disabled.example.test')
    assert.deepEqual(helpers.getConfiguredNodeAddresses(allOff), helpers.getConfiguredNodeAddresses(node))
    assert.deepEqual(node, before)
})
