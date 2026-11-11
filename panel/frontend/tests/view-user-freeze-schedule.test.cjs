const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadComponent(relative, mocks = {}) {
    const filename = path.join(__dirname, '../src', relative)
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true
        }
    }).outputText
    const ref = { exports: {} }
    new Function('require', 'module', 'exports', compiled)(
        name => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
        ref,
        ref.exports
    )
    return ref.exports
}

function elements(value) {
    if (Array.isArray(value)) return value.flatMap(elements)
    return value?.props ? [value, ...elements(value.props.children)] : []
}

const { validFreezeDeadline } = loadComponent(
    'shared/ui/forms/users/forms-components/freeze-schedule-field.tsx'
)

function fixture(status = 'FROZEN', frozenUntil = null) {
    const user = {
        id: 42,
        status,
        frozenUntil,
        expireAt: new Date('2099-01-01T00:00:00Z'),
        activeInternalSquads: [],
        userTraffic: { lastConnectedNodeUuid: null }
    }
    const requests = []
    const effects = []
    const errors = {}
    let values = {}
    let touched = {}
    const form = {
        initialize: initial => {
            values = { ...initial }
        },
        getValues: () => values,
        getTouched: () => touched,
        setTouched: next => {
            touched = next
        },
        setFieldValue: (key, value) => {
            values[key] = value
            touched[key] = true
        },
        setFieldError: (key, value) => {
            errors[key] = value
        },
        resetTouched: () => {
            touched = {}
        },
        onSubmit: callback => () => callback(values)
    }
    const { ViewUserModalContent } = loadComponent(
        'shared/_modals/users/view-user-modal/view-user.modal.content.tsx',
        {
            react: { useEffect: callback => effects.push(callback) },
            '@mantine/core': {
                Button: 'button',
                Stack: 'stack',
                px: value => value,
                Menu: Object.assign(() => null, {
                    Target: 'target',
                    Dropdown: 'dropdown',
                    Label: 'label',
                    Divider: 'divider'
                })
            },
            '@mantine/form': {
                useForm: () => form,
                schemaResolver: () => () => ({})
            },
            'motion/react': { motion: { div: 'div', create: () => 'stack' } },
            'react-i18next': { useTranslation: () => ({ t: key => key }) },
            '@features/ui/dashboard/users/delete-user': { DeleteUserFeature: 'delete-user' },
            '@features/ui/dashboard/users/reset-usage-user': { ResetUsageUserFeature: 'reset-user' },
            '@features/ui/dashboard/users/revoke-subscription-user': {
                RevokeSubscriptionUserFeature: 'revoke-user'
            },
            '@features/ui/dashboard/users/toggle-user-status-button': {
                ToggleUserStatusButtonFeature: 'toggle-user'
            },
            '@shared/api': { queryClient: {} },
            '@shared/api/hooks': {
                useGetExternalSquads: () => ({ data: { externalSquads: [] } }),
                useGetInternalSquads: () => ({ data: { internalSquads: [] } }),
                useGetNodes: () => ({ data: [] }),
                useGetUserById: () => ({ data: user }),
                useGetUserTags: () => ({ data: [] }),
                useUpdateUser: () => ({ mutate: request => requests.push(request.variables) }),
                usersQueryKeys: {}
            },
            '@shared/hooks': { useIsMobile: () => false },
            '@shared/ui/forms/users/forms-components': {
                AccessSettingsCard: 'access',
                ContactInformationCard: 'contact',
                DeviceTagSettingsCard: 'device',
                TrafficLimitsCard: 'traffic',
                UserIdentificationCard: 'identification'
            },
            '@shared/ui/forms/users/forms-components/freeze-schedule-field': {
                validFreezeDeadline
            },
            '@shared/ui/forms/users/user-form-layout': { UserFormLayout: 'layout' },
            '@shared/ui/loader-modal': { LoaderModalShared: 'loader' },
            '@shared/ui/modal-footer': { ModalFooter: 'footer' },
            '@shared/utils/misc': { handleFormErrors() {} }
        }
    )
    const tree = elements(ViewUserModalContent({ userId: user.id }))
    effects.forEach(effect => effect())
    const save = tree.find(element => element.props.children === 'common.action.save')
    const toggle = tree.find(element => element.type === 'toggle-user')
    return { user, form, errors, requests, freeze: toggle.props.onFreeze, save: save.props.onClick }
}

test('legacy indefinite freeze permits metadata saves without assigning a deadline or changing status', async () => {
    const state = fixture()
    state.form.setFieldValue('description', 'Updated note')
    await state.save()
    assert.equal(state.requests.length, 1)
    assert.equal(state.requests[0].description, 'Updated note')
    assert.equal(state.requests[0].status, undefined)
    assert.equal(state.requests[0].frozenUntil, undefined)
    assert.deepEqual(state.errors, {})
    assert.equal(state.user.status, 'FROZEN')
    assert.equal(state.user.frozenUntil, null)
})

test('entering FROZEN remains a local draft and requires a valid future deadline', async () => {
    for (const status of ['ACTIVE', 'DISABLED']) {
        for (const value of [undefined, null, 'invalid', new Date(0), new Date()]) {
            const state = fixture(status)
            state.freeze()
            assert.equal(state.requests.length, 0)
            state.form.setFieldValue('frozenUntil', value)
            await state.save()
            assert.equal(state.requests.length, 0)
            assert.equal(state.errors.frozenUntil, 'frozen-user.until-invalid')
        }
    }
})

test('a new freeze submits its status and selected future deadline together', async () => {
    const state = fixture('ACTIVE')
    const deadline = new Date(Date.now() + 86400000)
    state.freeze()
    state.form.setFieldValue('frozenUntil', deadline)
    await state.save()
    assert.equal(state.requests.length, 1)
    assert.equal(state.requests[0].status, 'FROZEN')
    assert.equal(state.requests[0].frozenUntil, deadline)
    assert.deepEqual(state.errors, {})
})

test('legacy freezes can explicitly receive their first future deadline without a status change', async () => {
    const state = fixture()
    const deadline = new Date(Date.now() + 86400000)
    state.form.setFieldValue('frozenUntil', deadline)
    await state.save()
    assert.equal(state.requests.length, 1)
    assert.equal(state.requests[0].status, undefined)
    assert.equal(state.requests[0].frozenUntil, deadline)
    assert.deepEqual(state.errors, {})
})

test('an explicitly edited first deadline cannot be empty, invalid or in the past', async () => {
    for (const value of [undefined, null, 'invalid', new Date(0)]) {
        const state = fixture()
        state.form.setFieldValue('frozenUntil', value)
        await state.save()
        assert.equal(state.requests.length, 0)
        assert.equal(state.errors.frozenUntil, 'frozen-user.until-invalid')
    }
})

test('saved deadlines are omitted from unrelated updates even after their date has elapsed', async () => {
    const state = fixture('FROZEN', new Date(0))
    state.form.setFieldValue('description', 'Keep the saved schedule')
    await state.save()
    assert.equal(state.requests.length, 1)
    assert.equal(state.requests[0].frozenUntil, undefined)
    assert.equal(state.requests[0].status, undefined)
    assert.deepEqual(state.errors, {})
})

test('an explicit transition out of a legacy freeze does not require a new freeze deadline', async () => {
    const state = fixture()
    state.form.setFieldValue('status', 'ACTIVE')
    await state.save()
    assert.equal(state.requests.length, 1)
    assert.equal(state.requests[0].status, 'ACTIVE')
    assert.equal(state.requests[0].frozenUntil, undefined)
    assert.deepEqual(state.errors, {})
})
