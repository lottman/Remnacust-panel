const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { parse } = require('jsonc-parser')
const load = require('../../backend/tests/load-typescript.cjs')
const helper = load(path.resolve(__dirname, '../src/widgets/dashboard/config-profiles/config-editor/xera-settings.ts'))
const stream = settings => ({ network: 'xera-http', xeraHttpSettings: settings })
const profile = settings => JSON.stringify({
    inbounds: [{ tag: 'inbound', streamSettings: stream(settings) }],
    outbounds: [{ tag: 'outbound', protocol: 'vless', streamSettings: stream({ path: '/outbound', mode: 'stream-one' }) },
        { tag: 'direct', protocol: 'freedom' }],
    routing: { rules: [{ type: 'field', outboundTag: 'direct' }] }
}, null, 2)
const target = text => helper.readXeraSettings(text).targets[0]

test('inspection finds existing inbound and outbound JSON paths without converting manual transports', () => {
    const text = profile({ path: '/manual', mode: 'packet-up', xmux: { maxConnections: 8 } })
    const before = text
    const document = helper.readXeraSettings(text)
    assert.equal(document.issue, null)
    assert.equal(document.targets.length, 2)
    assert.deepEqual(document.targets.map(value => value.kind), ['inbounds', 'outbounds'])
    assert.deepEqual(document.targets[0].adaptivePath, ['inbounds', 0, 'streamSettings', 'xeraHttpSettings', 'adaptive'])
    assert.ok(document.targets.every(value => value.adaptive === null))
    assert.equal(text, before)
    assert.deepEqual(helper.newXeraAdaptiveSettings(), { mode: 'balanced', minStreams: 4, maxStreams: 32 })
    const changed = helper.newXeraAdaptiveSettings(); changed.minStreams = 1
    assert.equal(helper.newXeraAdaptiveSettings().minStreams, 4)
})

test('explicit apply changes only selected adaptive fields and preserves sibling transports and manual settings', () => {
    const text = profile({ path: '/manual', host: 'host.example.test', mode: 'stream-one', headers: { 'X-Custom': 'retained' },
        xmux: { maxConnections: 8 }, customDownlinkPadding: { uplink: true } })
    const before = JSON.parse(text)
    const settings = { mode: 'unstable-network', minStreams: 2, maxStreams: 24 }
    const next = helper.applyXeraAdaptiveSettings(text, target(text).id, settings)
    const expected = structuredClone(before)
    expected.inbounds[0].streamSettings.xeraHttpSettings.adaptive = settings
    assert.deepEqual(JSON.parse(next), expected)
    assert.equal(JSON.parse(text).inbounds[0].streamSettings.xeraHttpSettings.mode, 'stream-one')
    const outbound = helper.readXeraSettings(text).targets[1]
    const outboundNext = helper.applyXeraAdaptiveSettings(text, outbound.id, settings)
    assert.deepEqual(JSON.parse(outboundNext).inbounds, before.inbounds)
    assert.deepEqual(JSON.parse(outboundNext).outbounds[0].streamSettings.xeraHttpSettings.adaptive, settings)
})

test('extra receives the effective adaptive settings while unrelated JSONC comments and manual fields survive', () => {
    const text = '{\r\n  // root retained\r\n  "inbounds": [{"tag":"server", "streamSettings": {"network":"xera-http", "xeraHttpSettings": {\r\n    "mode":"packet-up",\r\n    "adaptive":{"mode":"balanced","minStreams":1,"maxStreams":2},\r\n    "extra": {\r\n      // extra retained\r\n      "xmux":{"maxConnections":9},\r\n      "adaptive": {"mode":"balanced", "minStreams":4, "maxStreams":32, "customFutureField":true},\r\n      "headers":{"X-Custom":"retained"}\r\n    }\r\n  }}}],\r\n  "outbounds":[{"tag":"direct","protocol":"freedom"}]\r\n}'
    const chosen = target(text)
    assert.deepEqual(chosen.adaptivePath, ['inbounds', 0, 'streamSettings', 'xeraHttpSettings', 'extra', 'adaptive'])
    const next = helper.applyXeraAdaptiveSettings(text, chosen.id, { mode: 'low-latency', minStreams: 3, maxStreams: 16 })
    assert.ok(next.includes('// root retained') && next.includes('// extra retained'))
    assert.ok(next.includes('\r\n'))
    const expected = parse(text)
    Object.assign(expected.inbounds[0].streamSettings.xeraHttpSettings.extra.adaptive, { mode: 'low-latency', minStreams: 3, maxStreams: 16 })
    assert.deepEqual(parse(next), expected)
    assert.equal(parse(next).inbounds[0].streamSettings.xeraHttpSettings.adaptive.maxStreams, 2)
})

