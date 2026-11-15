const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const React = require('react')
const mantine = require('@mantine/core')
const { renderToStaticMarkup } = require('react-dom/server')

const root = path.resolve(__dirname, '../src')
function load(file, mocks = {}) {
    const filename = path.resolve(root, file), ref = { exports: {} }
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText
    new Function('require', 'module', 'exports', compiled)((name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name]
        const target = name.startsWith('@shared/') ? path.resolve(root, name.replace('@shared/', 'shared/'))
            : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : undefined
        if (target) for (const suffix of ['', '.ts', '.tsx', '/index.ts'])
            if (fs.existsSync(target + suffix) && fs.statSync(target + suffix).isFile()) return load(path.relative(root, target + suffix), mocks)
        return require(name)
    }, ref, ref.exports)
    return ref.exports
}
const profileUuid = '0587cad8-1305-4127-ab2a-7e10c0981280', inboundUuid = '8b5b79c5-234d-41c9-ab46-435f5154671e'
const otherUuid = 'efdc2c1e-b9f7-4d7c-a5e8-c348f4261526', hostUuid = '1e17ad03-10f3-490d-b5be-6a997b23d441'
const binding = { configProfileUuid: profileUuid, configProfileInboundUuid: inboundUuid }
const inbound = { uuid: inboundUuid, profileUuid, tag: 'current-tag', network: 'tcp', port: 443, rawInbound: { tag: 'current-tag' } }
const profile = { uuid: profileUuid, name: 'Current profile', inbounds: [inbound] }
const host = { uuid: hostUuid, inbound: binding, isDisabled: false, isHidden: false, nodes: [] }
const { resolveHostInbound } = load('shared/utils/host-inbound.ts')

test('profile labels accepted by actual DTOs do not invalidate an existing binding', () => {
    const { CreateConfigProfileCommand, UpdateConfigProfileCommand } = require('@remnawave/backend-contract')
    const name = '  '
    const config = { inbounds: [{ tag: inbound.tag, protocol: 'vless', port: 443, settings: { clients: [] } }] }
    assert.equal(CreateConfigProfileCommand.RequestBodySchema.parse({ name, config }).name, name)
    assert.equal(UpdateConfigProfileCommand.RequestBodySchema.parse({ uuid: profileUuid, name }).name, name)
    const whitespaceProfile = { ...profile, name }
    assert.equal(resolveHostInbound(binding, [whitespaceProfile])?.profile, whitespaceProfile)
    assert.equal(resolveHostInbound(binding, [whitespaceProfile])?.profileLabel, profileUuid)
})

const invalid = [
    ['missing profile', binding, []],
    ['missing inbound', { ...binding, configProfileInboundUuid: null }, [profile]],
    ['missing binding', undefined, [profile]],
    ['untrusted binding array', [], [profile]],
    ['untrusted UUID', { ...binding, configProfileUuid: 'not-a-uuid' }, [{ ...profile, uuid: 'not-a-uuid' }]],
    ['old inbound UUID after tag replacement', binding, [{ ...profile, inbounds: [{ ...inbound, uuid: otherUuid, tag: 'replacement' }] }]],
    ['wrong inbound owner', binding, [{ ...profile, inbounds: [{ ...inbound, profileUuid: otherUuid }] }]],
    ['missing inbound owner', binding, [{ ...profile, inbounds: [{ ...inbound, profileUuid: undefined }] }]],
    ['missing tag', binding, [{ ...profile, inbounds: [{ ...inbound, tag: undefined }] }]],
    ['blank tag', binding, [{ ...profile, inbounds: [{ ...inbound, tag: '  ' }] }]],
    ['absent inventory', binding, undefined],
    ['untrusted inventory', binding, {}],
    ['missing inbound inventory', binding, [{ ...profile, inbounds: undefined }]],
    ['non-array inbound inventory', binding, [{ ...profile, inbounds: {} }]],
    ['untrusted matching record', binding, [null, { ...profile, inbounds: [null] }]],
    ['ambiguous profile UUID', binding, [profile, { ...profile }]],
    ['ambiguous inbound UUID', binding, [{ ...profile, inbounds: [inbound, { ...inbound }] }]],
]
const translation = key => key
const translated = { useTranslation: () => ({ t: translation }) }
const uiText = { useUiText: () => translation }

