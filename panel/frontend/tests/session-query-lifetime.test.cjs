const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const { createRequire } = require('node:module')
const path = require('node:path')
const test = require('node:test')
const query = require('@tanstack/react-query')
const react = require('react')
const ts = require('typescript')
const { z } = require('zod')

const root = path.resolve(__dirname, '..')
const translate = { t: (key) => key }
const responseSchema = z.object({ response: z.array(z.object({ label: z.string() })) })

query.environmentManager.setIsServer(() => false)

function load(relative, mocks = {}, globals = {}) {
    const filename = path.join(root, relative)
    const localRequire = createRequire(filename)
    const ref = { exports: {} }
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true
        }
    }).outputText
    new Function('require', 'module', 'exports', ...Object.keys(globals), compiled)(
        (name) => (Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name)),
        ref,
        ref.exports,
        ...Object.values(globals)
    )
    return ref.exports
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(check, label) {
    const deadline = Date.now() + 5_000
    while (!check()) {
        if (Date.now() > deadline) throw new Error(`Timed out: ${label}`)
        await delay(5)
    }
}

function deferred() {
    let resolve
    const promise = new Promise((done) => { resolve = done })
    return { promise, resolve }
}

async function fixture(t, schema = responseSchema) {
    query.focusManager.setFocused(true)
    query.onlineManager.setOnline(true)
    let route = (_request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ response: [{ label: 'session-A' }] }))
    }
    const calls = []
    const server = http.createServer((request, response) => {
        calls.push({ url: request.url, authorization: request.headers.authorization })
        route(request, response)
    })
    server.listen(0, '127.0.0.1')
    await new Promise((resolve, reject) => {
        server.once('listening', resolve)
        server.once('error', reject)
    })
    const origin = `http://127.0.0.1:${server.address().port}`
    const listeners = new Set()
    let logouts = 0
    const logoutEvents = {
        emit() {
            logouts++
            for (const listener of listeners) listener()
        },
        subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        }
    }
    const contract = require('@remnawave/backend-contract')
    const apiResponse = load('src/shared/api/api-response.ts', { i18next: translate })
    const maintenance = load('src/shared/utils/panel-maintenance.ts')
    const api = load('src/shared/api/axios.ts', {
        '@remnawave/backend-contract': contract,
        '../emitters/emit-logout': { logoutEvents },
        '../utils/panel-maintenance': maintenance,
        './api-response': apiResponse,
        'consola/browser': { log() {} }
    }, {
        __DOMAIN_BACKEND__: origin,
        __NODE_ENV__: 'development',
        __DOMAIN_OVERRIDE__: '0',
        window: { location: { origin }, dispatchEvent() {} }
    })
    const clientModule = load('src/shared/api/query-client.ts', {
        '../utils/time-utils': load('src/shared/utils/time-utils/s-to-ms/s-to-ms.util.ts')
    })
    const { queryClient: client } = clientModule
    const errors = load('src/shared/api/helpers/handler-request-error.ts', {
        '@remnawave/backend-contract': contract,
        i18next: translate,
        'consola/browser': { consola: { log() {} } }
    })
    const { createUrl } = load('src/shared/api/helpers/create-url.ts')
    const notices = []
    let options
    const { createGetQueryHook } = load('src/shared/api/tsq-helpers/create-get-query.hook.ts', {
        '@tanstack/react-query': { ...query, useQuery(value) { options = value } },
        '../axios': api,
        '../helpers': { createUrl, ...errors }
    })
    createGetQueryHook({
        endpoint: '/fixture',
        responseSchema: schema,
        getQueryKey: () => ['session-lifetime'],
        rQueryParams: { refetchOnMount: 'always', staleTime: 0 },
        errorHandler: (error) => { notices.push(error) }
    })()
    const queries = new Set()
    const stopTracking = client.getQueryCache().subscribe((event) => {
        if (event.query) queries.add(event.query)
    })
    const cleanups = []
    client.mount()
    t.after(async () => {
        for (const cleanup of cleanups) cleanup()
        client.unmount()
        client.clear()
        await new Promise((resolve) => setImmediate(resolve))
        for (const cachedQuery of queries) cachedQuery.destroy()
        stopTracking()
        server.closeAllConnections()
        await new Promise((resolve) => server.close(resolve))
        query.focusManager.setFocused(true)
        query.onlineManager.setOnline(true)
    })

    return {
        api, client, notices, options, calls,
        get logouts() { return logouts },
        route(fn) { route = fn },
        reply(label = 'updated', status = 200) {
            route = (_request, response) => {
                response.writeHead(status, { 'content-type': 'application/json' })
                response.end(JSON.stringify(status >= 400
                    ? { message: 'synthetic failure' }
                    : { response: [{ label }] }))
            }
        },
        observe(extra = {}) {
            const observer = new query.QueryObserver(client, { ...options, ...extra })
            cleanups.push(observer.subscribe(() => {}))
            return observer
        },
        mountAuth() {
            const states = []
            const effects = []
            let stateIndex = 0
            let resets = 0
            const { AuthProvider } = load('src/shared/hocs/auth-provider/auth-provider.tsx', {
                react: {
                    ...react,
                    useState(initial) {
                        const index = stateIndex++
                        states[index] = initial
                        return [initial, (value) => { states[index] = value }]
                    },
                    useEffect(fn) { effects.push(fn) },
                    useMemo(fn) { return fn() }
                },
                '@shared/api/query-client': clientModule,
                '@shared/emitters': { logoutEvents },
                '@shared/hocs/store-wrapper': { resetAllStores() { resets++ } },
                '@entities/auth': {
                    useToken: api.getAuthorizationToken,
                    removeToken() { api.setAuthorizationToken('') }
                },
                'consola/browser': { error() {} }
            })
            const provider = AuthProvider({ children: null })
            for (const effect of effects) {
                const cleanup = effect()
                if (typeof cleanup === 'function') cleanups.push(cleanup)
            }
            let loginOptions
            load('src/shared/api/hooks/auth/auth.hooks.ts', {
                '@mantine/notifications': { notifications: { show() {} } },
                i18next: translate,
                '@shared/utils/translate-mutation-message': {
                    translateMutationMessage: (value) => value
                },
                '@entities/auth/session-store': {
                    setToken({ token }) { api.setAuthorizationToken(token) }
                },
                '../../tsq-helpers': {
                    createMutationHook(value) {
                        if (value.endpoint === contract.LoginCommand.TSQ_url) loginOptions = value
                        return value
                    }
                }
            })
            assert.ok(loginOptions)
            return {
                get authenticated() { return states[0] },
                get resets() { return resets },
                login(token) {
                    loginOptions.rMutationParams.onSuccess({ accessToken: token })
                    provider.props.value.setIsAuthenticated(true)
                }
            }
        },
        initWatchdog() {
            load('src/shared/api/connection-watchdog.ts', { './axios': api }).initConnectionWatchdog()
        },
        observeProbe() {
            let probeOptions
            const { useConnectionProbe } = load('src/shared/ui/connection-status-overlay/use-connection-probe.ts', {
                '@remnawave/backend-contract': contract,
                '@shared/api': api,
                '@tanstack/react-query': {
                    ...query,
                    useQuery(value) { probeOptions = value }
                },
                react: { useSyncExternalStore(_subscribe, snapshot) { return snapshot() } }
            })
            useConnectionProbe()
            assert.equal(probeOptions.enabled, true)
            assert.equal(probeOptions.networkMode, 'always')
            const observer = new query.QueryObserver(client, probeOptions)
            cleanups.push(observer.subscribe(() => {}))
            return observer
        }
    }
}

