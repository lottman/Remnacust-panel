const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const { randomUUID } = require('node:crypto')
const { QueryClient, QueryObserver } = require('@tanstack/react-query')
const { CanceledError } = require('axios')

const directory = path.join(__dirname, '../src/widgets/dashboard/subscription-settings/settings')
const tick = () => new Promise(resolve => setImmediate(resolve))
function load(file, mocks) {
    if (file === 'subscription-domains.widget.tsx') {
        mocks = { ...mocks, '@shared/ui/overlays/retained-overlays': { RetainedModal: 'Modal' }, '@shared/api/hooks/subscription-domains': load(
            '../../../../shared/api/hooks/subscription-domains.ts',
            { '@shared/api/axios': mocks['@shared/api/axios'] }
        ) }
    }
    const ref = { exports: {} }
    const code = ts.transpileModule(fs.readFileSync(path.join(directory, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
    }).outputText
    new Function('require', 'module', 'exports', code)(
        name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports
    )
    return ref.exports
}
function factory(post) {
    return load('subscription-domain-credentials.ts', { '@shared/api/axios': { instance: { post } } }).cdnCredentialsQuery
}
const session = () => ({ uuid: '22222222-2222-4222-8222-222222222222', requestId: randomUUID() })
const answer = value => ({ data: { response: { requestHeaderName: 'X-fixture', requestHeaderValue: value } } })

test('every private HTTP read has a new cache buster and keeps cancellation, timeout and no-store headers', async () => {
    const calls = []
    const options = factory(async (...args) => { calls.push(args); return answer('current') })(session())
    const controller = new AbortController()
    assert.equal(options.gcTime, 0)
    assert.equal(options.staleTime, 0)
    assert.equal(options.refetchOnMount, 'always')
    assert.equal(options.retry, false)
    const first = await options.queryFn({ signal: controller.signal })
    assert.deepEqual(await options.queryFn({ signal: controller.signal }), first)
    assert.notEqual(calls[0][2].params._request, calls[1][2].params._request)
    for (const [url, body, config] of calls) {
        assert.equal(url, '/api/subscription-domains/22222222-2222-4222-8222-222222222222/credentials')
        assert.equal(body, undefined)
        assert.equal(config.signal, controller.signal)
        assert.equal(config.timeout, 15000)
        assert.equal(config.headers['Cache-Control'], 'no-store')
        assert.equal(config.headers.Pragma, 'no-cache')
        assert.match(config.params._request, /^[a-f0-9-]{36}$/)
    }
})

test('a closed view is disabled and cannot accidentally request credentials', async () => {
    let calls = 0
    const options = factory(async () => { calls++; return answer('unused') })(null)
    assert.equal(options.enabled, false)
    await assert.rejects(options.queryFn({ signal: new AbortController().signal }), /view is closed/)
    assert.equal(calls, 0)
})

test('a rapid reopen never displays the earlier result even before zero-time garbage collection', async () => {
    let finish
    const query = factory(() => new Promise(resolve => { finish = resolve }))
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    const old = query(session())
    client.setQueryData(old.queryKey, { requestHeaderName: 'X-old', requestHeaderValue: 'old' })
    client.setQueryData(['subscription-domains'], ['retained catalog'])
    const options = query(session())
    const observer = new QueryObserver(client, options)
    const unsubscribe = observer.subscribe(() => {})
    try {
        assert.notDeepEqual(options.queryKey, old.queryKey)
        assert.equal(observer.getCurrentResult().data, undefined)
        finish(answer('new'))
        await tick()
        assert.equal(observer.getCurrentResult().data.requestHeaderValue, 'new')
        client.removeQueries({ queryKey: options.queryKey, exact: true })
        assert.equal(client.getQueryData(options.queryKey), undefined)
        assert.deepEqual(client.getQueryData(['subscription-domains']), ['retained catalog'])
    } finally { unsubscribe(); client.clear() }
})

test('closing cancels an in-flight HTTP read and a late result cannot restore its cache entry', async () => {
    let signal, finish
    const options = factory((_url, _body, config) => {
        signal = config.signal
        return new Promise(resolve => { finish = resolve })
    })(session())
    const client = new QueryClient()
    const observer = new QueryObserver(client, options)
    const unsubscribe = observer.subscribe(() => {})
    try {
        assert.equal(signal.aborted, false)
        client.removeQueries({ queryKey: options.queryKey, exact: true })
        assert.equal(signal.aborted, true)
        finish(answer('late'))
        await tick()
        assert.equal(client.getQueryCache().find({ queryKey: options.queryKey, exact: true }), undefined)
    } finally { unsubscribe(); client.clear() }
})

test('unmount cancels pending reads and zero-time GC removes successful or cancelled private queries', async () => {
    for (const pending of [false, true]) {
        let signal
        const options = factory((_url, _body, config) => {
            signal = config.signal
            if (!pending) return Promise.resolve(answer('visible'))
            return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new CanceledError()), { once: true }))
        })(session())
        const client = new QueryClient()
        const observer = new QueryObserver(client, options)
        const unsubscribe = observer.subscribe(() => {})
        try {
            await tick()
            unsubscribe()
            await new Promise(resolve => setTimeout(resolve, 5))
            if (pending) assert.equal(signal.aborted, true)
            assert.equal(client.getQueryCache().find({ queryKey: options.queryKey, exact: true }), undefined)
        } finally { unsubscribe(); client.clear() }
    }
})

