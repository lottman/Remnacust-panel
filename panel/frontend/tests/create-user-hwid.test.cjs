const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const { CreateUserCommand, USERS_STATUS } = require('../vendor/backend-contract')

function load(file, mocks) {
    const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText
    const ref = { exports: {} }
    new Function('require', 'module', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), ref, ref.exports)
    return ref.exports
}
function children(value) {
    if (Array.isArray(value)) return value.flatMap(children)
    return value?.props ? [value, ...children(value.props.children)] : []
}
const freezeSchedule = load('shared/ui/forms/users/forms-components/freeze-schedule-field.tsx', {})

function setup() {
    let values, submit, payload
    const form = {
        getValues: () => values,
        getInputProps: () => ({}), key: key => key,
        setFieldValue: (key, value) => { values[key] = value },
        onSubmit: callback => { submit = callback; return () => callback(values) }
    }
    const { CreateUserModal } = load('shared/_modals/users/create-user-modal/create-user.modal.tsx', {
        '@ebay/nice-modal-react': { __esModule: true, default: { create: component => component }, useModal: () => ({}) },
        '@mantine/form': { schemaResolver: () => () => ({}), useForm: options => { values = { ...options.initialValues, username: 'test_hwid_user' }; return form } },
        '@remnawave/backend-contract': { CreateUserCommand, USERS_STATUS },
        'motion/react': { motion: { div: 'div', create: () => 'div' } },
        'react-i18next': { useTranslation: () => ({ t: key => key }) },
        '@shared/_modals/use-nice-modal': { useNiceMantineModal: () => ({ modalProps: {}, hide() {} }) },
        '@shared/api': { queryClient: {} },
        '@shared/api/hooks': { useCreateUser: () => ({ mutate: request => { payload = request.variables } }), useGetExternalSquads: () => ({}), useGetInternalSquads: () => ({}), useGetUserTags: () => ({}) },
        '@shared/hooks': { useIsMobile: () => false },
        '@shared/ui/forms/users/forms-components': new Proxy({}, { get: (_, name) => String(name) }),
        '@shared/ui/forms/users/forms-components/freeze-schedule-field': freezeSchedule,
        '@shared/ui/forms/users/user-form-layout': { UserFormLayout: 'layout' },
        '@shared/ui/loader-modal': { LoaderModalShared: 'loader' },
        '@shared/ui/modal-footer': { ModalFooter: 'footer' },
        '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: 'header' },
        '@shared/utils/misc': { handleFormErrors() {} }
    })
    CreateUserModal()
    const { DeviceTagSettingsCard } = load('shared/ui/forms/users/forms-components/device-tag-settings-card.tsx', {
        'react-i18next': { useTranslation: () => ({ t: key => key }), Trans: 'trans' },
        '@shared/i18n/interface-text': { useUiText: () => key => key },
        '@shared/ui/createable-tag-input/createable-tag-input': { CreateableTagInputShared: 'tags' },
        '@shared/ui/flag-picker/flag-picker': { FlagTextarea: 'textarea' },
        '@shared/ui/overlays/base-overlay-header': { BaseOverlayHeader: 'header' },
        '@shared/ui/section-card': { SectionCard: { Root: 'root', Section: 'section' } }
    })
    const change = checked => {
        const tree = DeviceTagSettingsCard({ form, cardVariants: {}, motionWrapper: 'div' })
        children(tree).find(element => element.props.label === 'create-user-modal.widget.disable-hwid-limit').props.onChange({ currentTarget: { checked } })
    }
    return { form, change, submit: () => submit(values), payload: () => payload }
}

test('checking then unchecking Disable HWID Limit produces a valid create request using the inherited limit', async () => {
    const f = setup()
    f.change(true)
    assert.equal(f.form.getValues().hwidDeviceLimit, 0)
    f.change(false)
    await f.submit()
    assert.equal(f.payload().hwidDeviceLimit, undefined)
    assert.equal(CreateUserCommand.RequestBodySchema.safeParse(f.payload()).success, true)
})

test('create preserves explicit zero and positive limits, and clearing the number input uses the inherited limit', async () => {
    for (const value of [undefined, '', 0, 1, 12]) {
        const f = setup()
        f.form.setFieldValue('hwidDeviceLimit', value)
        await f.submit()
        assert.equal(f.payload().hwidDeviceLimit, value === '' ? undefined : value)
        assert.equal(CreateUserCommand.RequestBodySchema.safeParse(f.payload()).success, true)
    }
})
