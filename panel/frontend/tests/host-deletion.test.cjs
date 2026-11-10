const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const { QueryClient, QueryObserver, MutationObserver } = require('@tanstack/react-query')
const contract = require('../vendor/backend-contract')

const uuid = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'

function load(file, dependencies = {}) {
    const ref = { exports: {} }
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText
    new Function('require', 'module', 'exports', js)(name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), ref, ref.exports)
    return ref.exports
}

const invalidation = load('shared/api/host-invalidation.ts')
const { createUrl } = load('shared/api/helpers/create-url.ts')
const { hostsQueryKeys } = load('shared/api/hooks/hosts/hosts.query.hooks.ts', {
    '@remnawave/backend-contract': contract,
    '@shared/utils/time-utils': { sToMs: value => value * 1000 },
    '../../tsq-helpers': { createGetQueryHook: value => value }
})

function setup(method = 'delete', fail = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
    const reads = { missing: 0, other: 0, list: 0, assignment: 0 }
    const subscriptions = []
    let removed = false
    let success = 0
    let errors = 0
    let closed = 0
    let network = 0
    const observe = (key, queryFn) => {
        client.setQueryData(key, { uuid })
        const observer = new QueryObserver(client, { queryKey: key, staleTime: Infinity, queryFn })
        subscriptions.push(observer.subscribe(() => {}))
        return observer
    }
    observe(hostsQueryKeys.getHost({ uuid }).queryKey, async () => {
        if (removed) { reads.missing++; throw new Error('Host not found [A046]') }
        return { uuid }
    })
    observe(['host-template-assignments', uuid], async () => {
        if (removed) { reads.missing++; throw new Error('Host not found [A046]') }
        reads.assignment++
        return { templates: [] }
    })
    observe(hostsQueryKeys.getHost({ uuid: other }).queryKey, async () => { reads.other++; return { uuid: other } })
    observe(hostsQueryKeys.getAllHosts.queryKey, async () => { reads.list++; return { hosts: removed ? [{ uuid: other }] : [{ uuid }, { uuid: other }] } })
    const factory = load('shared/api/tsq-helpers/create-mutation-hook.ts', {
        '@tanstack/react-query': { useQueryClient: () => client, useMutation: options => new MutationObserver(client, options) },
        '../axios': { instance: { request: async options => {
            network++
            assert.equal(options.url, contract.DeleteHostCommand.TSQ_url.replace(':uuid', uuid))
            if (fail) throw new Error('Permission denied')
            removed = method === 'delete'
            return { data: {} }
        } } },
        '../helpers': { createUrl, handleRequestError: error => { throw error } },
        '../limit-invalidation': { affectsLimits: () => false },
        '../host-invalidation': invalidation
    })
    const mutation = factory.createMutationHook({
        endpoint: contract.DeleteHostCommand.TSQ_url,
        requestMethod: method,
        rMutationParams: { onSuccess: () => success++, onError: () => errors++ }
    })({ mutationFns: { onSuccess: () => { closed++; subscriptions.forEach(unsubscribe => unsubscribe()) } } })
    return { client, reads, mutation, counts: () => ({ network, success, errors, closed }), cleanup: () => { subscriptions.forEach(unsubscribe => unsubscribe()); client.clear() } }
}

test('successful host DELETE never refetches its open card or assignment inspector', async () => {
    const state = setup()
    try {
        await state.mutation.mutate({ route: { uuid } })
        assert.deepEqual(state.counts(), { network: 1, success: 1, errors: 0, closed: 1 })
        assert.deepEqual(state.reads, { missing: 0, other: 1, list: 1, assignment: 0 })
        assert.equal(state.client.getQueryState(hostsQueryKeys.getHost({ uuid }).queryKey), undefined)
        assert.equal(state.client.getQueryState(['host-template-assignments', uuid]), undefined)
        assert.deepEqual(state.client.getQueryData(hostsQueryKeys.getAllHosts.queryKey), { hosts: [{ uuid: other }] })
        assert.deepEqual(state.client.getQueryData(hostsQueryKeys.getHost({ uuid: other }).queryKey), { uuid: other })
    } finally { state.cleanup() }
})

test('failed DELETE retains the card and cache and reports the real error', async () => {
    const state = setup('delete', true)
    try {
        await assert.rejects(state.mutation.mutate({ route: { uuid } }), /Permission denied/)
        assert.deepEqual(state.counts(), { network: 1, success: 0, errors: 1, closed: 0 })
        assert.deepEqual(state.reads, { missing: 0, other: 0, list: 0, assignment: 0 })
        assert.deepEqual(state.client.getQueryData(hostsQueryKeys.getHost({ uuid }).queryKey), { uuid })
    } finally { state.cleanup() }
})

test('PATCH still refreshes the saved host and assignment inspector', async () => {
    const state = setup('patch')
    try {
        await state.mutation.mutate({ route: { uuid } })
        assert.equal(state.reads.assignment, 1)
        assert.equal(state.reads.missing, 0)
        assert.deepEqual(state.client.getQueryData(hostsQueryKeys.getHost({ uuid }).queryKey), { uuid })
    } finally { state.cleanup() }
})

test('late reads of a deleted host are aborted and cannot restore its cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    let aborted = 0
    let finish
    const observer = new QueryObserver(client, {
        queryKey: ['host-template-assignments', uuid],
        queryFn: ({ signal }) => new Promise(resolve => { finish = resolve; signal.addEventListener('abort', () => aborted++) })
    })
    const unsubscribe = observer.subscribe(() => {})
    try {
        await invalidation.invalidateHosts(client, uuid)
        assert.equal(aborted, 1)
        finish({ templates: [{ name: 'Stale response' }] })
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(client.getQueryState(['host-template-assignments', uuid]), undefined)
    } finally { unsubscribe(); client.clear() }
})
