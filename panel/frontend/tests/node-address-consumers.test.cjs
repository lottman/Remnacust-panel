const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const React = require('react')
const ts = require('typescript')
const mantine = require('@mantine/core')
const contract = require('@remnawave/backend-contract')
const backendLoad = require('../../backend/tests/load-typescript.cjs')
const gateway = backendLoad(path.resolve(__dirname, '../../backend/src/modules/nodes/node-control-addresses.ts'))

function load(file, mocks = {}, globals = {}) {
    const ref = { exports: {} }
    const source = fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8')
    new Function('require', 'module', 'exports', ...Object.keys(globals), ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports, ...Object.values(globals))
    return ref.exports
}
const helpers = load('shared/utils/node-control-addresses.ts')
const rows = value => Array.isArray(value) ? value.flatMap(rows) : value?.props ? [value, ...rows(value.props.children)] : []
const base = {
    uuid: '10000000-0000-4000-8000-000000000001', name: 'Consumer fixture',
    address: 'legacy.example.test', controlAddresses: [
        { address: 'disabled.example.test', enabled: false },
        { address: '2001:db8::42', enabled: true }
    ], ips: [{ ip: '198.51.100.4', status: 'INBOUND' }, { ip: '2001:0db8::4', status: 'OUTBOUND' }], system: null
}
function harness(file, name, props, extra = {}) {
    let cursor = 0
    const states = []
    const component = load(file, {
        react: { ...React, useMemo: fn => fn(), useState: initial => {
            const index = cursor++
            if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
            return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
        } },
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        '@shared/utils/node-control-addresses': helpers,
        '@shared/ui/node-ips': { NodeIpStatusIcon: 'ip-status', resolveNodeIpStatusMeta: status => ({ labelKey: status }) },
        '@shared/ui/copyable-code-block': { CopyableCodeBlock: 'copy' },
        '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: 'header' },
        '@shared/ui/refresh-control': { RefreshButton: 'refresh' },
        '@shared/ui/section-card': { SectionCard: { Root: 'section', Section: 'section' } },
        '../NodeSshTerminal.module.css': { __esModule: true, default: {} },
        ...extra
    })[name]
    return () => { cursor = 0; return rows(component(props)) }
}
const setupFile = 'shared/_modals/nodes/node-ssh-terminal/session/connection-setup.screen.tsx'
const geoFile = 'shared/_modals/nodes/node-geocheck-modal/geocheck-form.widget.tsx'

test('GeoCheck offers canonical and historical literal IPs, preserves roles and rejects a typed hostname', () => {
    const calls = []
    const node = structuredClone(base)
    const before = structuredClone(node)
    const render = harness(geoFile, 'GeocheckFormWidget', { node, onCancel() {}, onStart: value => calls.push(value) })
    render().find(el => el.type === mantine.SegmentedControl).props.onChange('ip')
    let input = render().find(el => el.type === mantine.Autocomplete)
    assert.deepEqual(input.props.data, ['2001:db8::42', '198.51.100.4', '2001:db8::4'])
    assert.equal(calls.length, 0)
    input.props.onChange('disabled.example.test')
    let run = render().find(el => el.type === mantine.Button && el.props.children === 'node-geocheck.run')
    assert.equal(run.props.disabled, true)
    run.props.onClick()
    assert.equal(calls.length, 0)
    render().find(el => el.type === mantine.Autocomplete).props.onChange('[2001:DB8::42]')
    run = render().find(el => el.type === mantine.Button && el.props.children === 'node-geocheck.run')
    assert.equal(run.props.disabled, false)
    run.props.onClick()
    assert.deepEqual(calls, [{ ip: '2001:db8::42' }])
    assert.deepEqual(node, before)
})

