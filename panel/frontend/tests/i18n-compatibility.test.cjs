const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const dayjs = require('dayjs')
const i18next = require('i18next')
const LanguageDetector = require('i18next-browser-languagedetector')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { I18nextProvider, Trans, useTranslation } = require('react-i18next')
const { ERRORS } = require('../../backend/libs/contract/build/backend/constants/errors/errors.js')

const root = path.resolve(__dirname, '..')
const languages = ['en', 'ru', 'fa', 'zh']
const dictionaries = Object.fromEntries(
    languages.map((language) => [
        language,
        JSON.parse(fs.readFileSync(path.join(root, 'public/locales', language, 'remnawave.json'), 'utf8'))
    ])
)

function loadSource(relative, dependencies, globals = {}) {
    const filename = path.join(root, relative)
    const exports = {}
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true
        }
    }).outputText
    vm.runInNewContext(compiled, {
        exports,
        require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
        ...globals
    }, { filename })
    return exports
}

async function initialize(language, translations = dictionaries) {
    const instance = i18next.createInstance()
    const requests = []
    class StoredLanguageDetector extends LanguageDetector {
        init(...args) {
            super.init(...args)
            for (const name of this.options.order) {
                this.addDetector({
                    name,
                    lookup: () => name === 'localStorage' ? language : undefined,
                    cacheUserLanguage() {}
                })
            }
        }
    }
    const init = instance.init.bind(instance)
    let initialized
    instance.init = (options) => {
        initialized = init(options)
        return initialized
    }
    loadSource('src/app/i18n/i18n.ts', {
        i18next: instance,
        'i18next-browser-languagedetector': StoredLanguageDetector,
        'i18next-http-backend': {
            type: 'backend',
            init() {},
            read(language, namespace, callback) {
                requests.push([language, namespace])
                callback(null, translations[language] ?? {})
            }
        },
        '../../../public/locales/en/remnawave.json': dictionaries.en
    }, {
        process: { env: { NODE_ENV: 'test' } },
        __LOCALE_VERSION__: 'i18n-test'
    })
    await initialized
    const errors = loadSource('src/shared/api/helpers/handler-request-error.ts', {
        i18next: instance,
        '@remnawave/backend-contract': { ERRORS }
    })
    return { instance, requests, ...errors }
}

for (const [language, detected] of [['en', 'en-US'], ['ru', 'ru-RU'], ['fa', 'fa-IR'], ['zh', 'zh-CN']]) {
    test(`${language}: detected locales retain translated errors, React text and date locale`, async () => {
        const { instance, requests, getRequestErrorMessage } = await initialize(detected)
        const dictionary = dictionaries[language]
        assert.equal(instance.resolvedLanguage, language)
        assert.equal(dayjs.locale(), language)
        assert.equal(instance.dir(), language === 'fa' ? 'rtl' : 'ltr')
        assert.deepEqual(requests, language === 'en' ? [] : [[language, 'remnawave']])
        assert.equal(instance.options.react.useSuspense, true)
        assert.equal(instance.services.interpolator.interpolate(instance.options.backend.loadPath, {
            lng: language,
            ns: 'remnawave'
        }), `/locales/${language}/remnawave.json?v=i18n-test`)
        const tag = 'EU-1 <img src=x> & edge/core'
        assert.equal(getRequestErrorMessage({ response: {
            status: 422,
            data: { errorCode: 'A061', message: `Inbound "${tag}": field "protocol" is required.` }
        } }), dictionary.requestErrors.protocolRequired.replace('{{tag}}', tag) + ' [A061]')
        assert.equal(getRequestErrorMessage({ response: {
            status: 500,
            data: { message: 'PRIVATE_SERVER_DETAIL' }
        } }), dictionary.requestErrors.serverError)
        assert.equal(getRequestErrorMessage({ code: 'ETIMEDOUT' }), dictionary.requestErrors.timeout)
        assert.equal(getRequestErrorMessage({ response: {
            status: 409,
            data: { errorCode: 'A113', message: 'PRIVATE_SERVER_DETAIL' }
        } }), dictionary.requestErrors.codes.A113 + ' [A113]')
        assert.equal(getRequestErrorMessage({ response: {
            status: 400,
            data: { errorCode: 'A089' }
        } }), dictionary.requestErrors.statusCodes.A089_400 + ' [A089]')
        function Message() {
            const { t } = useTranslation()
            return React.createElement('span', null, t('requestErrors.protocolRequired', { tag }))
        }
        const render = (child) => renderToStaticMarkup(
            React.createElement(I18nextProvider, { defaultNS: '', i18n: instance }, child)
        )
        const text = dictionary.requestErrors.protocolRequired.replace('{{tag}}', tag)
        assert.equal(render(React.createElement(Message)), renderToStaticMarkup(React.createElement('span', null, text)))
        assert.equal(render(React.createElement(Trans, {
            i18nKey: 'requestErrors.protocolRequired',
            values: { tag }
        })), renderToStaticMarkup(React.createElement(React.Fragment, null, text)))
    })
}

