const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const { QueryClient, QueryObserver } = require('@tanstack/react-query')
const { CanceledError, isCancel } = require('axios')
const { z } = require('zod')

function load(transport, notify) {
    const exports = {}
    let options
    const file = path.join(__dirname, '../src/shared/api/tsq-helpers/create-get-query.hook.ts')
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: name => {
        if (name === '@tanstack/react-query') return { useQuery: value => { options = value } }
        if (name === 'axios') return { isCancel }
        if (name === '../axios') return { instance: { get: transport } }
        if (name === '../helpers') return { createUrl: value => value, handleRequestError: error => { throw error } }
        return {}
    } })
    exports.createGetQueryHook({ endpoint: '/nodes/', responseSchema: z.object({ response: z.array(z.number()) }), getQueryKey: () => ['nodes'], errorHandler: notify })()
    return options
}

test('manual refetch cancels the slow poll at the HTTP boundary and keeps the newer result', async () => {
    let requests = 0
    let aborted = 0
    let notices = 0
    const options = load((_url, { signal }) => {
        requests++
        if (requests === 2) return Promise.resolve({ data: { response: [9] } })
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted++; reject(new CanceledError()) }, { once: true }))
    }, () => { notices++ })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    client.setQueryData(options.queryKey, [1])
    const observer = new QueryObserver(client, { ...options, staleTime: 0 })
    const unsubscribe = observer.subscribe(() => {})
    try {
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(requests, 1)
        await observer.refetch({ cancelRefetch: true })
        assert.equal(requests, 2)
        assert.equal(aborted, 1)
        assert.equal(notices, 0)
        assert.equal(observer.getCurrentResult().data[0], 9)
    } finally { unsubscribe(); client.clear() }
})

test('real failures still reject and report an error', async () => {
    const failure = new Error('local HTTP failure')
    let notices = 0
    const options = load(() => Promise.reject(failure), () => { notices++ })
    await assert.rejects(options.queryFn({ signal: new AbortController().signal }), error => error === failure)
    assert.equal(notices, 1)
})
