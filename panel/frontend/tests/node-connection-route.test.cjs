const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const mantine = require('@mantine/core')
const { MutationObserver, QueryClient } = require('@tanstack/react-query')
const load = require('../../backend/tests/load-typescript.cjs')
const root = path.join(__dirname, '../src/shared/_modals/nodes/edit-node-modal')
const helpers = load(path.join(root, 'node-connection-route.ts'))
const source = fs.readFileSync(path.join(root, 'node-diagnostics.tsx'), 'utf8')
const epoch = Date.parse('2026-11-06T12:00:00Z')
const route = (changes = {}) => ({
    status: 'authenticated', activeAddress: '2001:db8::10', port: 2222, viaProxy: true,
    checkedAt: new Date(epoch).toISOString(), configurationRevision: 'opaque-revision',
    attempts: [{ address: '192.0.2.1', status: 'failed', code: 'timeout' },
        { address: '2001:db8::10', status: 'authenticated', code: 'authenticated' }],
    ...changes
})
const report = (connectionRoute = route()) => ({
    checkedAt: new Date(epoch).toISOString(), durationMs: 42, alertMutedUntil: null,
    checks: [], ...(connectionRoute === undefined ? {} : { connectionRoute })
})
const elements = element => Array.isArray(element) ? element.flatMap(elements) :
    element && typeof element === 'object' ? [element, ...elements(element.props?.children)] : []

function harness(language = 'en') {
    const locale = require(`../public/locales/${language}/remnawave.json`)
    const translate = (key, values = {}) => {
        const value = key.split('.').reduce((entry, part) => entry?.[part], locale)
        assert.equal(typeof value, 'string', `Missing ${language} translation: ${key}`)
        return value.replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] ?? '')
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } })
    const observers = [], refs = [], states = [], effects = [], requests = [], flights = [], timers = []
    let cursor, refCursor, stateCursor, effectCursor, now = epoch, tree
    class Clock extends Date { static now() { return now } }
    const exports = {}
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }
    }).outputText, {
        exports, Date: Clock, AbortController,
        setTimeout(fn, ms) { const timer = { fn, at: now + ms }; timers.push(timer); return timer },
        clearTimeout(timer) { timer.cancelled = true },
        require(name) {
            if (name === './node-connection-route') return helpers
            if (name === 'react-i18next') return { useTranslation: () => ({ t: translate }) }
            if (name === 'react') return {
                useRef(value) { return refs[refCursor++] ??= { current: value } },
                useState(initial) {
                    const index = stateCursor++
                    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
                    return [states[index], value => { states[index] = value }]
                },
                useEffect(fn, deps) {
                    const index = effectCursor++
                    const old = effects[index]
                    if (!old || deps.some((value, i) => value !== old.deps[i])) {
                        effects[index] = { fn, deps, oldCleanup: old?.cleanup, pending: true }
                    }
                }
            }
            if (name === '@tanstack/react-query') return {
                useMutation(options) {
                    const index = cursor++
                    const observer = observers[index] ??= new MutationObserver(client, options)
                    observer.setOptions(options)
                    return { ...observer.getCurrentResult(), mutate: variables => {
                        const promise = observer.mutate(variables).catch(() => {})
                        flights.push(promise)
                    } }
                }
            }
            if (name === '@shared/api/axios') return { instance: { post(url, body, config) {
                return new Promise((resolve, reject) => {
                    requests.push({ url, body, config, resolve: response => resolve({ data: { response } }), reject })
                    config?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
                })
            } } }
            return require(name)
        }
    })
    function render(uuid = 'node-a') {
        cursor = refCursor = stateCursor = effectCursor = 0
        tree = exports.NodeDiagnostics({ nodeUuid: uuid })
        const html = markup(tree)
        for (const effect of effects) if (effect.pending) {
            effect.oldCleanup?.()
            effect.cleanup = effect.fn()
            effect.pending = false
        }
        return html
    }
    function markup(element) {
        return renderToStaticMarkup(React.createElement(mantine.MantineProvider, null, element))
    }
    const tick = () => new Promise(resolve => setImmediate(resolve))
    return {
        render, requests, flights, translate,
        panel(value, at = now) {
            const parsed = helpers.parseConnectionRoute(value)
            assert.ok(parsed)
            return markup(React.createElement(exports.NodeConnectionRoute, { route: parsed, now: at }))
        },
        async click() {
            elements(tree).find(element => element.type === mantine.Button &&
                element.props.children === translate('operations.checkConnection')).props.onClick()
            await tick()
        },
        async respond(value) { requests.at(-1).resolve(value); await flights.at(-1) },
        async reject() { requests.at(-1).reject(new Error('socks5://fixture:private-secret@proxy.invalid')); await flights.at(-1) },
        advance(ms) {
            now += ms
            for (const timer of timers) if (!timer.cancelled && timer.at <= now) {
                timer.cancelled = true
                timer.fn()
            }
        },
        close() { effects.forEach(effect => effect.cleanup?.()); client.clear() }
    }
}