for (const [name, value, profiles] of invalid)
    test('shared resolver fails closed for ' + name, () => assert.equal(resolveHostInbound(value, profiles), undefined))

test('a complete binding is independent of node availability, optional raw data and operator flags', () => {
    const before = structuredClone({ profile, binding })
    const resolved = resolveHostInbound(binding, [profile])
    assert.equal(resolved.profile, profile)
    assert.equal(resolved.inbound, inbound)
    assert.equal(resolveHostInbound(binding, [{ ...profile, inbounds: [{ ...inbound, rawInbound: null }] }]).inbound.rawInbound, null)
    assert.equal(resolveHostInbound({ configProfileUuid: profileUuid.toUpperCase(), configProfileInboundUuid: inboundUuid.toUpperCase() }, [profile]).inbound, inbound)
    assert.deepEqual({ profile, binding }, before)
})

test('form validation shares the same fail-closed binding rule and preserves omitted bulk patches', () => {
    const { validateHostInbound } = load('shared/ui/forms/hosts/base-host-form/validate-host-inbound.ts')
    assert.deepEqual(validateHostInbound(binding, [profile]), {})
    assert.deepEqual(validateHostInbound(undefined, undefined), {})
    assert.equal(Object.keys(validateHostInbound(undefined, [profile], true)).length, 2)
    for (const [name, value, profiles] of invalid.filter(([, value]) => value !== undefined))
        assert.equal(Object.keys(validateHostInbound(value, profiles, true)).length, 2, name)
})

test('actual host form resolves only known inbound records and passes the same inventory to clone', () => {
    const formLibrary = require('@mantine/form')
    const passthrough = ({ children }) => children
    const xhttp = { ...inbound, uuid: otherUuid, tag: 'xhttp-other', network: 'xhttp' }
    for (const [value, profiles, expectedRaw, extraDisabled] of [
        [binding, [profile], inbound.rawInbound, true],
        [binding, [{ ...profile, inbounds: [inbound, xhttp] }], inbound.rawInbound, false],
        [{ ...binding, configProfileInboundUuid: otherUuid }, [profile], undefined, true],
        [binding, [{ ...profile, inbounds: [{ ...inbound, profileUuid: otherUuid }] }], undefined, true],
    ]) {
        let data, cloneProps
        const { BaseHostForm } = load('shared/ui/forms/hosts/base-host-form/base-host-form.tsx', {
            'react-i18next': { useTranslation: () => ({ t: translation, i18n: { language: 'en' } }) },
            '@features/ui/dashboard/hosts/host-select-inbound/host-select-inbound.feature': { HostSelectInboundFeature: () => null },
            '@features/ui/dashboard/hosts/clone-host': { CloneHostFeature: props => { cloneProps = props; return null } },
            '@features/ui/dashboard/hosts/delete-host': { DeleteHostFeature: () => null },
            '@shared/ui/drawer-footer': { DrawerFooter: passthrough },
            '@shared/ui/flag-picker/flag-picker': { FlagTextInput: mantine.TextInput },
            '@shared/ui/popovers': { TemplateInfoPopoverShared: () => null },
            '@shared/ui/popovers/popover-with-info': { PopoverWithInfoShared: () => null },
            '@shared/ui/section-card': { SectionCard: { Root: passthrough, Section: passthrough } },
            './host-limits-and-rules': { HostLimitsAndRules: () => null },
            './host-visibility': { HostVisibility: () => null },
            './host-template-assignments': { HostTemplateAssignments: () => null },
            './json-fields': { getHostJsonFields: () => [] },
            './options': { HostFormDataProvider: props => { data = props.value; return props.children }, HostOptionsProvider: passthrough, HostOptionsSection: () => null },
        })
        function Harness() {
            const form = formLibrary.useForm({ mode: 'uncontrolled', initialValues: { inbound: value, remark: 'Unchanged', port: 443 } })
            return React.createElement(BaseHostForm, { form, configProfiles: profiles, nodes: [], internalSquads: [], subscriptionTemplates: [], hostTags: [], hostUuid,
                handleSubmit() {}, isSubmitting: false })
        }
        renderToStaticMarkup(React.createElement(mantine.MantineProvider, {}, React.createElement(Harness)))
        assert.equal(data.resolveSelectedRawInbound(), expectedRaw)
        assert.equal(data.isXhttpExtraButtonDisabled(), extraDisabled)
        assert.equal(cloneProps.configProfiles, profiles)
    }
})