test('manual SSH accepts the new canonical IPv6 in the real open message and backend allowlist', () => {
    const calls = []
    const sent = []
    const sockets = []
    class FakeSocket {
        static OPEN = 1
        readyState = 1
        events = {}
        constructor() { sockets.push(this) }
        addEventListener(name, callback) { this.events[name] = callback }
        send(message) { sent.push(JSON.parse(message)) }
        close() {}
    }
    const { SshConnection } = load('shared/_modals/nodes/node-ssh-terminal/session/ssh-connection.ts', {
        '@shared/i18n/interface-text': { translateUiText: key => key },
        '@entities/ssh-vault': {}, '../node-upgrade.types': {}
    }, { WebSocket: FakeSocket })
    const node = structuredClone(base)
    const before = structuredClone(node)
    const render = harness(setupFile, 'ConnectionSetupScreen', {
        node, initial: { host: helpers.getNodeSshDefaultAddress(node), username: 'root', port: 22 },
        nodeKey: { publicKey: 'synthetic-public-key', algo: 'Ed25519' }, onOpenKeyImport() {}, async onRegenerateKey() {},
        onConnect: target => calls.push(target)
    })
    const input = render().find(el => el.type === mantine.Autocomplete)
    assert.equal(input.props.value, '2001:db8::42')
    assert.ok(input.props.data.includes('disabled.example.test'))
    assert.deepEqual(input.props.data, gateway.configuredNodeAddresses(node))
    input.props.onChange('[2001:DB8::42]')
    render().find(el => el.type === mantine.Button && el.props.children === 'node-ssh.connect').props.onClick()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].host, '2001:db8::42')
    new SshConnection({ ...calls[0], url: 'ws://127.0.0.1/fixture', ticket: '', token: '', cols: 80, rows: 24 },
        { onStage() {} }).open()
    sockets[0].events.open()
    assert.equal(sent[0].t, 'open')
    assert.equal(sent[0].host, '2001:db8::42')
    assert.ok(gateway.configuredNodeAddresses(node).includes(sent[0].host))
    assert.deepEqual(node, before)
})

test('all-off Node API settings retain explicit manual SSH choices and reject unrelated destinations', () => {
    const calls = []
    const node = { ...base, controlAddresses: base.controlAddresses.map(entry => ({ ...entry, enabled: false })) }
    const render = harness(setupFile, 'ConnectionSetupScreen', {
        node, initial: { host: helpers.getNodeSshDefaultAddress(node), username: 'root', port: 22 },
        nodeKey: { publicKey: 'synthetic-public-key', algo: 'Ed25519' }, onConnect: value => calls.push(value), onOpenKeyImport() {}, async onRegenerateKey() {}
    })
    assert.ok(render().some(el => el.props.children === 'node-ssh.management-off-hint'))
    const input = render().find(el => el.type === mantine.Autocomplete)
    assert.equal(input.props.value, 'disabled.example.test')
    assert.ok(input.props.data.includes('2001:db8::42'))
    render().find(el => el.type === mantine.Button && el.props.children === 'node-ssh.connect').props.onClick()
    assert.equal(calls[0].host, 'disabled.example.test')
    input.props.onChange('unconfigured.example.test')
    const connect = render().find(el => el.type === mantine.Button && el.props.children === 'node-ssh.connect')
    assert.equal(connect.props.disabled, true)
    connect.props.onClick()
    assert.equal(calls.length, 1)
})

test('the topology summary shows every configured address without changing host or IP role metadata', () => {
    const node = { ...base, countryCode: 'XX', configProfile: { activeInbounds: [] } }
    const before = structuredClone(node)
    const render = harness('shared/_modals/nodes/node-inbounds-hosts-drawer/node-inbounds-hosts.tree.tsx', 'NodeInboundsHostsTree', {
        node, configProfile: { uuid: 'profile', name: 'Profile', inbounds: [] }, hosts: []
    }, {
        '@mantine/core': { ...mantine, useTree: () => ({}) },
        '@shared/_modals/show-modal': {}, '@shared/ui/get-country-flag': { CountryFlag: 'flag' }, '@shared/ui/logos': { XrayLogo: 'xray' }
    })
    const tree = render().find(el => el.type === mantine.Tree)
    for (const address of helpers.getConfiguredNodeAddresses(node)) assert.ok(tree.props.data[0].nodeProps.address.includes(address))
    assert.deepEqual(node, before)
})

