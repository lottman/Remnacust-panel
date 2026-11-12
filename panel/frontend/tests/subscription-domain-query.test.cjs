const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { QueryClient, QueryObserver } = require('@tanstack/react-query')
const load = require('../../backend/tests/load-typescript.cjs')

const primary = { uuid: '11111111-1111-4111-8111-111111111111', name: 'Fixture', domain: 'origin.example.test', kind: 'PRIMARY', isDefault: true }
function fixture(get) {
    return load(path.join(__dirname, '../src/shared/api/hooks/subscription-domains.ts'), {
        '@shared/api/axios': { instance: { get } }
    })
}

for (const first of ['settings', 'user']) {
    test(`${first} first: a shared cache preserves list and settings shapes before and after invalidation`, async () => {
        let rows = [primary], requests = 0
        const queries = fixture(async (url, { signal }) => {
            assert.equal(url, '/api/subscription-domains')
            assert(signal instanceof AbortSignal)
            requests++
            return { data: { response: structuredClone(rows), environment: 'synced' } }
        })
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const options = { settings: queries.subscriptionDomainsQuery(), user: queries.subscriptionDomainItemsQuery() }
        const observers = [], subscriptions = []
        try {
            await client.fetchQuery(options[first])
            for (const name of [first, first === 'settings' ? 'user' : 'settings']) {
                const observer = new QueryObserver(client, options[name])
                observers.push([name, observer])
                subscriptions.push(observer.subscribe(() => {}))
            }
            assert.equal(requests, 1)
            const check = expected => {
                for (const [name, observer] of observers) {
                    const data = observer.getCurrentResult().data
                    if (name === 'user') assert.deepEqual(data.map(row => row.domain), expected)
                    else {
                        assert.equal(data.environment, 'synced')
                        assert.deepEqual(data.response.map(row => row.domain), expected)
                    }
                }
                assert(Array.isArray(client.getQueryData(queries.subscriptionDomainsKey).response))
            }
            check(['origin.example.test'])
            rows = [{ ...primary, domain: 'new.example.test' }]
            await client.invalidateQueries({ queryKey: ['subscription-domains'] })
            check(['new.example.test'])
            assert.equal(requests, 2)
        } finally {
            subscriptions.forEach(unsubscribe => unsubscribe())
            client.clear()
        }
    })
}

test('the canonical list read propagates cancellation instead of populating stale domain data', async () => {
    let signal
    const queries = fixture((_url, options) => {
        signal = options.signal
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true }))
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    try {
        const pending = client.fetchQuery(queries.subscriptionDomainsQuery())
        const rejected = assert.rejects(pending)
        await client.cancelQueries({ queryKey: queries.subscriptionDomainsKey })
        await rejected
        assert.equal(signal.aborted, true)
        assert.equal(client.getQueryData(queries.subscriptionDomainsKey), undefined)
    } finally { client.clear() }
})
