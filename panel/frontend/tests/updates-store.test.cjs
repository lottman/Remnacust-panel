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
        atob,
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

function installer(tag = 'v1.2.29') {
    return { tag_name: tag, draft: false, prerelease: false, assets:
        ['installer.sh', 'SHA256SUMS', `remnacust-runtime-${tag}.tar.gz`].map(name => ({
            name, state: 'uploaded', size: 123, digest: 'sha256:' + 'a'.repeat(64)
        })) }
}
function sources(version = '1.1.7.5') {
    return { encoding: 'base64', content: Buffer.from(JSON.stringify({ panel: {
        repository: 'lottman/Remnacust-panel', version, commit: 'a'.repeat(40)
    } })).toString('base64') }
}

test('a failed release check stays retryable when repository metadata succeeds', async () => {
    const { store, calls } = loadStore([
        { stargazers_count: 3 }, Error('Release unavailable'),
        { stargazers_count: 4 }, installer(), sources()
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
    assert.equal(calls(), 5)
})

test('malformed release tags do not overwrite the last known version or delay retry', async () => {
    const { store } = loadStore([{ stargazers_count: 3 }, { tag_name: 'nightly' }])
    store.setState({ remnawaveInfo: { latestVersion: '1.1.7.4', starsCount: 2 } })
    await store.getState().actions.getRemnawaveInfo()
    assert.equal(store.getState().remnawaveInfo.latestVersion, '1.1.7.4')
    assert.equal(store.getState().lastUpdateTimestamp, 0)
})

test('a release still updates when the stars request fails', async () => {
    const { store } = loadStore([Error('Repository unavailable'), installer(), sources('1.1.8')])
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
        const { store, calls } = loadStore([{ stargazers_count: 3 }, installer(), sources()])
        store.setState({ lastUpdateTimestamp: state.timestamp, remnawaveInfo: { latestVersion: state.latestVersion, starsCount: 2 } })
        await store.getState().actions.getRemnawaveInfo()
        assert.equal(calls(), 3)
        assert.equal(store.getState().remnawaveInfo.latestVersion, '1.1.7.5')
    }
})

test('only a complete stable installer can advertise its pinned panel', async () => {
    for (const release of [
        { ...installer(), draft: true }, { ...installer(), prerelease: true },
        { ...installer(), assets: [] }, { ...installer(), assets: installer().assets.slice(1) },
        { ...installer(), assets: installer().assets.map(a => ({ ...a, state: 'new' })) },
        { ...installer(), assets: installer().assets.map(a => ({ ...a, digest: null })) }
    ]) {
        const { store, calls } = loadStore([{ stargazers_count: 3 }, release])
        await store.getState().actions.getRemnawaveInfo()
        assert.equal(store.getState().remnawaveInfo.latestVersion, '0.0.0')
        assert.equal(store.getState().lastUpdateTimestamp, 0)
        assert.equal(calls(), 2)
    }
})

test('unavailable or malformed component pins remain retryable', async () => {
    for (const file of [Error('Not published'), { encoding: 'base64', content: 'invalid' },
        { encoding: 'text', content: '{}' }, sources('nightly'),
        { encoding: 'base64', content: Buffer.from('{"panel":{"repository":"other/panel","version":"9.9.9.9","commit":"' + 'a'.repeat(40) + '"}}').toString('base64') }
    ]) {
        const { store } = loadStore([{ stargazers_count: 3 }, installer(), file])
        await store.getState().actions.getRemnawaveInfo()
        assert.equal(store.getState().lastUpdateTimestamp, 0)
        assert.equal(store.getState().remnawaveInfo.latestVersion, '0.0.0')
    }
})

test('uses the installer pin even when the panel repository already has a newer release', async () => {
    const { store } = loadStore([{ stargazers_count: 3 }, installer(), sources('1.1.7.7')])
    await store.getState().actions.getRemnawaveInfo()
    assert.equal(store.getState().remnawaveInfo.latestVersion, '1.1.7.7')
})
