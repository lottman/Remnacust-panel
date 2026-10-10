const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const mantine = require('@mantine/core')
const formLibrary = require('@mantine/form')
const contract = require('@remnawave/backend-contract')
const i18n = require('i18next')

const profileUuid = '0587cad8-1305-4127-ab2a-7e10c0981280'
const inboundUuid = '8b5b79c5-234d-41c9-ab46-435f5154671e'
const hostUuid = '1e17ad03-10f3-490d-b5be-6a997b23d441'
const profiles = [{ uuid: profileUuid, name: 'Profile', inbounds: [{ uuid: inboundUuid, port: 443 }] }]
const validInbound = { configProfileUuid: profileUuid, configProfileInboundUuid: inboundUuid }
const selectionMessage = 'Please select the config profile and inbound'
i18n.init({ lng: 'en', initImmediate: false, resources: { en: { translation: {
    'create-host-modal': { widget: { 'please-select-the-config-profile-and-inbound': selectionMessage } }
} } } })

function load(file, overrides = {}) {
    const exports = {}
    const filename = path.join(__dirname, '../src', file)
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText, { exports, require(name) {
        if (Object.hasOwn(overrides, name)) return overrides[name]
        if (name.endsWith('/validate-host-inbound')) return load('shared/ui/forms/hosts/base-host-form/validate-host-inbound.ts')
        if (name.endsWith('/domain-presets')) return load('shared/ui/forms/hosts/base-host-form/domain-presets.ts')
        if (name === '@shared/utils/destination-rule') return load('shared/utils/destination-rule.ts')
        if (name === '@shared/i18n/interface-text') return { translateUiText: key => key }
        return require(name)
    } })
    return exports
}

function renderForm(kind, inbound = validInbound) {
    let form, props
    const effects = [], requests = [], confirmations = []
    const host = { uuid: hostUuid, remark: 'Saved note', address: 'example.org', port: 1234,
        securityLayer: contract.SECURITY_LAYERS.DEFAULT, inbound }
    const componentFiles = {
        edit: ['shared/_modals/hosts/edit-host-modal/edit-host.modal.content.tsx', 'EditHostDrawerContent'],
        create: ['shared/_modals/hosts/create-host-drawer/create-host.modal.tsx', 'CreateHostDrawer'],
        bulk: ['shared/_modals/hosts/edit-many-hosts-drawer/edit-many-hosts.drawer.tsx', 'EditManyHostsDrawer']
    }
    const schemas = { edit: contract.UpdateHostCommand.RequestBodySchema,
        create: contract.CreateHostCommand.RequestBodySchema, bulk: contract.UpdateManyHostsCommand.RequestBodySchema }
    const [file, name] = componentFiles[kind]
    const component = load(file, {
        react: { ...React, useEffect: effect => effects.push(effect) },
        '@mantine/form': { ...formLibrary, useForm: options => (form = formLibrary.useForm(options)) },
        '@ebay/nice-modal-react': { __esModule: true, default: { create: component => component }, useModal: () => ({}) },
        '@shared/_modals/use-nice-modal': { useNiceMantineModal: () => ({ modalProps: {}, hide() {} }) },
        '@mantine/core': { ...mantine, Drawer: ({ children }) => children },
        '@mantine/modals': { modals: { openConfirmModal: options => confirmations.push(options) } },
        '@shared/api': { queryClient: { setQueryData() {}, refetchQueries() {} } },
        '@shared/api/hooks': new Proxy({}, { get: (_, name) => {
            const data = { useGetConfigProfiles: { configProfiles: profiles }, useGetNodes: [],
                useGetSubscriptionTemplates: { templates: [] }, useGetInternalSquads: { internalSquads: [] },
                useGetHostTags: { tags: [] } }
            if (name in data) return () => ({ data: data[name] })
            return () => ({ isPending: false, mutate: payload => {
                requests.push(schemas[kind].parse(payload.variables))
            } })
        } }),
        '@shared/ui/forms/hosts/base-host-form': { BaseHostForm: value => { props = value; return null } },
        '@shared/ui/forms/hosts/base-host-form/host-form-loading': { HostFormLoading: () => null },
        '@shared/ui': { LoadingScreen: () => null },
        '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: () => null },
        '@shared/utils/misc': { stringifyJsonField: value => value, parseJsonField: value => value },
        'react-i18next': { useTranslation: () => ({ t: key => key }) }
    })[name]
    renderToStaticMarkup(React.createElement(mantine.MantineProvider, null,
        React.createElement(component, { host, uuids: [hostUuid], onClose() {} })))
    effects.forEach(effect => effect())
    return { form, requests, confirmations, submit: () => props.handleSubmit() }
}

test('editing detached hosts omits missing bindings and preserves the saved port', async () => {
    for (const inbound of [{ configProfileUuid: null, configProfileInboundUuid: null },
        { configProfileUuid: profileUuid, configProfileInboundUuid: null }]) {
        const result = renderForm('edit', inbound)
        assert.equal(result.form.getValues().inbound, undefined)
        assert.equal(result.form.getValues().port, 1234)
        result.form.setFieldValue('remark', 'Updated note')
        await result.submit()
        assert.equal(result.requests.length, 1)
        assert.equal(result.requests[0].inbound, undefined)
        assert.equal(result.requests[0].port, 1234)
        assert.equal(result.requests[0].remark, 'Updated note')
    }
})

test('opening an attached host preserves its explicit port override', () => {
    const { form } = renderForm('edit')
    assert.equal(form.getValues().port, 1234)
    assert.deepEqual(JSON.parse(JSON.stringify(form.getValues().inbound)), validInbound)
})