for (const language of ['ru', 'en', 'fa', 'zh']) {
    test(`${language}: route display uses sanitized endpoints and labels shared SOCKS without credentials`, () => {
        const h = harness(language)
        try {
            const html = h.panel(route({ proxyUrl: 'socks5://user:private-secret@proxy.invalid:1080' }))
            assert.ok(html.includes('[2001:db8::10]:2222'))
            assert.ok(html.includes(h.translate('operations.routeProxy')))
            assert.ok(html.includes(h.translate('operations.routeProxyFailure')))
            assert.ok(!html.includes('private-secret') && !html.includes('socks5://'))
            const direct = h.panel(route({ viaProxy: false }))
            assert.ok(direct.includes(h.translate('operations.routeDirect')))
            assert.ok(!direct.includes(h.translate('operations.routeProxyFailure')))
        } finally { h.close() }
    })
}

test('old, future and missing observations never render a currently authenticated endpoint', () => {
    const h = harness()
    try {
        for (const checkedAt of [null, new Date(epoch - 10_000).toISOString(), new Date(epoch + 1).toISOString()]) {
            const html = h.panel(route({ checkedAt, attempts: [] }))
            assert.ok(!html.includes('[2001:db8::10]:2222'))
            assert.ok(html.includes(h.translate('operations.routeStatus_unverified')))
        }
        assert.equal(helpers.parseConnectionRoute(route({ activeAddress: 'socks5://user:secret@proxy.invalid' })), null)
        assert.equal(helpers.parseConnectionRoute(route({ attempts: [{ address: 'user:secret@proxy.invalid', status: 'failed', code: 'proxy' }] })), null)
    } finally { h.close() }
})

test('private Docker hostnames with underscores render in active routes and attempts without allowing credential URLs', () => {
    const h = harness()
    try {
        const value = route({ activeAddress: 'node_service', attempts: [
            { address: 'socks_proxy', status: 'failed', code: 'proxy' },
            { address: 'node_service', status: 'authenticated', code: 'authenticated' }
        ] })
        const parsed = helpers.parseConnectionRoute(value)
        assert.ok(parsed)
        assert.equal(helpers.isRouteAuthenticated(parsed, epoch), true)
        const html = h.panel(value)
        assert.ok(html.includes('node_service:2222'))
        assert.ok(html.includes('socks_proxy:2222'))
        for (const invalid of ['socks5://user:secret@socks_proxy:1080', 'user:secret@node_service', 'node_service/path']) {
            assert.equal(helpers.parseConnectionRoute(route({ activeAddress: invalid })), null)
            assert.equal(helpers.parseConnectionRoute(route({ attempts: [
                { address: invalid, status: 'failed', code: 'proxy' }
            ] })), null)
        }
    } finally { h.close() }
})

test('an authenticated route with the default null port displays its address without inventing a port', () => {
    const h = harness()
    try {
        for (const address of ['node.example.test', '2001:db8::10']) {
            const value = route({ activeAddress: address, port: null, attempts: [] })
            const parsed = helpers.parseConnectionRoute(value)
            assert.ok(parsed)
            assert.equal(helpers.isRouteAuthenticated(parsed, epoch), true)
            assert.equal(helpers.isRouteAuthenticated(parsed, epoch + 10_000), false)
            const html = h.panel(value)
            assert.ok(html.includes(h.translate('operations.routeStatus_authenticated')))
            assert.ok(html.includes(`<bdi>${address.includes(':') ? `[${address}]` : address}</bdi>`))
            assert.ok(!html.includes(':null') && !html.includes(':443') && !html.includes(':80'))
        }
    } finally { h.close() }
})

test('local probe capacity is a warning and does not label an unchecked node as failed', async () => {
    const h = harness()
    try {
        h.render(); await h.click()
        await h.respond({ ...report(route({ status: 'unavailable', activeAddress: null, checkedAt: null,
            attempts: [{ address: '192.0.2.1', status: 'skipped', code: 'busy' }] })),
            checks: [{ id: 'connection', status: 'warning', code: 'busy' }] })
        const html = h.render()
        assert.ok(html.includes(h.translate('operations.status_warning')))
        assert.ok(html.includes(h.translate('operations.result_busy')))
        assert.ok(html.includes(h.translate('operations.routeStatus_unverified')))
        assert.ok(!html.includes(h.translate('operations.routeStatus_unavailable')))
        assert.ok(!html.includes(h.translate('operations.status_failed')))
    } finally { h.close() }
})

