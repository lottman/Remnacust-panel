const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const load = require('../../backend/tests/load-typescript.cjs')
const { getNodeHealth } = load(path.resolve(__dirname, '../src/shared/utils/node-health.ts'))
const ready = { configProfile: { activeConfigProfileUuid: 'profile', activeInbounds: ['inbound'] }, isConnected: true,
    isConnecting: false, isDisabled: false, xrayUptime: 10,
    system: { info: { memoryTotal: 100, cpus: 2 }, stats: { memoryUsed: 25, loadAvg: [0.4, 0.4, 0.4] } } }

test('disconnected, connecting and disabled nodes never receive points from cached metrics', () => {
    for (const flags of [{ isConnected: false }, { isConnected: false, isConnecting: true }, { isConnecting: true }, { isDisabled: true }])
        assert.equal(getNodeHealth({ ...ready, ...flags }).score, 0)
    assert.equal(getNodeHealth({ ...ready, isConnected: false }).level, 'critical')
    assert.ok(getNodeHealth({ ...ready, isConnecting: true }).issues.includes('connecting'))
})
test('all confirmed signals give 100; missing telemetry cannot inflate the denominator', () => {
    assert.equal(getNodeHealth(ready).score, 100)
    const missing = getNodeHealth({ ...ready, system: null })
    assert.equal(missing.score, 75)
    assert.equal(missing.level, 'limited')
    assert.ok(missing.unavailableSignals.includes('resources'))
})
test('expired or malformed core telemetry and missing configuration give zero', () => {
    for (const xrayUptime of [0, -1, NaN, Infinity]) assert.equal(getNodeHealth({ ...ready, xrayUptime }).score, 0)
    assert.equal(getNodeHealth({ ...ready, configProfile: { activeConfigProfileUuid: null, activeInbounds: [] } }).score, 0)
})
test('high resource pressure is attention; invalid resource samples are unavailable', () => {
    const pressured = structuredClone(ready); pressured.system.stats.memoryUsed = 95
    assert.equal(getNodeHealth(pressured).level, 'attention')
    assert.equal(getNodeHealth(pressured).score, 75)
    for (const memoryUsed of [-1, 101, NaN]) {
        const node = structuredClone(ready); node.system.stats.memoryUsed = memoryUsed
        assert.ok(getNodeHealth(node).unavailableSignals.includes('resources'))
    }
})