test('hidden active query retains data beyond a compressed GC horizon and resumes polling', async (t) => {
    const f = await fixture(t)
    const observer = f.observe({ gcTime: 50, refetchInterval: 25 })
    await until(() => observer.getCurrentResult().isSuccess, 'initial data')
    query.focusManager.setFocused(false)
    const count = f.calls.length
    const snapshot = observer.getCurrentResult().data
    await delay(160)
    assert.equal(f.calls.length, count)
    assert.equal(observer.getCurrentResult().data, snapshot)
    assert.equal(f.client.getQueryCache().getAll().length, 1)
    f.reply('resumed')
    query.focusManager.setFocused(true)
    await until(() => observer.getCurrentResult().data?.[0]?.label === 'resumed', 'visible polling')
    assert.equal(f.logouts, 0)
})

test('background failure retains last-good data and reconnect refreshes without logout', async (t) => {
    const f = await fixture(t)
    const observer = f.observe()
    await until(() => observer.getCurrentResult().isSuccess, 'initial data')
    const snapshot = observer.getCurrentResult().data
    f.reply('', 500)
    await observer.refetch()
    assert.equal(observer.getCurrentResult().isError, true)
    assert.equal(observer.getCurrentResult().data, snapshot)
    query.onlineManager.setOnline(false)
    f.reply('after-reconnect')
    query.onlineManager.setOnline(true)
    await until(() => observer.getCurrentResult().data?.[0]?.label === 'after-reconnect', 'reconnect')
    assert.equal(observer.getCurrentResult().isError, false)
    assert.equal(f.logouts, 0)
})

