const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MantineProvider } = require('@mantine/core')
const id = '55632671-6aa0-45db-aacb-92be57ce7e73'
const idle = { available: true, installedVersion: '1.1.7.4', active: false, phase: 'idle', jobId: null, targetVersion: null, error: null }
const active = { ...idle, active: true, phase: 'updating', jobId: id, targetVersion: '1.1.7.5' }

function compile(relative, mocks, globals = {}) {
    const exports = {}
    const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
    } }).outputText, { exports, require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ...globals })
    return exports
}
function store(post = async () => ({ data: { response: active } }), saved = null) {
    const memory = new Map(saved ? [['remnacust-panel-update-job', saved], ['remnacust-panel-update-job-version', '1.1.7.5']] : [])
    let reloads = 0, requests = 0
    const { usePanelUpdateStore } = compile('src/entities/dashboard/panel-update/panel-update.ts', {
        '@shared/utils/panel-version': compile('src/shared/utils/panel-version.ts', {}),
        '@shared/api/axios': { instance: { post: async (...args) => { requests++; return post(...args) } } }
    }, {
        crypto: { randomUUID: () => id }, Event: class {},
        sessionStorage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) },
        window: { location: { reload: () => reloads++ }, dispatchEvent() {} }
    })
    return { store: usePanelUpdateStore, memory, reloads: () => reloads, requests: () => requests }
}

test('all sessions observe maintenance and reload once after completion', () => {
    const browsers = [store(), store()]
    for (const browser of browsers) {
        browser.store.getState().accept(active)
        assert.equal(browser.store.getState().observedJob, id)
        assert.equal(browser.memory.get('remnacust-panel-update-job'), id)
        browser.store.getState().accept({ ...active, active: false, phase: 'completed', installedVersion: '1.1.7.5' })
        assert.equal(browser.reloads(), 1)
        browser.store.getState().accept({ ...active, active: false, phase: 'completed' })
        assert.equal(browser.reloads(), 1)
        assert.equal(browser.store.getState().observedJob, null)
    }
})

test('refresh and a delayed idle response cannot bypass an accepted update', () => {
    const browser = store(undefined, id)
    browser.store.getState().accept(idle)
    assert.equal(browser.store.getState().observedJob, id)
    browser.store.getState().accept(active)
    browser.store.getState().accept(idle)
    assert.equal(browser.store.getState().status.phase, 'updating')
    assert.equal(browser.reloads(), 0)
})

test('completed jobs from before the current session do not cause reload loops', () => {
    const browser = store()
    browser.store.getState().accept({ ...active, active: false, phase: 'completed' })
    assert.equal(browser.reloads(), 0)
    assert.equal(browser.store.getState().observedJob, null)
})

test('a sleeping session recovers after its target version is installed by a later job', () => {
    const browser = store(undefined, id)
    browser.store.getState().accept({ ...idle, installedVersion: '1.1.7.6', phase: 'completed', jobId: '18736d55-8c27-4ed1-860a-1d76738243bc' })
    assert.equal(browser.reloads(), 1)
    assert.equal(browser.store.getState().observedJob, null)
})

test('failed jobs release the panel only after the user dismisses the result', () => {
    const browser = store()
    browser.store.getState().accept(active)
    browser.store.getState().accept({ ...active, active: false, phase: 'failed', error: 'UPDATE_FAILED' })
    assert.equal(browser.store.getState().observedJob, id)
    assert.equal(browser.reloads(), 0)
    browser.store.getState().dismiss()
    assert.equal(browser.store.getState().observedJob, null)
    assert.equal(browser.memory.size, 0)
})

test('double clicks send one request and an interrupted response defers to server status', async () => {
    let reject
    const browser = store(() => new Promise((_, fail) => { reject = fail }))
    const pending = browser.store.getState().start('1.1.7.5')
    await browser.store.getState().start('1.1.7.5')
    assert.equal(browser.requests(), 1)
    assert.equal(browser.memory.size, 0)
    reject(Error('Connection interrupted'))
    await assert.rejects(pending)
    browser.store.getState().accept(active)
    assert.equal(browser.store.getState().observedJob, id)
    assert.equal(browser.store.getState().confirmed, true)
})

test('a rejected start without a server job returns to the panel', async () => {
    const browser = store(async () => { throw Error('Unavailable') })
    await assert.rejects(browser.store.getState().start('1.1.7.5'))
    browser.store.getState().accept(idle)
    assert.equal(browser.store.getState().observedJob, null)
    assert.equal(browser.store.getState().starting, false)
})

test('the real update button is absent without a new version', () => {
    const browser = store()
    browser.store.getState().accept(idle)
    const { PanelUpdateButton } = compile('src/shared/ui/panel-update-gate/panel-update-button.tsx', {
        '@entities/dashboard/updates-store': { useRemnawaveInfo: () => ({ latestVersion: '1.1.7.5' }) },
        '@entities/dashboard/panel-update/panel-update': { usePanelUpdateStore: () => browser.store.getState() },
        'react-i18next': { useTranslation: () => ({ t: (key, values) => values?.version ? 'Update to ' + values.version : key }) },
        '@mantine/notifications': { notifications: { show() {} } },
        './panel-update.module.css': { appear: 'appear' }
    })
    const render = available => renderToStaticMarkup(React.createElement(MantineProvider, {}, React.createElement(PanelUpdateButton, { available })))
    assert.equal(render(false).includes('<button'), false)
    assert.match(render(true), /Update to 1\.1\.7\.5/)
    assert.match(render(true), /class="[^"]*appear/)
    assert.equal(render(true).includes('disabled=""'), false)
    browser.store.setState({ status: { ...idle, available: false } })
    assert.match(render(true), /disabled=""/)
})