test('recoverable parser errors, duplicate keys and invalid roots never produce editable targets', () => {
    for (const value of ['', '{', '{"inbounds": [}', '{"inbounds":[],}', '[]', 'null', 'true', '{"inbounds":{}}',
        '{"outbounds":[],"outbounds":[]}', '{"a":{"b":1,"b":2}}']) {
        const document = helper.readXeraSettings(value)
        assert.ok(document.issue, value)
        assert.deepEqual(document.targets, [])
        assert.throws(() => helper.applyXeraAdaptiveSettings(value, 'missing', helper.newXeraAdaptiveSettings()))
    }
})

test('integer bounds and mode validation reject invalid values before any JSON modification', () => {
    const text = profile({})
    for (const settings of [null, [], {}, { mode: 'stream-auto', minStreams: 4, maxStreams: 32 },
        { mode: 'balanced', minStreams: 0, maxStreams: 32 }, { mode: 'balanced', minStreams: 4, maxStreams: 33 },
        { mode: 'balanced', minStreams: 12, maxStreams: 8 }, { mode: 'balanced', minStreams: 1.5, maxStreams: 32 },
        { mode: 'balanced', minStreams: '4', maxStreams: 32 }, { mode: 'balanced', minStreams: NaN, maxStreams: 32 }]) {
        assert.equal(helper.validateXeraAdaptiveSettings(settings), false)
        assert.throws(() => helper.applyXeraAdaptiveSettings(text, target(text).id, settings), error => error.code === 'invalid-bounds')
    }
    for (const mode of helper.XERA_ADAPTIVE_MODES) {
        assert.equal(helper.validateXeraAdaptiveSettings({ mode, minStreams: 1, maxStreams: 32 }), true)
        assert.equal(helper.validateXeraAdaptiveSettings({ mode, minStreams: 32, maxStreams: 32 }), true)
    }
})

test('invalid adaptive or extra data stays available in JSON and cannot be silently replaced', () => {
    for (const settings of [{ extra: null }, { extra: 'manual' }, { adaptive: false }, { adaptive: { mode: 'future-profile', minStreams: 4, maxStreams: 32 } }]) {
        const text = profile(settings)
        assert.ok(target(text).issue)
        assert.throws(() => helper.applyXeraAdaptiveSettings(text, target(text).id, helper.newXeraAdaptiveSettings()))
        assert.deepEqual(JSON.parse(text).inbounds[0].streamSettings.xeraHttpSettings, settings)
    }
})

test('an explicit null adaptive value stays manual until applying a new valid preset', () => {
    const text = profile({ path: '/manual', mode: 'stream-up', adaptive: null })
    const selected = target(text)
    assert.equal(selected.issue, null)
    assert.equal(selected.adaptive, null)
    assert.equal(JSON.parse(text).inbounds[0].streamSettings.xeraHttpSettings.adaptive, null)
    const next = helper.applyXeraAdaptiveSettings(text, selected.id, helper.newXeraAdaptiveSettings())
    const expected = JSON.parse(text)
    expected.inbounds[0].streamSettings.xeraHttpSettings.adaptive = helper.newXeraAdaptiveSettings()
    assert.deepEqual(JSON.parse(next), expected)
})