test('a query paused offline resumes on reconnect even while hidden', async (t) => {
    const f = await fixture(t)
    query.focusManager.setFocused(false)
    query.onlineManager.setOnline(false)
    const observer = f.observe()
    assert.equal(observer.getCurrentResult().fetchStatus, 'paused')
    assert.equal(f.calls.length, 0)
    query.onlineManager.setOnline(true)
    await until(() => observer.getCurrentResult().isSuccess, 'offline query resumed')
    assert.equal(f.calls.length, 1)
})

test('canceled refetch ignores a late 401 and cannot overwrite its replacement', async (t) => {
    const f = await fixture(t)
    f.api.setAuthorizationToken('synthetic-A')
    const auth = f.mountAuth()
    const observer = f.observe()
    await until(() => observer.getCurrentResult().isSuccess, 'initial data')
    const held = deferred()
    f.route((_request, response) => held.resolve(response))
    const pending = observer.refetch()
    const response = await held.promise
    f.reply('replacement')
    await observer.refetch({ cancelRefetch: true })
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end('{"message":"synthetic expired"}')
    await pending
    assert.equal(observer.getCurrentResult().data[0].label, 'replacement')
    assert.equal(f.notices.length, 0)
    assert.equal(f.logouts, 0)
    assert.equal(auth.authenticated, true)
})

test('old-token 401 does not terminate the new session or clear its cache', async (t) => {
    const f = await fixture(t)
    f.api.setAuthorizationToken('synthetic-A')
    const auth = f.mountAuth()
    const held = deferred()
    f.route((_request, response) => held.resolve(response))
    const pending = f.api.instance.get('/fixture').catch((error) => error)
    const response = await held.promise
    auth.login('synthetic-B')
    const snapshot = [{ label: 'session-B' }]
    f.client.setQueryData(f.options.queryKey, snapshot)
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end('{"message":"synthetic expired"}')
    const error = await pending
    assert.equal(error.response.status, 401)
    assert.equal(f.calls[0].authorization, 'Bearer synthetic-A')
    assert.equal(f.api.getAuthorizationToken(), 'synthetic-B')
    assert.equal(auth.authenticated, true)
    assert.equal(f.client.getQueryData(f.options.queryKey), snapshot)
    assert.equal(f.logouts, 0)
})

test('current-token 401 clears session data; relogin plus 403 cannot reuse the previous user data', async (t) => {
    const f = await fixture(t)
    f.api.setAuthorizationToken('synthetic-A')
    const auth = f.mountAuth()
    const observer = f.observe()
    await until(() => observer.getCurrentResult().isSuccess, 'session A data')
    f.reply('', 401)
    const before = f.calls.length
    await observer.refetch()
    assert.equal(f.calls.length, before + 1)
    assert.equal(f.logouts, 1)
    assert.equal(auth.authenticated, false)
    assert.equal(auth.resets, 1)
    assert.equal(f.api.getAuthorizationToken(), '')
    assert.equal(f.client.getQueryData(f.options.queryKey), undefined)
    auth.login('synthetic-B')
    f.reply('', 403)
    const next = f.observe()
    await until(() => next.getCurrentResult().isError, 'session B forbidden')
    assert.equal(f.calls.at(-1).authorization, 'Bearer synthetic-B')
    assert.equal(next.getCurrentResult().data, undefined)
    assert.equal(f.client.getQueryData(f.options.queryKey), undefined)
    assert.equal(f.logouts, 1)
    assert.equal(auth.authenticated, true)
})

