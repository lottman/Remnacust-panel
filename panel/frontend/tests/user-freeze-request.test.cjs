const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const contract = require('../vendor/backend-contract')

function load(file, dependencies = {}) {
    const ref = { exports: {} }
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true
        }
    }).outputText
    new Function('require', 'module', 'exports', compiled)(
        name => {
            if (Object.hasOwn(dependencies, name)) return dependencies[name]
            if (name === './user-freeze-request') return load('shared/api/hooks/users/user-freeze-request.ts')
            return require(name)
        },
        ref,
        ref.exports
    )
    return ref.exports
}

const cases = [
    ['useCreateUser', contract.CreateUserCommand, frozenUntil => ({ username: 'freeze_request', expireAt: '2099-01-01T00:00:00Z', status: 'FROZEN', frozenUntil })],
    ['useUpdateUser', contract.UpdateUserCommand, frozenUntil => ({ id: 1, status: 'FROZEN', frozenUntil })],
    ['useBulkUpdateUsers', contract.BulkUpdateUsersCommand, frozenUntil => ({ userIds: [1, 2], fields: { status: 'FROZEN', frozenUntil } })],
    ['useBulkAllUpdateUsers', contract.BulkAllUpdateUsersCommand, frozenUntil => ({ status: 'FROZEN', frozenUntil })]
]

function fixture() {
    const requests = []
    const translation = { t: key => key }
    const factory = load('shared/api/tsq-helpers/create-mutation-hook.ts', {
        i18next: translation,
        '@tanstack/react-query': { useQueryClient: () => ({}), useMutation: value => value },
        '../axios': { instance: { request: async request => { requests.push(request); throw new Error('fixture HTTP boundary') } } },
        '../helpers': { createUrl: url => url, handleRequestError: error => { throw error } },
        '../host-invalidation': { affectsHosts: () => false },
        '../limit-invalidation': { affectsLimits: () => false }
    })
    const hooks = load('shared/api/hooks/users/users.mutation.hooks.ts', {
        i18next: translation,
        '@remnawave/backend-contract': contract,
        '@mantine/notifications': { notifications: { show() {} } },
        '@shared/utils/translate-mutation-message': { translateMutationMessage: value => value },
        '../../tsq-helpers': factory
    })
    return { hooks, requests }
}

for (const [name, command, variables] of cases) {
    test(`${name}: picker Date reaches HTTP and round-trips through the real API schema`, async () => {
        for (const input of [new Date('2090-11-20T18:37:00+03:00'), '2090-11-20T18:37:00+03:00']) {
            const state = fixture()
            await assert.rejects(state.hooks[name]().mutationFn({ variables: variables(input) }), { message: 'fixture HTTP boundary' })
            assert.equal(state.requests.length, 1)
            const wire = JSON.parse(JSON.stringify(state.requests[0].data))
            const result = command.RequestBodySchema.parse(wire)
            assert.equal((result.fields ?? result).frozenUntil.toISOString(), '2090-11-20T15:37:00.000Z')
            assert.equal(input instanceof Date ? input.toISOString() : input, input instanceof Date ? '2090-11-20T15:37:00.000Z' : '2090-11-20T18:37:00+03:00')
        }
    })

    test(`${name}: invalid Dates and timezone-less strings remain rejected before HTTP`, async () => {
        for (const input of [new Date(NaN), 'invalid', '2090-11-20T18:37:00', 3814840620000]) {
            const state = fixture()
            await assert.rejects(state.hooks[name]().mutationFn({ variables: variables(input) }), { message: 'requestErrors.invalidRequest' })
            assert.equal(state.requests.length, 0)
        }
    })

    test(`${name}: null and absent deadlines retain the existing contract`, async () => {
        for (const input of [null, undefined]) {
            const state = fixture()
            await assert.rejects(state.hooks[name]().mutationFn({ variables: variables(input) }), { message: 'fixture HTTP boundary' })
            const body = state.requests[0].data
            assert.equal((body.fields ?? body).frozenUntil, input)
        }
    })
}

test('freeze input adaptation retains required identity and bulk size validation', async () => {
    const state = fixture()
    const frozenUntil = new Date('2090-11-20T18:37:00+03:00')
    for (const [name, variables] of [
        ['useUpdateUser', { status: 'FROZEN', frozenUntil }],
        ['useBulkUpdateUsers', { userIds: [], fields: { status: 'FROZEN', frozenUntil } }],
        ['useBulkUpdateUsers', { userIds: Array(501).fill(1), fields: { status: 'FROZEN', frozenUntil } }]
    ]) await assert.rejects(state.hooks[name]().mutationFn({ variables }), { message: 'requestErrors.invalidRequest' })
    assert.equal(state.requests.length, 0)
})
