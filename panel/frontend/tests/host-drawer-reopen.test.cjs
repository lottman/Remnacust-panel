const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const { QueryClient, QueryObserver } = require('@tanstack/react-query')

function load(file, dependencies = {}) {
    const ref = { exports: {} }
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText
    new Function('require', 'module', 'exports', js)(name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), ref, ref.exports)
    return ref.exports
}

const uuid = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
let result = {}
let request
const { EditHostDrawer } = load('shared/_modals/hosts/edit-host-modal/edit-host.modal.tsx', {
    '@ebay/nice-modal-react': { __esModule: true, default: { create: component => component }, useModal: () => ({ visible: true }) },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    '@mantine/core': { Alert: 'Alert', Button: 'Button', Drawer: 'Drawer', Stack: 'Stack' },
    'react-icons/pi': { PiListChecks: 'Icon' },
    '@shared/_modals/use-nice-modal': { useNiceMantineModal: () => ({ modalProps: {}, hide() {} }) },
    '@shared/api': { queryClient: {} },
    '@shared/api/hooks': { QueryKeys: {}, useGetHost: params => { request = params; return result } },
    '@shared/constants': { OPEN_ENTITY: { HOST: 'host' } },
    '@shared/ui/loader-modal': { LoaderModalShared: 'Loader' },
    '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: 'Header' },
    './edit-host.modal.content': { EditHostDrawerContent: 'Form' }
})
const { createUrl } = load('shared/api/helpers/create-url.ts')
const { createGetQueryHook } = load('shared/api/tsq-helpers/create-get-query.hook.ts', {
    '@tanstack/react-query': { useQuery: options => options },
    '../axios': { instance: {} },
    '../helpers': { createUrl, handleRequestError: error => { throw error } }
})
const { useGetHost } = load('shared/api/hooks/hosts/hosts.query.hooks.ts', {
    '@remnawave/backend-contract': require('../vendor/backend-contract'),
    '@shared/utils/time-utils': { sToMs: value => value * 1000 },
    '../../tsq-helpers': { createGetQueryHook, errorHandler: error => { throw error } }
})
const { queryClient: defaults } = load('shared/api/query-client.ts', {
    '../utils/time-utils': { sToMs: value => value * 1000 }
})

function render(snapshot, hostUuid = uuid) {
    result = snapshot
    return EditHostDrawer({ hostUuid }).props.children
}

function setup() {
    const client = new QueryClient({ defaultOptions: defaults.getDefaultOptions() })
    const subscriptions = []
    let reads = 0
    let fail = false
    let delay = false
    let pending
    let aborted = 0
    const options = (hostUuid, enabled) => {
        render({}, hostUuid)
        return {
            ...useGetHost(request), enabled, gcTime: Infinity,
            queryFn: async ({ signal }) => {
                reads++
                if (delay) await new Promise((resolve, reject) => {
                    pending = resolve
                    signal.addEventListener('abort', () => { aborted++; reject(signal.reason) }, { once: true })
                })
                if (fail) throw new Error('Access denied')
                return { uuid: hostUuid, remark: `fresh-${reads}` }
            }
        }
    }
    const open = (hostUuid = uuid) => {
        const observer = new QueryObserver(client, options(hostUuid, false))
        const unsubscribe = observer.subscribe(() => {})
        subscriptions.push(unsubscribe)
        observer.setOptions(options(hostUuid, true))
        return { observer, close: unsubscribe, switchTo: id => observer.setOptions(options(id, true)) }
    }
    const seed = (hostUuid = uuid) => {
        client.setQueryData(options(hostUuid, false).queryKey, { uuid: hostUuid, remark: 'cached' })
    }
    return {
        client, options, open, seed, reads: () => reads, aborted: () => aborted,
        fail: value => { fail = value }, delay: value => { delay = value }, finish: () => pending?.(),
        cleanup: () => { subscriptions.forEach(unsubscribe => unsubscribe()); client.clear() }
    }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 5))

test('cached host reopens repeatedly after NiceModal initially mounts it disabled', async () => {
    const state = setup()
    try {
        state.seed()
        for (let i = 1; i <= 20; i++) {
            const card = state.open()
            await settle()
            assert.equal(state.reads(), i, 'opening a cached card must start its fresh read')
            const form = render(card.observer.getCurrentResult())
            assert.equal(form.type, 'Form')
            assert.equal(form.props.host.remark, `fresh-${i}`)
            card.close()
        }
    } finally { state.cleanup() }
})

test('a cached host waits for fresh data instead of allowing a stale edit', async () => {
    const state = setup()
    try {
        state.seed()
        state.delay(true)
        const card = state.open()
        assert.equal(state.reads(), 1)
        assert.equal(render(card.observer.getCurrentResult()).type, 'Loader')
        state.finish()
        await settle()
        assert.equal(render(card.observer.getCurrentResult()).type, 'Form')
    } finally { state.cleanup() }
})

test('closing during a request aborts it and reopening starts a new read', async () => {
    const state = setup()
    try {
        state.seed()
        state.delay(true)
        state.open().close()
        assert.equal(state.aborted(), 1)
        state.delay(false)
        const card = state.open()
        await settle()
        assert.equal(state.reads(), 2)
        assert.equal(render(card.observer.getCurrentResult()).type, 'Form')
    } finally { state.cleanup() }
})

test('switching to another cached host reads and renders that host', async () => {
    const state = setup()
    try {
        state.seed()
        state.seed(other)
        const card = state.open()
        await settle()
        card.switchTo(other)
        assert.equal(render(card.observer.getCurrentResult(), other).type, 'Loader')
        await settle()
        const form = render(card.observer.getCurrentResult(), other)
        assert.equal(form.type, 'Form')
        assert.equal(form.props.host.uuid, other)
        assert.equal(state.reads(), 2)
    } finally { state.cleanup() }
})

test('failed revalidation displays an error and retry recovers without stale form', async () => {
    const state = setup()
    try {
        state.seed()
        state.fail(true)
        const card = state.open()
        await settle()
        const error = render(card.observer.getCurrentResult())
        assert.equal(error.type, 'Stack')
        assert.equal(error.props.children[0].props.children, 'Access denied')
        state.fail(false)
        await card.observer.refetch()
        assert.equal(render(card.observer.getCurrentResult()).type, 'Form')
    } finally { state.cleanup() }
})

test('disabled clone observers and closed cards perform no background host reads', async () => {
    const state = setup()
    try {
        state.seed()
        const clone = new QueryObserver(state.client, { ...state.options(uuid, false), ...useGetHost({ route: { uuid }, rQueryParams: { enabled: false } }), queryFn: () => { throw new Error('Unexpected clone read') } })
        const unsubscribe = clone.subscribe(() => {})
        await settle()
        assert.equal(clone.getCurrentResult().data.remark, 'cached')
        assert.equal(state.reads(), 0)
        unsubscribe()
        const card = state.open()
        await settle()
        card.close()
        await settle()
        assert.equal(state.reads(), 1)
    } finally { state.cleanup() }
})