for (const kind of ['edit', 'create', 'bulk']) {
    test(`${kind}: incomplete or stale inbound bindings cannot reach a mutation`, async () => {
        for (const inbound of [{ configProfileUuid: profileUuid, configProfileInboundUuid: '' },
            { configProfileUuid: profileUuid, configProfileInboundUuid: hostUuid },
            { configProfileUuid: hostUuid, configProfileInboundUuid: inboundUuid }]) {
            const result = renderForm(kind)
            result.form.setValues({ remark: 'Node', address: 'example.org', port: 443, inbound })
            assert.equal(result.form.validate().errors['inbound.configProfileInboundUuid'], selectionMessage)
            await result.submit()
            assert.equal(result.requests.length, 0)
            assert.equal(result.confirmations.length, 0)
        }
    })
    test(`${kind}: schema validation still rejects unrelated invalid fields`, async () => {
        const result = renderForm(kind)
        result.form.setValues({ remark: 'Node', address: 'example.org', port: 443, inbound: validInbound,
            speedLimitMbps: -1 })
        assert.ok(result.form.validate().errors.speedLimitMbps)
        await result.submit()
        assert.equal(result.requests.length, 0)
        assert.equal(result.confirmations.length, 0)
    })
}

test('creating a host requires an inbound; bulk metadata edits do not', async () => {
    const creating = renderForm('create')
    creating.form.setValues({ remark: 'Node', address: 'example.org', port: 443 })
    assert.equal(creating.form.validate().errors['inbound.configProfileInboundUuid'], selectionMessage)
    assert.equal(creating.form.validate().errors['inbound.configProfileUuid'], selectionMessage)
    await creating.submit()
    assert.equal(creating.requests.length, 0)
    const bulk = renderForm('bulk')
    bulk.form.setFieldValue('remark', 'Updated note')
    await bulk.submit()
    assert.equal(bulk.confirmations.length, 1)
    bulk.confirmations[0].onConfirm()
    assert.equal(bulk.requests.length, 1)
    assert.equal(bulk.requests[0].inbound, undefined)
})

function renderSelection(initialValues, configProfiles = profiles) {
    let form, picker
    const clearedErrors = []
    const passthrough = ({ children }) => children
    const BaseHostForm = load('shared/ui/forms/hosts/base-host-form/base-host-form.tsx', {
        'react-i18next': { useTranslation: () => ({ t: key => key, i18n }) },
        '@features/ui/dashboard/hosts/host-select-inbound/host-select-inbound.feature': {
            HostSelectInboundFeature: props => { picker = props; return null }
        },
        '@features/ui/dashboard/hosts/clone-host': { CloneHostFeature: () => null },
        '@features/ui/dashboard/hosts/delete-host': { DeleteHostFeature: () => null },
        '@shared/ui/drawer-footer': { DrawerFooter: passthrough },
        '@shared/ui/flag-picker/flag-picker': { FlagTextInput: mantine.TextInput },
        '@shared/ui/popovers': { TemplateInfoPopoverShared: () => null },
        '@shared/ui/popovers/popover-with-info': { PopoverWithInfoShared: () => null },
        '@shared/ui/section-card': { SectionCard: { Root: passthrough, Section: passthrough } },
        './host-limits-and-rules': { HostLimitsAndRules: () => null },
        './host-visibility': { HostVisibility: () => null },
        './json-fields': { getHostJsonFields: () => [] },
        './options': { HostFormDataProvider: passthrough, HostOptionsProvider: passthrough, HostOptionsSection: () => null }
    }).BaseHostForm
    function Harness() {
        form = formLibrary.useForm({ mode: 'uncontrolled', initialValues,
            initialDirty: { remark: true }, initialTouched: { remark: true } })
        const clearFieldError = form.clearFieldError
        form.clearFieldError = field => { clearedErrors.push(field); clearFieldError(field) }
        return React.createElement(BaseHostForm, { form, configProfiles, nodes: [], internalSquads: [],
            subscriptionTemplates: [], hostTags: [], handleSubmit() {}, isSubmitting: false })
    }
    renderToStaticMarkup(React.createElement(mantine.MantineProvider, null, React.createElement(Harness)))
    return { form, picker, clearedErrors }
}

test('inbound selection updates the pair and port without discarding other dirty/touched fields', () => {
    const { form, picker, clearedErrors } = renderSelection({ remark: 'Changed', port: 1234 })
    form.setFieldError('inbound.configProfileInboundUuid', selectionMessage)
    picker.onSaveInbound(inboundUuid, profileUuid)
    assert.deepEqual(JSON.parse(JSON.stringify(form.getValues().inbound)), validInbound)
    assert.equal(form.getValues().port, 443)
    assert.equal(form.isDirty('inbound'), true)
    assert.equal(form.isDirty('port'), true)
    assert.equal(form.isDirty('remark'), true)
    assert.equal(form.isTouched('remark'), true)
    assert.equal(form.isTouched('inbound'), true)
    assert.ok(clearedErrors.includes('inbound.configProfileInboundUuid'))
})

test('invalid selections are ignored; inbounds without a port preserve the explicit port', () => {
    const result = renderSelection({ remark: 'Changed', port: 1234 })
    result.picker.onSaveInbound(hostUuid, profileUuid)
    assert.equal(result.form.getValues().inbound, undefined)
    assert.equal(result.form.getValues().port, 1234)
    const noPort = renderSelection({ port: 1234 }, [{ ...profiles[0], inbounds: [{ uuid: inboundUuid, port: null }] }])
    noPort.picker.onSaveInbound(inboundUuid, profileUuid)
    assert.equal(noPort.form.getValues().port, 1234)
})