test('the actual domain widget creates a fresh session on each opening and removes only its private query on close', () => {
    const states = [], removed = []
    let cursor = 0, options
    const controls = Object.fromEntries(['ActionIcon','Alert','Badge','Button','CopyButton','Group','Modal','Select','Stack','Switch','Text','TextInput','Tooltip','Loader'].map(name => [name, name]))
    controls.Table = Object.assign(() => {}, Object.fromEntries(['ScrollContainer','Thead','Tr','Th','Tbody','Td'].map(name => [name, name])))
    controls.Accordion = Object.assign(() => {}, { Item: 'Item', Control: 'Control', Panel: 'Panel' })
    const primary = { uuid: 'primary', domain: 'origin.example.test', kind: 'PRIMARY', accessMode: 'OPEN', isDefault: true }
    const cdn = { ...session(), domain: 'cdn.example.test', kind: 'CDN', parentUuid: primary.uuid, accessMode: 'OPEN', publicBaseUrl: 'https://cdn.example.test' }
    const query = factory(async () => answer('unused'))
    const mocks = {
        '@mantine/core': controls,
        '@mantine/form': { useForm: ({ initialValues }) => ({ values: initialValues, getInputProps: () => ({}), onSubmit: fn => fn }) },
        '@remnawave/backend-contract': { MAX_CDN_PER_PRIMARY: 3 },
        '@tanstack/react-query': {
            useQueryClient: () => ({ removeQueries: value => removed.push(value) }),
            useMutation: () => ({}),
            useQuery: value => value.queryKey[0] === 'subscription-domains'
                ? { data: { response: [primary, cdn] } }
                : (options = value, { isPending: true })
        },
        react: { useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value }] } },
        'react-i18next': { useTranslation: () => ({ t: value => value }) },
        'react-icons/tb': new Proxy({}, { get: (_object, name) => name }),
        '@shared/api/axios': {},
        '@shared/ui/section-card': { SectionCard: 'SectionCard' },
        '@shared/ui/settings-card': { SettingsCardShared: 'SettingsCardShared' },
        './subscription-domain-credentials': { cdnCredentialsQuery: query },
        './subscription-domain-link': { cdnSubscriptionLink: () => null }
    }
    const { SubscriptionDomainsWidget } = load('subscription-domains.widget.tsx', mocks)
    const elements = value => Array.isArray(value) ? value.flatMap(elements) : value && typeof value === 'object' ? [value, ...elements(value.props?.children)] : []
    const render = () => { cursor = 0; return elements(SubscriptionDomainsWidget()) }
    const open = () => render().find(value => value.type === 'Button' && value.props.children === 'subscription-domains.setup').props.onClick()
    open()
    const firstRender = render()
    const first = options.queryKey
    firstRender.find(value => value.type === 'Modal' && value.props.title === 'subscription-domains.cdn-setup').props.onClose()
    assert.deepEqual(removed, [{ queryKey: first, exact: true }])
    assert.equal(render().some(value => value.type === 'TextInput' && value.props.label === 'subscription-domains.request-header-value'), false)
    open()
    render()
    assert.notDeepEqual(options.queryKey, first)
    assert.equal(options.queryKey[1], cdn.uuid)
})