function elements(value) {
    if (typeof value === 'function') return elements(value({}))
    if (Array.isArray(value)) return value.flatMap(elements)
    return value?.props ? [value, ...elements(value.props.children)] : []
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('actual single clone consumer rejects invalid inventories without issuing a mutation', async () => {
    for (const [name, value, profiles] of invalid) {
        const calls = [], notices = []
        const { CloneHostFeature } = load('features/ui/dashboard/hosts/clone-host/clone-host.feature.tsx', {
            'react-i18next': translated,
            '@mantine/notifications': { notifications: { show: value => notices.push(value) } },
            '@shared/_modals/show-modal': { hideModal() { throw new Error('invalid clone closed the editor') } },
            '@shared/api': { queryClient: { refetchQueries() {} } },
            '@shared/api/hooks': { useGetHost: () => ({ data: { ...host, inbound: value } }),
                useCloneHost: () => ({ mutateAsync: async request => calls.push(request), isPending: false }), QueryKeys: {} }
        })
        const controls = elements(CloneHostFeature({ hostUuid, configProfiles: profiles }))
        const action = controls.find(element => element.type === mantine.ActionIcon)
        assert.equal(action.props.disabled, true, name)
        assert.ok(controls.some(element => element.type === 'span' && element.props.tabIndex === 0 &&
            element.props['aria-label'] === 'edit-host-modal.widget.dangling-host-cannot-be-cloned'), name)
        action.props.onClick()
        await settle()
        assert.equal(calls.length, 0, name)
        assert.equal(notices.length, 1, name)
    }
})

test('single clone still allows a valid disabled, node-free host and preserves its source UUID', async () => {
    const calls = [], closed = []
    const { CloneHostFeature } = load('features/ui/dashboard/hosts/clone-host/clone-host.feature.tsx', {
        'react-i18next': translated,
        '@shared/_modals/show-modal': { hideModal: value => closed.push(value) },
        '@shared/api': { queryClient: { refetchQueries: async () => {} } },
        '@shared/api/hooks': { useGetHost: () => ({ data: { ...host, isDisabled: true } }),
            useCloneHost: () => ({ mutateAsync: async request => calls.push(request), isPending: false }),
            QueryKeys: { hosts: { getAllHosts: { queryKey: ['hosts'] } } } }
    })
    const action = elements(CloneHostFeature({ hostUuid, configProfiles: [profile] })).find(element => element.type === mantine.ActionIcon)
    assert.equal(action.props.disabled, false)
    action.props.onClick()
    await settle()
    assert.deepEqual(calls, [{ variables: { cloneFromUuid: hostUuid } }])
    assert.equal(closed.length, 1)
})

test('actual bulk clone keeps valid disabled/node-free hosts and skips stale bindings without clearing their selection', async () => {
    const valid = { ...host, isDisabled: true }, stale = { ...host, uuid: otherUuid, inbound: { ...binding, configProfileInboundUuid: otherUuid } }
    const calls = [], notices = []
    let selected = [valid.uuid, stale.uuid], cursor = 0
    const state = []
    const hooks = { useCloneHost: () => ({ mutateAsync: async request => calls.push(request) }), hostsQueryKeys: { getAllHosts: { queryKey: ['hosts'] } } }
    for (const name of ['useBulkEnableHosts', 'useBulkDisableHosts', 'useBulkDeleteHosts']) hooks[name] = () => ({ isPending: false })
    const { MultiSelectHostsFeature } = load('features/dashboard/hosts/multi-select-hosts/multi-select-hosts.feature.tsx', {
        react: { ...React, useEffect() {}, useState: initial => { const index = cursor++; state[index] = initial; return [initial, value => { state[index] = typeof value === 'function' ? value(state[index]) : value }] } },
        'react-i18next': translated, '@shared/i18n/interface-text': uiText,
        '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries: async () => {} }) },
        '@entities/dashboard/view-preferences-store': { useHostsActiveTag: () => null },
        '@shared/_modals/show-modal': {}, '@shared/api/hooks': hooks,
        '@shared/api/hooks/hosts/hosts.mutation.hooks': hooks,
        '@mantine/notifications': { notifications: { show: value => notices.push(value) } },
    })
    const action = elements(MultiSelectHostsFeature({ configProfiles: [profile], hosts: [valid, stale], selectedHosts: selected,
        setSelectedHosts: update => { selected = typeof update === 'function' ? update(selected) : update }, moveSelected() {} }))
        .find(element => element.type === mantine.Button && element.props.children === 'common.action.clone')
    assert.ok(action)
    action.props.onClick()
    await settle()
    assert.deepEqual(calls, [{ variables: { cloneFromUuid: valid.uuid } }])
    assert.deepEqual(selected, [stale.uuid])
    assert.ok(notices.some(notice => notice.message === 'multi-select-hosts.feature.dangling-hosts-skipped'))
})

test('actual table profile/inbound/status cells show DANGLING only for invalid bindings', () => {
    const mocks = { 'react-i18next': translated, '@shared/i18n/interface-text': uiText,
        '@shared/ui/hosts/always-available-host-badge': { AlwaysAvailableHostBadge: () => null } }
    mocks['@shared/ui'] = load('shared/ui/datatable/cells.tsx', mocks)
    const { getHostsTableColumns } = load('widgets/dashboard/hosts/hosts-datatable/use-hosts-table-widget.tsx', mocks)
    const render = element => renderToStaticMarkup(React.createElement(mantine.MantineProvider, {}, element))
    for (const [name, value, profiles] of [['valid', binding, [profile]], ...invalid]) {
        const valid = name === 'valid'
        const filters = { context: { configProfiles: profiles }, selectOptions: {}, selectFilters: {}, booleanFilters: {}, textQueries: {}, selectedStatuses: [] }
        const columns = getHostsTableColumns(translation, () => {}, filters)
        const item = { ...host, inbound: value }
        for (const accessor of ['inbound.configProfileUuid', 'inbound.configProfileInboundUuid']) {
            const html = render(columns.find(column => column.accessor === accessor).render(item))
            assert.equal(html.includes('interface.dangling-1f52ec3'), !valid, name + ' ' + accessor)
            if (valid) assert.ok(html.includes(accessor.endsWith('InboundUuid') ? inbound.tag : profile.name))
        }
        const status = elements(columns.find(column => column.accessor === 'isDisabled').render(item))
        assert.equal(status.some(element => element.props.color === 'red'), !valid, name)
        assert.equal(status.some(element => element.props.color === 'teal'), valid, name)
        if (!valid) assert.ok(status.some(element => element.props.role === 'img' &&
            element.props['aria-label'] === 'interface.dangling-1f52ec3'), name)
    }
})