test('the actual SSH session starts only on explicit connect and carries the normalized canonical host into its ticketed connection', async () => {
    const states = [], refs = [], effects = [], tickets = [], connections = [], statuses = []
    let stateCursor = 0, refCursor = 0, effectCursor = 0
    const tick = () => new Promise(resolve => setImmediate(resolve))
    const actions = {
        ensureNodeKey: async () => ({ publicKey: 'synthetic-public-key', algo: 'Ed25519' }),
        getProfile: async () => null,
        getPrivateKey: async () => ({ material: new Uint8Array(4) }),
        saveProfile: async () => {}
    }
    const { SshSessionTab } = load('shared/_modals/nodes/node-ssh-terminal/session/ssh-session.tab.tsx', {
        react: { ...React, useMemo: fn => fn(), useCallback: fn => fn, useEffectEvent: fn => fn,
            useState: initial => {
                const index = stateCursor++
                if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
                return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
            }, useRef: initial => refs[refCursor++] ??= { current: initial },
            useEffect: (fn, dependencies) => {
                const index = effectCursor++
                const previous = effects[index]
                if (!previous || dependencies.some((item, i) => item !== previous.dependencies[i])) effects[index] = { fn, dependencies, pending: true, previous }
            }
        },
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        '@xterm/xterm': {}, 'motion/react': { AnimatePresence: 'animate', motion: { div: 'motion' } },
        '@shared/api': { getAuthorizationToken: () => '', getBackendDomain: () => 'http://127.0.0.1' },
        '@shared/api/hooks': { useCreateSshTicket: () => ({ mutateAsync: async value => { tickets.push(value); return { ticket: '', path: '/fixture/ssh' } } }) },
        '@shared/utils/node-control-addresses': helpers,
        '@entities/ssh-vault': { useSshVaultStatus: () => 'unlocked', useSshVaultActions: () => actions },
        '@shared/ui/forms/nodes/base-node-form/node-optimizer.sh?raw': '',
        '@shared/ui/forms/nodes/base-node-form/optimization-runner': { OptimizationRunner: class { cancel() {} }, optimizationCommand() {} },
        '../NodeSshTerminal.module.css': { __esModule: true, default: {} },
        './connection-log.screen': { ConnectionLogScreen: 'connecting' },
        './connection-setup.screen': { ConnectionSetupScreen: 'setup' },
        './host-key.overlay': { HostKeyOverlay: 'host-key' }, './key-import.overlay': { KeyImportOverlay: 'key-import' },
        './terminal.view': { TerminalView: 'terminal' },
        './ssh-connection': { SshConnection: class {
            constructor(options) { this.options = options; connections.push(this) }
            open() { this.opened = true }
            close() {}
        } }
    })
    const render = () => {
        stateCursor = refCursor = effectCursor = 0
        const result = rows(SshSessionTab({ node: base, isHidden: false, onRegister() {}, onStatusChange: status => statuses.push(status) }))
        for (const effect of effects) if (effect.pending) {
            effect.previous?.cleanup?.(); effect.cleanup = effect.fn(); effect.pending = false
        }
        return result
    }
    try {
        render(); await tick()
        let tree = render()
        assert.equal(statuses[0].target.host, '2001:db8::42')
        assert.equal(tickets.length, 0)
        tree.find(el => el.type === 'setup').props.onConnect({ host: '[2001:DB8::42]', port: 22, username: 'root' })
        await tick()
        assert.equal(tickets.length, 1)
        assert.equal(connections.length, 1)
        assert.equal(connections[0].options.host, '2001:db8::42')
        assert.equal(connections[0].opened, true)
        assert.ok(gateway.configuredNodeAddresses(base).includes(connections[0].options.host))
        assert.equal(connections[0].options.url, 'ws://127.0.0.1/fixture/ssh')
    } finally { for (const effect of effects) effect.cleanup?.() }
})
