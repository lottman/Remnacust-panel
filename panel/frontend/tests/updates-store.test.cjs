const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

function loadStore(responses) {
    const compiled = ts.transpileModule(
        fs.readFileSync(path.join(__dirname, '../src/entities/dashboard/updates-store/use-updates-store.ts'), 'utf8'),
        { compilerOptions: { module: ts.ModuleKind.CommonJS } }
    ).outputText
    const versionExports = {}
    vm.runInNewContext(ts.transpileModule(
        fs.readFileSync(path.join(__dirname, '../src/shared/utils/panel-version.ts'), 'utf8'),
        { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }
    ).outputText, { exports: versionExports, require })
    const exports = {}
    let calls = 0
    vm.runInNewContext(compiled, {
        exports,
        require(name) {
            if (name === 'axios') return { default: { get: async () => {
                const response = responses[calls++]
                if (response instanceof Error) throw response
                if (!response) throw Error('Unexpected request')
                return { data: response }
            } } }
            if (name === 'zustand/middleware') return {
                persist: initializer => initializer,
                devtools: initializer => initializer,
                createJSONStorage: () => undefined
            }
            if (name === '@shared/utils/panel-version') return versionExports
            if (name === '@shared/utils/time-utils') return { sToMs: value => value * 1000 }
            return require(name)
        }
    })
    return { store: exports.useUpdatesStore, calls: () => calls }
}

test('a failed release check stays retryable when repository metadata succeeds', async () => {
    const { store, calls } = loadStore([
        { stargazers_count: 3 }, Error('Release unavailable'),
        { stargazers_count: 4 }, { tag_name: 'v1.1.7.5' }
    ])
    const previous = Date.now() - 25 * 60 * 60 * 1000
    store.setState({ lastUpdateTimestamp: previous, remnawaveInfo: { latestVersion: '1.1.7.4', starsCount: 2 } })
    await store.getState().actions.getRemnawaveInfo()
    assert.equal(store.getState().lastUpdateTimestamp, previous)
    assert.equal(store.getState().remnawaveInfo.latestVersion, '1.1.7.4')
    await store.getState().actions.getRemnawaveInfo()
    assert.equal(store.getState().remnawaveInfo.latestVersion, '1.1.7.5')
    assert.ok(store.getState().lastUpdateTimestamp > previous)
    await store.getState().actions.getRemnawaveInfo()
    assert.equal(calls(), 4)
})

test('malformed release tags do not overwrite the last known version or delay retry', async () => {
    const { store } = loadStore([{ stargazers_count: 3 }, { tag_name: 'nightly' }])
    store.setState({ remnawaveInfo: { latestVersion: '1.1.7.4', starsCount: 2 } })
    await store.getState().actions.getRemnawaveInfo()
    assert.equal(store.getState().remnawaveInfo.latestVersion, '1.1.7.4')
    assert.equal(store.getState().lastUpdateTimestamp, 0)
})

test('a release still updates when the stars request fails', async () => {
    const { store } = loadStore([Error('Repository unavailable'), { tag_name: 'v1.1.8' }])
    store.setState({ remnawaveInfo: { latestVersion: '1.1.7.4', starsCount: 2 } })
    await store.getState().actions.getRemnawaveInfo()
    assert.equal(store.getState().remnawaveInfo.latestVersion, '1.1.8')
    assert.equal(store.getState().remnawaveInfo.starsCount, 2)
    assert.equal(store.getState().lastUpdateTimestamp, 0)
})

test('an initial placeholder or a timestamp in the future cannot suppress release checks', async () => {
    for (const state of [
        { latestVersion: '0.0.0', timestamp: Date.now() },
        { latestVersion: '1.1.7.4', timestamp: Date.now() + 60 * 60 * 1000 }
    ]) {
        const { store, calls } = loadStore([{ stargazers_count: 3 }, { tag_name: 'v1.1.7.5' }])
        store.setState({ lastUpdateTimestamp: state.timestamp, remnawaveInfo: { latestVersion: state.latestVersion, starsCount: 2 } })
        await store.getState().actions.getRemnawaveInfo()
        assert.equal(calls(), 2)
        assert.equal(store.getState().remnawaveInfo.latestVersion, '1.1.7.5')
    }
})