test('partial adaptive objects are rejected without filling UI preset defaults', () => {
    const complete = helper.newXeraAdaptiveSettings()
    for (const missing of ['mode', 'minStreams', 'maxStreams']) {
        const partial = { ...complete }
        delete partial[missing]
        for (const settings of [{ adaptive: partial }, { extra: { adaptive: partial } }]) {
            const text = profile(settings)
            const selected = target(text)
            assert.equal(selected.issue, 'invalid-adaptive')
            assert.equal(selected.adaptive, null)
            assert.throws(() => helper.applyXeraAdaptiveSettings(text, selected.id, complete), error => error.code === 'invalid-adaptive')
            assert.deepEqual(JSON.parse(text).inbounds[0].streamSettings.xeraHttpSettings, settings)
        }
    }
})

test('parent Apply preserves separate downlink fields and any explicit downlink adaptive override', () => {
    for (const ownAdaptive of [undefined, { mode: 'low-latency', minStreams: 2, maxStreams: 8 }]) {
        for (const useExtra of [false, true]) {
            const downloadSettings = {
                address: 'downlink.example.test', port: 443, network: 'xera-http', security: 'tls',
                xeraHttpSettings: { path: '/download', mode: 'stream-up',
                    ...(ownAdaptive === undefined ? {} : { adaptive: ownAdaptive }) }
            }
            const tuning = { xmux: { maxConnections: 9 }, downloadSettings }
            const settings = { path: '/parent', mode: 'packet-up', ...(useExtra ? { extra: tuning } : tuning) }
            const text = profile(settings)
            const next = helper.applyXeraAdaptiveSettings(text, target(text).id, helper.newXeraAdaptiveSettings())
            const expected = JSON.parse(text)
            const effective = expected.inbounds[0].streamSettings.xeraHttpSettings
            ;(useExtra ? effective.extra : effective).adaptive = helper.newXeraAdaptiveSettings()
            assert.deepEqual(JSON.parse(next), expected)
            const actual = JSON.parse(next).inbounds[0].streamSettings.xeraHttpSettings
            assert.deepEqual((useExtra ? actual.extra : actual).downloadSettings, downloadSettings)
        }
    }
})

test('a changed target is rejected and repeated identical apply preserves the draft byte for byte', () => {
    const text = profile({ adaptive: helper.newXeraAdaptiveSettings() })
    assert.equal(helper.applyXeraAdaptiveSettings(text, target(text).id, helper.newXeraAdaptiveSettings()), text)
    const changed = text.replace('"inbound"', '"renamed"')
    assert.throws(() => helper.applyXeraAdaptiveSettings(changed, target(text).id, helper.newXeraAdaptiveSettings()), error => error.code === 'target-changed')
})

test('applying to Monaco rejects stale or disposed documents before an undoable edit', () => {
    let value = 'current draft'
    let disposed = false
    const calls = []
    const instance = {
        getModel: () => ({
            getValue: () => value,
            isDisposed: () => disposed,
            getFullModelRange: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: value.length + 1 })
        }),
        pushUndoStop: () => calls.push('undo-stop'),
        executeEdits: (source, edits) => { calls.push(source); value = edits[0].text; return true }
    }
    assert.equal(helper.applyXeraSettingsToEditor(instance, 'obsolete draft', 'replacement'), false)
    disposed = true
    assert.equal(helper.applyXeraSettingsToEditor(instance, value, 'replacement'), false)
    assert.equal(helper.applyXeraSettingsToEditor(null, value, 'replacement'), false)
    assert.deepEqual(calls, [])
    assert.equal(value, 'current draft')
    disposed = false
    assert.equal(helper.applyXeraSettingsToEditor(instance, value, value), true)
    assert.deepEqual(calls, [])
    assert.equal(helper.applyXeraSettingsToEditor(instance, value, 'replacement'), true)
    assert.equal(value, 'replacement')
    assert.deepEqual(calls, ['undo-stop', 'xera-adaptive-settings', 'undo-stop'])
})
