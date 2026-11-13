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
        Error,
        require(name) {
            if (name === 'axios') return { isAxiosError: error => error?.isAxiosError === true }
            if (name === '@remnawave/backend-contract') return { ERRORS }
            if (name === 'consola/browser') return { consola: { log() {}, error() {} } }
            if (name === 'zod') return { ZodError: class extends Error {} }
            if (name === 'i18next') return { __esModule: true, default: { t(key, values = {}) {
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
            assert.equal(typeof locale.requestErrors.codes[entry.code], 'string', `${language}: missing ${entry.code}`)
            assert.notEqual(message, entry.message + ` [${entry.code}]`)
        }
        for (const code of ['A113', 'A114']) {
            assert.equal(getMessage({ response: { status: 409, data: { errorCode: code } } }), locale.requestErrors.codes[code] + ` [${code}]`)
        }
    })
    test(`${language}: validation reasons, timeouts and colliding legacy codes are localized without leaking server text`, () => {
        const { getMessage, locale } = handler(language)
        const message = (reason, status = 422) => getMessage({ response: { status, data: { errorCode: 'A061', message: reason } } })
        assert.equal(message('Duplicate inbound tag "EU-1" found. All inbound tags must be unique.'), locale.requestErrors.validation.duplicateTag.replace('{{tag}}', 'EU-1') + ' [A061]')
        for (const [reason, key] of [
            ['Invalid JSON input.', 'json'], ["Config doesn't have inbounds.", 'inbounds'], ["Config doesn't have outbounds.", 'outbounds'],
            ['All inbounds must have a unique tag.', 'tagRequired'], ["Character ',' is not allowed in inbound tag.", 'tagComma'],
            ['Each inbound must be an object.', 'inboundObject'], ['Shadowsocks settings are required.', 'ssSettings'],
            ['The masque transport requires the masque protocol.', 'masqueProtocol'], ['MASQUE requires network masque and TLS security.', 'masqueTls']
        ]) assert.equal(message(reason), locale.requestErrors.validation[key] + ' [A061]')
        for (const reason of ['PRIVATE_SQL password=secret', 'x'.repeat(3000), '<script>PRIVATE_SECRET</script>']) {
            assert.equal(message(reason), locale.requestErrors.codes.A061 + ' [A061]')
        }
        for (const [code, status, key] of [['A089', 400, 'A089_400'], ['A219', 404, 'A219_404']]) {
            assert.equal(getMessage({ response: { status, data: { errorCode: code } } }), locale.requestErrors.statusCodes[key] + ` [${code}]`)
        }
        assert.equal(getMessage({ code: 'ETIMEDOUT' }), locale.requestErrors.timeout)
        assert.equal(getMessage({ code: 'ECONNABORTED' }), locale.requestErrors.timeout)
        assert.equal(getMessage({ code: 'ERR_CANCELED' }), locale.requestErrors.canceled)
        assert.equal(message('GEOFILES_REQUIRE_BASE_JSON'), locale.geofiles['requires-json'] + ' [A061]')
        assert.equal(message('GEOFILES_SYSTEM_DISABLED'), locale.geofiles['system-disabled'] + ' [A061]')
        assert.equal(message('GEOFILES_PER_TEMPLATE'), locale.requestErrors.features.geofilesPerTemplate + ' [A061]')
        for (const field of ['code', 'message', 'errorCode']) {
            assert.equal(getMessage({ response: { status: 409, data: { [field]: 'CUSTOM_XRAY_REQUIRED' } } }), locale.requestErrors.features.customCore + ' [CUSTOM_XRAY_REQUIRED]')
        }
        assert.equal(getMessage({ response: { status: 409, data: { errorCode: 'A113', message: 'CUSTOM_XRAY_REQUIRED' } } }), locale.requestErrors.codes.A113 + ' [A113]')
        assert.equal(getMessage({ response: { status: 500, data: { code: 'CUSTOM_XRAY_REQUIRED', message: 'PRIVATE_SQL' } } }), locale.requestErrors.serverError + ' [CUSTOM_XRAY_REQUIRED]')
    })
    test(`${language}: unexpected request failures never show raw library or server messages`, () => {
        const {handle,locale,RequestError}=handler(language)
        const original = new Error('PRIVATE_SQL_OR_LIBRARY_DIAGNOSTIC')
        assert.throws(()=>handle(original),error=>error.message===locale.requestErrors.unknown && error.cause===original)
        const wrapped=new RequestError({response:{status:409,data:{errorCode:'A113'}}})
        assert.throws(()=>handle(wrapped),error=>error===wrapped)
        const invalid=new Error('PRIVATE_HTML');invalid.name='ApiResponseError'
        assert.throws(()=>handle(invalid),error=>error.message===locale.requestErrors.invalidResponse && error.cause===invalid)
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

test('actual backend Xray validation reasons are translated on every interface language', () => {
    const load = require('../../backend/tests/load-typescript.cjs')
    const { XRayConfig } = load(path.join(__dirname, '../../backend/src/common/helpers/xray-config/xray-config.validator.ts'), {
        '@common/utils/certs': {}, '@common/utils/flow/get-vless-flow': {}, '@modules/users/entities/users-for-config': {}
    })
    const base = () => ({ inbounds: [{ tag: 'EU-1', protocol: 'vless', port: 443 }], outbounds: [{ tag: 'direct', protocol: 'freedom' }] })
    const cases = [
        [() => null, 'format'], [() => '{', 'json'], [() => ({inbounds:[]}), 'inbounds'],
        [() => ({inbounds:[null]}), 'inboundObject'],
        [() => {const c=base();delete c.inbounds[0].tag;return c}, 'tagRequired'],
        [() => {const c=base();c.inbounds[0].tag='x,y';return c}, 'tagComma'],
        [() => {const c=base();c.inbounds.push({...c.inbounds[0]});return c}, 'duplicateTag'],
        [() => {const c=base();c.inbounds[0].protocol='unsupported';return c}, 'protocol'],
        [() => {const c=base();c.inbounds[0].streamSettings={network:'unsupported'};return c}, 'network'],
        [() => {const c=base();c.inbounds[0].streamSettings={network:4};return c}, 'networkString'],
        [() => {const c=base();c.inbounds[0].streamSettings=[];return c}, 'streamObject'],
        [() => {const c=base();c.inbounds[0].protocol='shadowsocks';return c}, 'ssSettings'],
        [() => {const c=base();Object.assign(c.inbounds[0],{protocol:'shadowsocks',settings:{method:'unsupported'}});return c}, 'ssMethod'],
        [() => {const c=base();Object.assign(c.inbounds[0],{protocol:'shadowsocks',settings:{method:'2022-blake3-aes-128-gcm'}});return c}, 'ssPassword'],
        [() => {const c=base();Object.assign(c.inbounds[0],{protocol:'shadowsocks',settings:{method:'2022-blake3-aes-128-gcm',password:'x'}});return c}, 'ssKey']
    ]
    for (const [config, key] of cases) {
        let reason
        try { new XRayConfig(config()) } catch (error) { reason=error.message }
        assert.equal(typeof reason, 'string', key)
        for (const lang of ['ru','en','fa','zh']) {
            const {getMessage,locale}=handler(lang)
            const expected=locale.requestErrors.validation[key].replace('{{tag}}','EU-1')+' [A061]'
            assert.equal(getMessage({response:{status:422,data:{errorCode:'A061',message:reason}}}),expected,`${lang}: ${key}`)
        }
    }
})

test('query notifications and mutation errors share descriptions; unauthorized errors remain suppressed', () => {
    const { getMessage, RequestError } = handler('ru')
    const messages = []
    const maintenance = require('../../backend/tests/load-typescript.cjs')(path.join(__dirname, '../src/shared/utils/panel-maintenance.ts'))
    const exports = {}
    const notificationSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/api/tsq-helpers/error-handler.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(notificationSource, { exports, require(name) {
        if (name === '@mantine/notifications') return { notifications: { show: message => messages.push(message) } }
        if (name === 'axios') return { isAxiosError: error => error?.isAxiosError === true }
        if (name === 'i18next') return { __esModule: true, default: { t: key => key } }
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