test('empty and missing translations fall back to English while explicit empty defaults stay empty', async () => {
    const russian = structuredClone(dictionaries.ru)
    russian.requestErrors.timeout = ''
    delete russian.requestErrors.serverError
    const { instance, getRequestErrorMessage } = await initialize('ru', { ...dictionaries, ru: russian })
    assert.equal(getRequestErrorMessage({ code: 'ETIMEDOUT' }), dictionaries.en.requestErrors.timeout)
    assert.equal(getRequestErrorMessage({ response: { status: 500 } }), dictionaries.en.requestErrors.serverError)
    assert.equal(instance.t('missing.translation', { defaultValue: '' }), '')
    assert.equal(instance.t('missing.translation', ''), '')
    assert.equal(instance.t('missing.translation'), 'missing.translation')
})

test('unsupported detected languages use English and language changes update translations and dates', async () => {
    const { instance, requests, getRequestErrorMessage } = await initialize('de-DE')
    assert.equal(instance.resolvedLanguage, 'en')
    for (const language of ['fa', 'zh', 'ru', 'en']) {
        await instance.changeLanguage(language)
        assert.equal(instance.resolvedLanguage, language)
        assert.equal(dayjs.locale(), language)
        assert.equal(getRequestErrorMessage({ code: 'ETIMEDOUT' }), dictionaries[language].requestErrors.timeout)
    }
    assert.ok(requests.every(([language]) => languages.includes(language)))
})

test('typed literal resources require interpolation options in core and React translation calls', () => {
    const fixturePath = path.join(root, 'tests/i18n-types.fixture.ts')
    const resourcesPath = path.join(root, '@types/resources.ts')
    const imports = [
        "import i18n, { type ParseKeysWithoutVariables, type TypeOptions } from 'i18next'",
        "import { initReactI18next, useTranslation } from 'react-i18next'",
        "const { t } = useTranslation('remnawave')"
    ]
    const cases = [
        ["const strict: true = null as unknown as TypeOptions['strictInterpolationChecks']", true],
        ["const empty: false = null as unknown as TypeOptions['returnEmptyString']", true],
        ["const emptyKey: 'emptyValue' = i18n.t('emptyValue')", true],
        ["i18n.use(initReactI18next).init({ react: { useSuspense: true } })", true],
        ["i18n.t('requestErrors.unavailable')", true],
        ["i18n.t('requestErrors.protocolRequired', { tag: 'EU-1' })", true],
        ["i18n.t('requestErrors.protocolRequired', { tag: 'EU-1', defaultValue: 'Protocol required' })", true],
        ["t('requestErrors.protocolRequired', { tag: 'EU-1' })", true],
        ["const label = (key: ParseKeysWithoutVariables) => t(key)", true],
        ["i18n.t('requestErrors.protocolRequired')", false],
        ["i18n.t('requestErrors.protocolRequired', {})", false],
        ["i18n.t('requestErrors.protocolRequired', { lng: 'en' })", false],
        ["i18n.getFixedT('en')('requestErrors.protocolRequired')", false],
        ["const key = null as unknown as 'requestErrors.unavailable' | 'requestErrors.protocolRequired'; i18n.t(key)", false],
        ["t('requestErrors.protocolRequired')", false],
        ["const interpolated: ParseKeysWithoutVariables = 'requestErrors.protocolRequired'", false],
        ["i18n.t('missing.translation')", false],
        ["i18n.use(initReactI18next).init({ react: { useSuspense: 'yes' } })", false]
    ]
    const virtual = new Map([
        [fixturePath, [...imports, ...cases.map(([source]) => source)].join('\n')],
        [resourcesPath, `const resources = ${JSON.stringify({ remnawave: {
            requestErrors: {
                unavailable: dictionaries.en.requestErrors.unavailable,
                protocolRequired: dictionaries.en.requestErrors.protocolRequired
            },
            emptyValue: ''
        } })} as const; export default resources;`]
    ])
    const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
    assert.equal(config.error, undefined)
    const { options, errors } = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
    assert.deepEqual(errors, [])
    const host = ts.createCompilerHost(options)
    const getSourceFile = host.getSourceFile.bind(host)
    host.getSourceFile = (filename, ...args) => virtual.has(path.resolve(filename))
        ? ts.createSourceFile(filename, virtual.get(path.resolve(filename)), options.target, true)
        : getSourceFile(filename, ...args)
    const fileExists = host.fileExists.bind(host)
    host.fileExists = (filename) => virtual.has(path.resolve(filename)) || fileExists(filename)
    const program = ts.createProgram([fixturePath, path.join(root, '@types/i18n.d.ts')], options, host)
    const diagnostics = ts.getPreEmitDiagnostics(program)
    const details = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (filename) => filename,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n'
    })
    assert.ok(diagnostics.every((entry) => entry.file && path.resolve(entry.file.fileName) === fixturePath), details)
    const failedLines = [...new Set(diagnostics.map((entry) =>
        entry.file.getLineAndCharacterOfPosition(entry.start).line
    ))].sort((a, b) => a - b)
    const expectedLines = cases.flatMap(([, valid], index) => valid ? [] : [imports.length + index])
    assert.deepEqual(failedLines, expectedLines, details)
})