test('logout cancels in-flight Axios and its late response cannot seed a relogged-in session', async (t) => {
    const f = await fixture(t)
    f.api.setAuthorizationToken('synthetic-A')
    const auth = f.mountAuth()
    const observer = f.observe()
    await until(() => observer.getCurrentResult().isSuccess, 'session A data')
    const held = deferred()
    let aborted = false
    f.route((request, response) => {
        if (request.url === '/expire') {
            response.writeHead(401, { 'content-type': 'application/json' })
            response.end('{"message":"synthetic expired"}')
        } else {
            response.once('close', () => { aborted = !response.writableEnded })
            held.resolve(response)
        }
    })
    const pending = observer.refetch()
    const late = await held.promise
    await assert.rejects(f.api.instance.get('/expire'), (error) => error.response?.status === 401)
    await until(() => aborted, 'old Axios request aborted')
    assert.equal(f.client.getQueryData(f.options.queryKey), undefined)
    auth.login('synthetic-B')
    f.reply('session-B')
    const next = f.observe()
    await until(() => next.getCurrentResult().isSuccess, 'session B data')
    late.writeHead(200, { 'content-type': 'application/json' })
    late.end('{"response":[{"label":"late-session-A"}]}')
    await pending
    assert.equal(f.client.getQueryData(f.options.queryKey)[0].label, 'session-B')
    assert.equal(next.getCurrentResult().data[0].label, 'session-B')
    assert.equal(f.notices.length, 0)
    assert.equal(f.logouts, 1)
    assert.equal(auth.authenticated, true)
})

test('logout fences late query resolution even after Axios has completed and validation is still pending', async (t) => {
    const validating = deferred()
    const release = deferred()
    const finished = deferred()
    t.after(() => release.resolve())
    const schema = responseSchema.superRefine(async (value) => {
        if (value.response[0]?.label === 'late-session-A') {
            validating.resolve()
            await release.promise
            finished.resolve()
        }
    })
    const f = await fixture(t, schema)
    f.api.setAuthorizationToken('synthetic-A')
    const auth = f.mountAuth()
    const observer = f.observe()
    await until(() => observer.getCurrentResult().isSuccess, 'session A data')
    f.reply('late-session-A')
    const pending = observer.refetch()
    await validating.promise
    f.reply('', 401)
    await assert.rejects(f.api.instance.get('/expire'), (error) => error.response?.status === 401)
    assert.equal(f.client.getQueryData(f.options.queryKey), undefined)
    auth.login('synthetic-B')
    f.reply('session-B')
    const next = f.observe()
    await until(() => next.getCurrentResult().isSuccess, 'session B data')
    release.resolve()
    await finished.promise
    await pending
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(f.client.getQueryData(f.options.queryKey)[0].label, 'session-B')
    assert.equal(next.getCurrentResult().data[0].label, 'session-B')
    assert.equal(f.notices.length, 0)
    assert.equal(f.logouts, 1)
    assert.equal(auth.authenticated, true)
})

test('three Axios timeouts enter offline and a successful probe resumes queries without logout', async (t) => {
    const f = await fixture(t)
    f.api.setAuthorizationToken('synthetic-A')
    const auth = f.mountAuth()
    f.initWatchdog()
    f.route(() => {})
    await assert.rejects(f.api.instance.get('/fixture', { timeout: 20 }), (error) => error.code === 'ECONNABORTED')
    assert.equal(f.calls.length, 3)
    assert.equal(query.onlineManager.isOnline(), false)
    const observer = f.observe()
    assert.equal(observer.getCurrentResult().fetchStatus, 'paused')
    f.reply('probe-recovered')
    f.observeProbe()
    await until(() => query.onlineManager.isOnline() && observer.getCurrentResult().isSuccess, 'probe recovery')
    assert.equal(observer.getCurrentResult().data[0].label, 'probe-recovered')
    assert.equal(f.logouts, 0)
    assert.equal(auth.authenticated, true)
})
