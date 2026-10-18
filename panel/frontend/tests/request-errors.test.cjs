const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { ERRORS } = require('../../backend/libs/contract/build/backend/constants/errors/errors.js')
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
            if (name === '@remnawave/backend-contract') return { ERRORS }
            if (name === 'consola/browser') return { consola: { log() {}, error() {} } }
            if (name === 'zod') return { ZodError: class extends Error {} }
            if (name === 'i18next') return { default: { t(key, values = {}) {
                const value = key.split('.').reduce((part, name) => part?.[name], locale) ?? values.defaultValue
                assert.equal(typeof value, 'string', `${language}: ${key}`)
                return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''))
            } } }
            throw Error(`Unexpected dependency: ${name}`)
        }
    })
    return { handle: exports.handleRequestError, getMessage: exports.getRequestErrorMessage, RequestError: exports.RequestError, locale }
}

for (const language of ['en', 'ru', 'fa', 'zh']) {
    test(`${language}: config validation explains the missing protocol and preserves the cause`, () => {
        const { handle, locale } = handler(language)
        const data = { errorCode: 'A061', message: 'Inbound "SERVICE": field "protocol" is required.' }
        assert.throws(() => handle({ isAxiosError: true, response: { status: 422, data } }), error => {
            assert.equal(error.message, locale.requestErrors.protocolRequired.replace('{{tag}}', 'SERVICE') + ' [A061]')
            assert.equal(error.cause, data)
            return true
        })
        assert.throws(() => handle({ isAxiosError: true, response: { status: 500, data } }), error => {
            assert.ok(!error.message.includes('SERVICE'))
            return true
        })
    })
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
            assert.equal(error.message, locale.requestErrors.invalidRequest + ' [A231]')
            return true
        })
    })
    test(`${language}: tag and profile conflicts are actionable; all contract errors have a public description`, () => {
        const { getMessage, locale } = handler(language)
        for (const entry of Object.values(ERRORS)) {
            // A061 is the explicit, bounded configuration-validation detail path.
            const message = getMessage({ response: { status: entry.httpCode, data: { errorCode: entry.code, message: entry.code === 'A061' ? undefined : 'PRIVATE_SQL_OR_SECRET' } } })
            assert.ok(message.endsWith(` [${entry.code}]`))
            assert.ok(!message.includes('PRIVATE_SQL_OR_SECRET'))
            assert.ok(!message.includes('Request failed (HTTP'))
            assert.ok(!message.includes('requestErrors.codes.'))
        }
        for (const code of ['A113', 'A114']) {
            assert.equal(getMessage({ response: { status: 409, data: { errorCode: code } } }), locale.requestErrors.codes[code] + ` [${code}]`)
        }
    })
    test(`${language}: malformed, HTML and unknown responses stay safe and useful`, () => {
        const { getMessage, locale } = handler(language)
        for (const data of [null, '<html>PRIVATE_SECRET</html>', { errorCode: '__proto__', message: 'PRIVATE_SECRET' }]) {
            assert.equal(getMessage({ response: { status: 500, data } }), locale.requestErrors.serverError)
        }
        assert.equal(getMessage({ response: { status: 409, data: { errorCode: 'FUTURE_CONFLICT', message: 'PRIVATE_SECRET' } } }), locale.requestErrors.conflict + ' [FUTURE_CONFLICT]')
        assert.equal(getMessage({ response: { status: 429, data: {} } }), locale.requestErrors.rateLimited)
        assert.equal(getMessage({}), locale.requestErrors.unavailable)
    })
}

test('query notifications and mutation errors share descriptions; unauthorized errors remain suppressed', () => {
    const { getMessage, RequestError } = handler('ru')
    const messages = []
    const maintenance = require('../../backend/tests/load-typescript.cjs')(path.join(__dirname, '../src/shared/utils/panel-maintenance.ts'))
    const exports = {}
    const notificationSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/api/tsq-helpers/error-handler.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(notificationSource, { exports, require(name) {
        if (name === '@mantine/notifications') return { notifications: { show: message => messages.push(message) } }
        if (name === 'axios') return { isAxiosError: error => error?.isAxiosError === true }
        if (name === 'i18next') return { default: { t: key => key } }
        if (name === 'zod') return { ZodError: class extends Error {} }
        if (name === '../api-response') return { ApiResponseError: class extends Error {} }
        if (name === '../helpers/handler-request-error') return { getRequestErrorMessage: getMessage, RequestError }
        if (name === '@shared/utils/panel-maintenance') return maintenance
        throw Error(name)
    } })
    const raw = { isAxiosError: true, response: { status: 409, data: { errorCode: 'A113' } } }
    exports.errorHandler(raw, 'query')
    exports.errorHandler(new RequestError(raw), 'mutation')
    assert.equal(messages.length, 2)
    assert.equal(messages[0].message, messages[1].message)
    const unauthenticated = { isAxiosError: true, response: { status: 401, data: {} } }
    exports.errorHandler(unauthenticated, 'query')
    exports.errorHandler(new RequestError(unauthenticated), 'mutation')
    assert.equal(messages.length, 2)
    const updating = { isAxiosError: true, response: { status: 503, data: { errorCode: 'PANEL_UPDATING' } } }
    exports.errorHandler(updating, 'updating-query')
    exports.errorHandler(new RequestError(updating), 'updating-mutation')
    assert.equal(messages.length, 2)
    maintenance.setPanelMaintenance(true)
    exports.errorHandler(new RequestError({ code: 'ERR_NETWORK' }), 'restart-network')
    assert.equal(messages.length, 2)
    exports.errorHandler(raw, 'real-conflict')
    assert.equal(messages.length, 3)
    maintenance.setPanelMaintenance(false)
    exports.errorHandler(new RequestError({ code: 'ERR_NETWORK' }), 'real-network')
    assert.equal(messages.length, 4)
})