test('disabled, unavailable and malformed routes never display a working endpoint', async () => {
    const h = harness()
    try {
        for (const status of ['disabled', 'unavailable', 'unverified']) {
            const html = h.panel(route({ status, attempts: [] }))
            assert.ok(!html.includes('[2001:db8::10]:2222'))
            assert.ok(html.includes(h.translate(`operations.routeStatus_${status}`)))
        }
        h.render(); await h.click()
        await h.respond(report(route({ activeAddress: 'https://user:private-secret@proxy.invalid' })))
        const html = h.render()
        assert.ok(html.includes(h.translate('operations.routeInvalid')))
        assert.ok(!html.includes('private-secret'))
    } finally { h.close() }
})

for (const language of ['ru', 'en', 'fa', 'zh']) {
    test(`${language}: every declared failure code has a safe localized explanation`, () => {
        const h = harness(language)
        try {
            for (const code of ['dns', 'refused', 'timeout', 'certificate', 'authorization', 'proxy',
                'identity-mismatch', 'identity-unavailable', 'invalid-response', 'cooldown', 'busy', 'transport']) {
                const html = h.panel(route({ status: 'unavailable', activeAddress: null,
                    attempts: [{ address: '192.0.2.1', status: 'failed', code }] }))
                assert.ok(!html.includes('operations.result_'))
                assert.ok(!html.includes('private-secret'))
            }
        } finally { h.close() }
    })
}

test('new checks hide the old report during loading and errors do not revive the previous green route', async () => {
    const h = harness()
    try {
        h.render(); await h.click(); await h.respond(report())
        assert.ok(h.render().includes('[2001:db8::10]:2222'))
        await h.click()
        assert.ok(!h.render().includes('[2001:db8::10]:2222'))
        assert.ok(h.render().includes('data-loading="true"'))
        await h.reject()
        const html = h.render()
        assert.ok(html.includes(h.translate('operations.requestError')))
        assert.ok(!html.includes('private-secret') && !html.includes('[2001:db8::10]:2222'))
    } finally { h.close() }
})

test('the observation expires without polling or another API request', async () => {
    const h = harness()
    try {
        h.render(); await h.click(); await h.respond(report(route({ attempts: [] })))
        h.render(); h.advance(10_001)
        assert.ok(h.render().includes(h.translate('operations.routeStale')))
        assert.ok(!h.render().includes('[2001:db8::10]:2222'))
        assert.equal(h.requests.length, 1)
    } finally { h.close() }
})

test('a check after the modal has been open for a minute uses the new observation time', async () => {
    const h = harness()
    try {
        h.render(); h.advance(60_000); await h.click()
        await h.respond(report(route({ checkedAt: new Date(epoch + 60_000).toISOString(), attempts: [] })))
        assert.ok(h.render().includes('[2001:db8::10]:2222'))
        h.advance(10_001)
        assert.ok(!h.render().includes('[2001:db8::10]:2222'))
    } finally { h.close() }
})

test('switching UUID clears the old result, aborts the pending check and uses the new node URL', async () => {
    const h = harness()
    try {
        h.render(); await h.click(); await h.respond(report())
        assert.ok(h.render().includes('[2001:db8::10]:2222'))
        await h.click()
        const old = h.requests.at(-1)
        const switched = h.render('node-b')
        assert.ok(!switched.includes('[2001:db8::10]:2222'))
        assert.ok(!switched.includes('data-loading="true"'))
        assert.equal(old.config.signal.aborted, true)
        await h.flights.at(-1)
        assert.ok(!h.render('node-b').includes(h.translate('operations.requestError')))
        await h.click()
        assert.equal(h.requests.at(-1).url, '/api/nodes/node-b/diagnostics')
        await h.respond(report(route({ activeAddress: '192.0.2.20', attempts: [] })))
        assert.ok(h.render('node-b').includes('192.0.2.20:2222'))
    } finally { h.close() }
})

test('older diagnostics responses without connectionRoute still display their normal checks', async () => {
    const h = harness()
    try {
        h.render(); await h.click()
        await h.respond({ checkedAt: new Date(epoch).toISOString(), durationMs: 42, alertMutedUntil: null, checks: [] })
        const html = h.render()
        assert.ok(html.includes('42 ms'))
        assert.ok(!html.includes(h.translate('operations.routeInvalid')))
    } finally { h.close() }
})
