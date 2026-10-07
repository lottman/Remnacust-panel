const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const compiled = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src/shared/api/helpers/handler-request-error.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText

function handler(language) {
    const locale = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', language, 'remnawave.json'), 'utf8'))
    const exports = {}
    vm.runInNewContext(compiled, {
        exports,
        require(name) {
            if (name === 'axios') return { isAxiosError: error => error?.isAxiosError === true }
            if (name === 'consola/browser') return { consola: { log() {}, error() {} } }
            if (name === 'zod') return { ZodError: class extends Error {} }
            if (name === 'i18next') return { default: { t(key, values = {}) {
                const value = key.split('.').reduce((part, name) => part?.[name], locale)
                assert.equal(typeof value, 'string', `${language}: ${key}`)
                return value.replace('{{status}}', String(values.status ?? ''))
            } } }
            throw Error(`Unexpected dependency: ${name}`)
        }
    })
    return { handle: exports.handleRequestError, locale }
}

for (const language of ['en', 'ru', 'fa', 'zh']) {
    test(`${language}: duplicate template names show a translated explanation`, () => {
        const { handle, locale } = handler(language)
        for (const status of [400, 409]) {
            const data = { errorCode: 'A176', message: 'Do not display raw server content' }
            assert.throws(() => handle({ isAxiosError: true, response: { status, data } }), error => {
                assert.equal(error.message, locale.requestErrors.templateNameExists + ' [A176]')
                assert.equal(error.cause, data)
                return true
            })
        }
    })

    test(`${language}: authentication and server errors retain safe generic messages`, () => {
        const { handle, locale } = handler(language)
        for (const status of [401, 403, 500, 503]) {
            assert.throws(() => handle({ isAxiosError: true, response: { status,
                data: { errorCode: 'A176', message: 'Private database detail' } } }), error => {
                assert.ok(!error.message.includes(locale.requestErrors.templateNameExists))
                assert.ok(!error.message.includes('Private database detail'))
                return true
            })
        }
        assert.throws(() => handle({ isAxiosError: true, response: { status: 400,
            data: { errorCode: 'A231', message: 'Private database detail' } } }), error => {
            assert.equal(error.message, locale.requestErrors['http-status'].replace('{{status}}', '400') + ' [A231]')
            return true
        })
    })
}
