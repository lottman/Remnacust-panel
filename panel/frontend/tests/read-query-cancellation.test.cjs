const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const { QueryClient, QueryObserver, InfiniteQueryObserver } = require('@tanstack/react-query')
const { CanceledError, isCancel } = require('axios')
const { z } = require('zod')

const page = (value, nextCursor = null) => ({ items: [value], nextCursor })

function load(kind, transport, notify) {
    const exports = {}
    let options
    const file = kind === 'body' ? 'create-body-query.hook.ts' : 'create-get-infinite-query.hook.ts'
    const hook = kind === 'body' ? 'createBodyQueryHook' : 'createGetInfiniteQueryHook'
    const source = fs.readFileSync(path.join(__dirname, '../src/shared/api/tsq-helpers', file), 'utf8')
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
        exports,
        require: name => {
            if (name === '@tanstack/react-query') return {
                useQuery: value => { options = value },
                useInfiniteQuery: value => { options = value }
            }
            if (name === 'axios') return { isCancel }
            if (name === '../axios') return { instance: {
                get: (url, config) => transport({ url, ...config }),
                request: transport
            } }
            if (name === '../helpers') return {
                createUrl: (url, query) => `${url}?${new URLSearchParams(query)}`,
                handleRequestError: error => { throw error }
            }
            return {}
        }
    })
    exports[hook]({
        endpoint: '/statistics',
        requestMethod: 'POST',
        bodySchema: z.object({ nodes: z.array(z.string()) }),
        requestQuerySchema: z.object({ filter: z.string(), cursor: z.string().optional() }),
        queryParams: { filter: 'default' },
        responseSchema: z.object({ response: z.object({ items: z.array(z.number()), nextCursor: z.string().nullable() }) }),
        getQueryKey: () => ['statistics', kind],
        initialPageParam: null,
        pageParamKey: 'cursor',
        getNextPageParam: lastPage => lastPage.nextCursor,
        errorHandler: notify
    })({ body: { nodes: ['node-a'] }, query: { filter: 'selected' } })
    return options
}

for (const kind of ['body', 'infinite']) {
    test(`${kind}: leaving the screen aborts its pending HTTP request without an error notice`, async () => {
        let aborted = 0
        let notices = 0
        const options = load(kind, ({ signal }) => new Promise((_resolve, reject) => {
            assert.ok(signal)
            signal.addEventListener('abort', () => { aborted++; reject(new CanceledError()) }, { once: true })
        }), () => { notices++ })
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
        const Observer = kind === 'body' ? QueryObserver : InfiniteQueryObserver
        const observer = new Observer(client, options)
        const unsubscribe = observer.subscribe(() => {})
        try {
            await new Promise(resolve => setImmediate(resolve))
            unsubscribe()
            await new Promise(resolve => setImmediate(resolve))
            assert.equal(aborted, 1)
            assert.equal(notices, 0)
        } finally { unsubscribe(); client.clear() }
    })

    test(`${kind}: replacing a slow poll cancels the old request and preserves filters and pagination`, async () => {
        let requests = 0
        let aborted = 0
        let notices = 0
        const seen = []
        const options = load(kind, config => {
            requests++
            seen.push(config)
            if (requests > 1) return Promise.resolve({ data: { response: page(requests, requests === 2 ? 'next' : null) } })
            return new Promise((_resolve, reject) => config.signal.addEventListener('abort', () => {
                aborted++
                reject(new CanceledError())
            }, { once: true }))
        }, () => { notices++ })
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
        client.setQueryData(options.queryKey, kind === 'body' ? page(1) : { pages: [page(1)], pageParams: [null] })
        const Observer = kind === 'body' ? QueryObserver : InfiniteQueryObserver
        const observer = new Observer(client, { ...options, staleTime: 0 })
        const unsubscribe = observer.subscribe(() => {})
        try {
            await new Promise(resolve => setImmediate(resolve))
            assert.equal(requests, 1)
            await observer.refetch({ cancelRefetch: true })
            assert.equal(aborted, 1)
            assert.equal(requests, 2)
            assert.equal(notices, 0)
            for (const config of seen) assert.equal(new URL(config.url, 'http://localhost').searchParams.get('filter'), 'selected')
            if (kind === 'body') {
                assert.equal(observer.getCurrentResult().data.items[0], 2)
                assert.deepEqual(JSON.parse(JSON.stringify(seen[1].data)), { nodes: ['node-a'] })
            } else {
                await observer.fetchNextPage()
                assert.equal(new URL(seen[2].url, 'http://localhost').searchParams.get('cursor'), 'next')
                assert.deepEqual(observer.getCurrentResult().data.pages.flatMap(value => value.items), [2, 3])
            }
        } finally { unsubscribe(); client.clear() }
    })

    test(`${kind}: genuine HTTP and schema failures still reject and report once`, async () => {
        for (const invalidSchema of [false, true]) {
            const failure = new Error('local HTTP failure')
            let notices = 0
            const options = load(kind, () => invalidSchema
                ? Promise.resolve({ data: { response: { items: ['invalid'], nextCursor: null } } })
                : Promise.reject(failure), () => { notices++ })
            await assert.rejects(options.queryFn({ signal: new AbortController().signal, pageParam: null }), error => invalidSchema ? error instanceof z.ZodError : error === failure)
            assert.equal(notices, 1)
        }
    })
}
