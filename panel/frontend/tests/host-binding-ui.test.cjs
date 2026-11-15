const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MantineProvider } = require('@mantine/core')
const i18n = require('i18next').createInstance()

const source = path.resolve(__dirname, '../src')
const messages = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales/en/remnawave.json'), 'utf8'))
void i18n.init({ lng: 'en', initImmediate: false, defaultNS: 'remnawave', resources: { en: { remnawave: messages } } })
const profileUuid = '0587cad8-1305-4127-ab2a-7e10c0981280'
const inboundUuid = '8b5b79c5-234d-41c9-ab46-435f5154671e'
const otherUuid = 'efdc2c1e-b9f7-4d7c-a5e8-c348f4261526'
const inbound = { uuid: inboundUuid, profileUuid, tag: 'vless-current', type: 'vless', network: 'tcp', security: 'reality', port: 443, rawInbound: { tag: 'vless-current', protocol: 'vless', port: 443 } }
const profile = { uuid: profileUuid, name: 'Existing profile', inbounds: [inbound], config: { inbounds: [inbound.rawInbound] } }
const host = { uuid: '1e17ad03-10f3-490d-b5be-6a997b23d441', remark: 'Configured host', address: 'node.example.test', port: 443,
    inbound: { configProfileUuid: profileUuid, configProfileInboundUuid: inboundUuid },
    nodes: [], tags: [], isDisabled: false, isHidden: false, internalSquads: { mode: 'EXCEPT', squads: [] },
    serverDescription: null, finalMask: null, muxParams: null, sockoptParams: null, xrayJsonTemplateUuid: null }
const passthrough = ({ children }) => children ?? null

function load(relative, mocks = {}) {
    const filename = path.resolve(source, relative)
    const ref = { exports: {} }
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText
    new Function('require', 'module', 'exports', compiled)((name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name]
        if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
        if (name.startsWith('@shared/')) {
            const target = name.replace('@shared/', 'shared/')
            for (const suffix of ['.ts', '.tsx', '/index.ts'])
                if (fs.existsSync(path.join(source, target + suffix))) return load(target + suffix, mocks)
        }
        if (name.startsWith('.')) {
            const target = path.resolve(path.dirname(filename), name)
            for (const suffix of ['.ts', '.tsx', '/index.ts'])
                if (fs.existsSync(target + suffix)) return load(path.relative(source, target + suffix), mocks)
        }
        return require(name)
    }, ref, ref.exports)
    return ref.exports
}

test('actual datatable rows and cells distinguish stale bindings without treating disabled or absent nodes as invalid', () => {
    const table = require('@kastov/mantine-datatable')
    const records = [
        { ...host, remark: 'Valid without nodes' },
        { ...host, uuid: otherUuid, remark: 'Stale inbound', inbound: { ...host.inbound, configProfileInboundUuid: otherUuid } },
        { ...host, uuid: inboundUuid, remark: 'Valid disabled', isDisabled: true },
    ]
    const before = structuredClone(records)
    const mocks = {
        'react-i18next': { useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) },
        '@shared/i18n/interface-text': { useUiText: () => (key) => i18n.t('interface.' + key) },
        '@shared/_modals/show-modal': { showModal() {} },
        '@shared/hooks': { usePreventTableBackScroll() {} },
        '@shared/ui/hosts/always-available-host-badge': { AlwaysAvailableHostBadge: () => null },
        '@shared/api/hooks': {
            useGetNodes: () => ({ data: [] }),
            useGetInternalSquads: () => ({ data: { internalSquads: [] } }),
            useGetSubscriptionTemplates: () => ({ data: { templates: [] } }),
            useGetHosts: () => ({ data: records }),
        },
        '@kastov/mantine-datatable': {
            ...table,
            DataTable: props => React.createElement(table.DataTable, { ...props, rowVirtualization: undefined }),
        },
    }
    mocks['@shared/ui'] = {
        ...load('shared/ui/datatable/cells.tsx', mocks),
        ...load('shared/ui/datatable/sort.ts', mocks),
        DataTableControls: () => null,
        LoadingScreen: () => null,
    }
    const { HostsDataTableWidget } = load('widgets/dashboard/hosts/hosts-datatable/hosts-datatable.widget.tsx', mocks)
    const html = renderToStaticMarkup(React.createElement(MantineProvider, {},
        React.createElement(HostsDataTableWidget, { hosts: records, state: records, configProfiles: [profile],
            selectedHosts: [], setSelectedHosts() {} })))
    const rows = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(match => match[0])
    const stale = rows.find(row => row.includes('Stale inbound'))
    assert.ok(stale, 'actual DataTable renders the stale host row')
    assert.ok(stale.includes('--mantine-color-red-light'))
    assert.ok(stale.includes('DANGLING'))
    for (const name of ['Valid without nodes', 'Valid disabled']) {
        const row = rows.find(row => row.includes(name))
        assert.ok(row, name)
        assert.equal(row.includes('--mantine-color-red-light'), false, name)
        assert.equal(row.includes('DANGLING'), false, name)
    }
    assert.deepEqual(records, before)
})

