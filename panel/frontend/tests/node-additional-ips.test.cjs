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

test('pasting the main address into a new row keeps its identity, value and edit controls', () => {
    for (const ips of [[], [primary, a]]) {
        const state = setup(ips)
        state.render().find(el => el.props.children?.type?.name === 'TbPlus').props.onClick()
        const draft = state.rows().at(-1)
        draft.props.onChangeIp(` ${primary.ip} `)
        let row = state.rows().find(item => item.props.id === draft.props.id)
        assert(row, 'the pasted row must remain editable')
        assert.equal(row.props.ip, ` ${primary.ip} `)
        assert.equal(row.props.description, 'node-ips.primary-ip-description')
        assert.equal(state.values.ips.at(-1).ip, primary.ip)
        row.props.onChangeStatus('RESERVE')
        row = state.rows().find(item => item.props.id === draft.props.id)
        row.props.onChangeIp(b.ip)
        assert.deepEqual(state.values.ips.at(-1), entry(b.ip, 'RESERVE'))
        state.rows().find(item => item.props.id === draft.props.id).props.onRemove()
        assert.deepEqual(state.values.ips, ips)
    }
})

test('existing rows stay editable when changed to an equivalent primary IPv6 address', () => {
    const main = entry('2001:0db8:0:0:0:0:0:1', 'MANAGEMENT')
    const state = setup([a, main, b], '[2001:DB8::1]')
    const original = state.rows()[0]
    original.props.onChangeIp('2001:db8::1')
    const row = state.rows().find(item => item.props.id === original.props.id)
    assert(row, 'an edited existing row must not disappear')
    assert.equal(row.props.description, 'node-ips.primary-ip-description')
    assert.deepEqual(state.values.ips[1], main)
    assert.deepEqual(addresses.getAdditionalNodeIps(state.values.ips, state.values.address), [b])
    state.values.address = '2001:db8::2'
    assert(state.rows().some(item => item.props.id === original.props.id))
    row.props.onChangeIp('invalid')
    state.form.errors['ips.0.ip'] = 'invalid'
    assert.equal(state.rows()[0].props.error, 'node-ips.invalid-ip')
})

test('normalized duplicate drafts are explained without discarding their routing statuses', () => {
    const ipv6 = entry('2001:0db8:0:0:0:0:0:2', 'MANAGEMENT')
    const state = setup([primary, ipv6, b])
    const row = state.rows()[1]
    row.props.onChangeIp('2001:DB8::2')
    assert.equal(state.rows()[1].props.description, 'node-ips.duplicate-ip-description')
    assert.deepEqual(state.values.ips, [primary, ipv6, entry('2001:DB8::2', 'BLOCKED')])
    state.rows()[1].props.onChangeIp('203.0.113.27')
    assert.equal(state.rows()[1].props.description, undefined)
})

test('saved primary drafts are hidden after reopening without deleting their control roles', () => {
    const state = setup([a])
    state.render().find(el => el.props.children?.type?.name === 'TbPlus').props.onClick()
    state.rows()[1].props.onChangeIp(primary.ip)
    state.rows()[1].props.onChangeStatus('MANAGEMENT')
    const saved = structuredClone(state.values.ips)
    assert.deepEqual(saved, [a, entry(primary.ip, 'MANAGEMENT')])
    const reopened = setup(saved)
    assert.deepEqual(reopened.rows().map(row => row.props.ip), [a.ip])
    assert.deepEqual(reopened.values.ips, saved)
    assert.deepEqual(reopened.writes, [])
    assert.deepEqual(addresses.getAdditionalNodeIps(saved, primary.ip), [a])
})

test('real IP validation still rejects empty and malformed drafts and allows explicit role duplicates', () => {
    const { getNodeIpsErrors, withNodeIpsErrors } = load('shared/ui/node-ips/validate-node-ips.ts', {
        i18next: { t: key => key }
    })
    assert.deepEqual(getNodeIpsErrors([entry(''), entry('invalid'), entry('2001:db8::2')]), {
        'ips.0.ip': 'node-ips.ip-is-required', 'ips.1.ip': 'node-ips.invalid-ip'
    })
    assert.deepEqual(getNodeIpsErrors([entry(' 198.51.100.1 ', 'MANAGEMENT'), entry('198.51.100.1', 'RESERVE')]), {})
    assert.equal(getNodeIpsErrors(Array.from({ length: 65 }, () => a)).ips, 'node-ips.max-ips-reached')
    assert.deepEqual(withNodeIpsErrors(() => ({ address: 'invalid address' }))({ ips: [entry('')] }), {
        address: 'invalid address', 'ips.0.ip': 'node-ips.ip-is-required'
    })
})

test('sorting a draft matching the main address preserves hidden control metadata', () => {
    const state = setup([primary, a, b])
    const draft = state.rows()[0]
    draft.props.onChangeIp(primary.ip)
    const rows = state.rows()
    assert.equal(rows.length, 2)
    state.render().find(el => el.props.onDragEnd).props.onDragEnd({ canceled: false, operation: {
        source: { id: rows[0].props.id, index: 1 }, target: { id: rows[1].props.id }
    } })
    assert.deepEqual(state.values.ips, [primary, b, entry(primary.ip)])
    assert.equal(state.rows()[1].props.id, draft.props.id)
})

test('duplicate explanations are localized in every supported language', () => {
    for (const language of ['en', 'ru', 'fa', 'zh']) {
        const locale = require(`../public/locales/${language}/remnawave.json`)
        for (const key of ['primary-ip-description', 'duplicate-ip-description']) {
            assert.equal(typeof locale['node-ips'][key], 'string')
            assert(locale['node-ips'][key].trim())
        }
    }
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
