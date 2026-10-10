const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const { z, ZodError } = require('zod')

function load(file, dependencies) {
    const exports = {}
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/api', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText, { exports, require: name => dependencies[name] ?? require(name) })
    return exports
}

for (const language of ['en', 'ru', 'fa', 'zh']) {
    test(`${language}: mutation boundaries reject invalid requests and responses with localized messages`, async () => {
        const locale = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', language, 'remnawave.json'), 'utf8'))
        const translation = { t: key => key.split('.').reduce((entry, name) => entry[name], locale) }
        const { handleRequestError } = load('helpers/handler-request-error.ts', {
            i18next: translation, 'consola/browser': { consola: { log() {}, error() {} } }
        })
        let options, networkCalls = 0, response = { response: { name: 'Valid response' } }
        const { createMutationHook } = load('tsq-helpers/create-mutation-hook.ts', {
            i18next: translation,
            '@tanstack/react-query': { useQueryClient: () => ({}), useMutation: value => { options = value; return value } },
            '../axios': { instance: { request: async () => { networkCalls++; return { data: response } } } },
            '../helpers': { handleRequestError, createUrl: url => url },
            '../limit-invalidation': { affectsLimits: () => false, invalidateLimits() {} }
        })
        createMutationHook({ endpoint: '/hosts', requestMethod: 'PATCH',
            bodySchema: z.object({ inbound: z.object({ configProfileInboundUuid: z.uuid() }) }),
            responseSchema: z.object({ response: z.object({ name: z.string() }) }) })()
        await assert.rejects(options.mutationFn({ variables: { inbound: { configProfileInboundUuid: '' } } }), error => {
            assert.equal(error.message, locale.requestErrors.invalidRequest)
            assert.ok(error.cause instanceof ZodError)
            assert.ok(!error.message.includes('pattern'))
            return true
        })
        assert.equal(networkCalls, 0)
        const variables = { inbound: { configProfileInboundUuid: '8b5b79c5-234d-41c9-ab46-435f5154671e' } }
        assert.equal((await options.mutationFn({ variables })).name, 'Valid response')
        assert.equal(networkCalls, 1)
        response = { response: { name: 123 } }
        await assert.rejects(options.mutationFn({ variables }), error => {
            assert.equal(error.message, locale.requestErrors.invalidResponse)
            assert.ok(error.cause instanceof ZodError)
            assert.ok(!error.message.includes('pattern'))
            return true
        })
        assert.equal(networkCalls, 2)
    })
}
