const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const React = require('react')

function load(file, mocks = {}) {
    const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText
    const ref = { exports: {} }
    new Function('require', 'module', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports)
    return ref.exports
}

const addresses = load('shared/utils/node-addresses.ts')
const entry = (ip, status = 'UNKNOWN') => ({ ip, status })
const primary = entry('192.0.2.10', 'AVAILABLE')
const a = entry('198.51.100.25')
const b = entry('203.0.113.26', 'BLOCKED')

function children(value) {
    if (Array.isArray(value)) return value.flatMap(children)
    return value?.props ? [value, ...children(value.props.children)] : []
}

function setup(ips, address = primary.ip) {
    let cursor = 0
    const states = []
    const values = { ips: structuredClone(ips), address }
    const writes = []
    const form = {
        errors: {},
        getValues: () => values,
        useWatchValue: key => values[key],
        setFieldValue: (key, value) => { values[key] = value; writes.push({ key, value }) }
    }
    const { NodeIpsEditor } = load('shared/ui/node-ips/node-ips-editor.tsx', {
        react: { ...React, useCallback: fn => fn, useState: initial => {
            const index = cursor++
            if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
            return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
        } },
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: 'header' },
        '@shared/ui/section-card': { SectionCard: { Root: 'root', Section: 'section' } },
        '@shared/utils/node-addresses': addresses,
        './node-ip-row': { NodeIpRow: 'node-ip-row' },
        './validate-node-ips': { MAX_NODE_IPS: 64, isValidNodeIp: ip => ip !== 'invalid' }
    })
    const render = () => { cursor = 0; return children(NodeIpsEditor({ form })) }
    const rows = () => render().filter(el => el.type === 'node-ip-row')
    return { form, values, writes, rows, render }
}

test('additional addresses exclude only the main address and never mutate stored entries', () => {
    const ips = [primary, a, b]
    const before = structuredClone(ips)
    assert.deepEqual(addresses.getAdditionalNodeIps(ips, primary.ip), [a, b])
    assert.deepEqual(addresses.getAdditionalNodeIps(ips, 'node.example.test'), ips)
    assert.deepEqual(addresses.getAdditionalNodeIps(ips, null), ips)
    for (const empty of [undefined, null, []]) assert.deepEqual(addresses.getAdditionalNodeIps(empty, primary.ip), [])
    assert.deepEqual(ips, before)
})

test('equivalent IPv6 spellings are excluded and unrelated IPv6 addresses remain', () => {
    const same = entry('2001:0db8:0:0:0:0:0:1')
    const other = entry('2001:db8::2')
    for (const address of ['2001:DB8::1', '[2001:db8::1]', ' 2001:db8::1 ']) {
        assert.deepEqual(addresses.getAdditionalNodeIps([same, other], address), [other])
    }
    assert.equal(addresses.normalizeNodeAddress('not:an:ip'), 'not:an:ip')
})

test('opening and changing the main address changes visibility without writing or losing statuses', () => {
    const state = setup([primary, a, b])
    assert.deepEqual(state.rows().map(row => row.props.ip), [a.ip, b.ip])
    state.values.address = a.ip
    assert.deepEqual(state.rows().map(row => row.props.ip), [primary.ip, b.ip])
    assert.equal(state.rows()[0].props.status, primary.status)
    assert.deepEqual(state.writes, [])
    assert.deepEqual(state.values.ips, [primary, a, b])
})

test('editing, removing and adding additional addresses preserves the hidden main entry', () => {
    const state = setup([primary, a, b])
    state.rows()[0].props.onChangeIp('198.51.100.30')
    state.rows()[0].props.onChangeStatus('AVAILABLE')
    state.rows()[1].props.onRemove()
    assert.deepEqual(state.values.ips, [primary, entry('198.51.100.30', 'AVAILABLE')])
    state.render().find(el => el.props.children?.type?.name === 'TbPlus').props.onClick()
    const rows = state.rows()
    assert.equal(rows.length, 2)
    assert.equal(rows[1].props.autoFocus, true)
    assert.deepEqual(state.values.ips, [primary, entry('198.51.100.30', 'AVAILABLE'), entry('')])
})

test('sorting visible addresses keeps hidden main addresses in their original slots', () => {
    for (const ips of [[primary, a, b], [a, primary, b], [a, b, primary]]) {
        const state = setup(ips)
        const rows = state.rows()
        const provider = state.render().find(el => el.props.onDragEnd)
        provider.props.onDragEnd({ canceled: false, operation: { source: { id: rows[0].props.id, index: 1 }, target: { id: rows[1].props.id } } })
        const expected = ips.map(item => item === primary ? primary : item === a ? b : a)
        assert.deepEqual(state.values.ips, expected)
        assert.deepEqual(state.rows().map(row => row.props.index), [0, 1])
        const before = structuredClone(state.values.ips)
        provider.props.onDragEnd({ canceled: true })
        assert.deepEqual(state.values.ips, before)
    }
})

test('visible input errors retain the original storage index and the total capacity remains bounded', () => {
    const state = setup([primary, entry('invalid')])
    state.form.errors['ips.1.ip'] = 'invalid'
    assert.equal(state.rows()[0].props.error, 'node-ips.invalid-ip')
    const full = setup([primary, ...Array.from({ length: 63 }, (_, index) => entry(`198.51.100.${index + 1}`))])
    const add = full.render().find(el => el.props.children?.type?.name === 'TbPlus')
    assert.equal(add.props.disabled, true)
    add.props.onClick()
    assert.equal(full.values.ips.length, 64)
    assert.deepEqual(full.writes, [])
})

test('compact node lists exclude the main address from counts and empty states', () => {
    const { NodeIpsCompactView } = load('shared/ui/node-ips/node-ips-compact-view.tsx', {
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        '@shared/utils/node-addresses': addresses,
        './node-ip-status-icon': { NodeIpStatusIcon: 'status' },
        './node-ip-status.constants': { resolveNodeIpStatusMeta: () => ({ labelKey: 'status' }) }
    })
    const tree = children(NodeIpsCompactView({ ips: [primary, a, b], address: primary.ip, maxVisible: 1 }))
    const texts = tree.map(el => el.props.children).filter(value => typeof value === 'string')
    assert(texts.includes(a.ip))
    assert(texts.includes(b.ip))
    assert(!texts.includes(primary.ip))
    assert.equal(tree.filter(el => el.type === 'status').length, 3)
    assert.equal(NodeIpsCompactView({ ips: [primary], address: primary.ip }).props.children, '—')
})