function card(item, profiles, mobile = false, nodes = new Map()) {
    const { HostCardWidget } = load('widgets/dashboard/hosts/host-card/host-card.widget.tsx', {
        '@dnd-kit/dom/sortable': { OptimisticSortingPlugin: class {} },
        '@dnd-kit/react/sortable': { useSortable: () => ({ isDragging: false }) },
        'react-i18next': { useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) },
        '@shared/hooks': { useIsMobile: () => mobile },
        '@shared/i18n/interface-text': { useUiText: () => (key) => i18n.t('interface.' + key) },
        '@shared/_modals/show-modal': { showModal() {} },
        '@shared/constants': { ROUTES: {} },
        '@shared/ui/hosts/always-available-host-badge': { AlwaysAvailableHostBadge: () => null },
        '@shared/ui/logos': { XrayLogo: () => React.createElement('svg', { 'aria-hidden': true }) },
        '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: passthrough },
        '@shared/ui/provider-tags/provider-tags': { ProviderTags: () => null },
        '@shared/ui/single-row-overflow-list': { SingleRowOverflowList: ({ data, renderItem }) => data.map(renderItem) },
        '@shared/utils/misc/resolve-country-code': { resolveCountryCode: () => null }
    })
    return renderToStaticMarkup(React.createElement(MantineProvider, { defaultColorScheme: 'dark' },
        React.createElement(HostCardWidget, { item, configProfiles: profiles, nodesByUuid: nodes, viewOnly: true })))
}

for (const mobile of [false, true]) {
    for (const [name, item, profiles] of [
        ['deleted profile', host, []],
        ['missing inbound ID', { ...host, inbound: { ...host.inbound, configProfileInboundUuid: null } }, [profile]],
        ['inbound removed from existing profile', host, [{ ...profile, inbounds: [] }]],
        ['tag replacement created a different inbound UUID', host, [{ ...profile, inbounds: [{ ...inbound, uuid: otherUuid, tag: 'renamed' }] }]],
        ['inbound belongs to another profile', host, [{ ...profile, inbounds: [{ ...inbound, profileUuid: otherUuid }] }]],
        ['missing inbound record tag', host, [{ ...profile, inbounds: [{ ...inbound, tag: undefined }] }]],
        ['missing inbound inventory', host, [{ ...profile, inbounds: undefined }]],
    ]) {
        test(`${mobile ? 'mobile' : 'desktop'} actual card marks ${name} as DANGLING`, () => {
            const html = card(item, profiles, mobile)
            assert.match(html, /class="item[^\"]*\bdanglingItem\b/)
            assert.match(html, /DANGLING/)
            assert.doesNotMatch(html, />Existing profile</)
        })
    }
    test(`${mobile ? 'mobile' : 'desktop'} valid, disabled, node-free and offline-node cards retain their configuration`, () => {
        const before = structuredClone({ host, profile })
        for (const [item, nodes] of [
            [host, new Map()],
            [{ ...host, isDisabled: true }, new Map()],
            [{ ...host, nodes: [otherUuid] }, new Map([[otherUuid, { uuid: otherUuid, name: 'Offline node', countryCode: 'US', isConnected: false }]])],
            [{ ...host, nodes: [otherUuid] }, new Map()],
        ]) {
            const html = card(item, [profile], mobile, nodes)
            assert.doesNotMatch(html, /\bdanglingItem\b|DANGLING/)
            assert.match(html, /Existing profile/)
            assert.match(html, /vless-current/)
        }
        assert.deepEqual({ host, profile }, before)
    })
}
