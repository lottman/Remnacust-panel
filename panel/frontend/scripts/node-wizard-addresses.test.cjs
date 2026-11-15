const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const test = require('node:test')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { schemaResolver, useForm } = require('@mantine/form')
const i18next = require('i18next')
const load = require('../../backend/tests/load-typescript.cjs')
const root = path.resolve(__dirname, '..')
const installed = require('@remnawave/backend-contract')
const sourceAddresses = load(path.join(root, '../backend/libs/contract/models/node-control-addresses.schema.ts'))
const socks = load(path.join(root, '../backend/libs/contract/models/socks-proxy.schema.ts'))
const { CreateNodeCommand } = load(path.join(root, '../backend/libs/contract/commands/nodes/create.command.ts'), {
    '../../api': installed, '../../constants': installed, '../../models': installed,
    '../../models/node-control-addresses.schema': sourceAddresses,
    '../../models/socks-proxy.schema': socks,
    './node.response': { NodeResponseSchema: installed.CreateNodeCommand.ResponseSchema }
})
const contract = { ...installed, ...sourceAddresses, CreateNodeCommand }
const addresses = load(path.join(root, 'src/shared/utils/node-control-addresses.ts'), { '@remnawave/backend-contract': contract })
const addressValidation = load(path.join(root, 'src/shared/ui/node-ips/validate-node-control-addresses.ts'), {
    '@remnawave/backend-contract': contract, '@shared/utils/node-control-addresses': addresses
})
const validation = load(path.join(root, 'src/shared/_modals/nodes/create-node-modal/create-node-validation.ts'), {
    '@remnawave/backend-contract': contract,
    '@shared/ui/node-ips/validate-node-control-addresses': addressValidation
})
const valid = () => ({ name: 'Regression node', countryCode: 'XX', port: 2222,
    controlAddresses: [{ address: 'node.example.test', enabled: true }],
    configProfile: { activeConfigProfileUuid: '11111111-1111-4111-8111-111111111111', activeInbounds: ['22222222-2222-4222-8222-222222222222'] }
})
function realForm(values) {
    let form
    function Harness() { form = useForm({ name: 'create-node-form', mode: 'uncontrolled', initialValues: values, validate: validation.getCreateNodeErrors }); return null }
    renderToStaticMarkup(React.createElement(Harness))
    return form
}
test.before(async () => {
    await i18next.init({ lng: 'en', fallbackLng: 'en', resources: Object.fromEntries(['en', 'ru', 'fa', 'zh'].map(language => [language, { translation: JSON.parse(fs.readFileSync(path.join(root, 'public/locales', language, 'remnawave.json'), 'utf8')) }])) })
})

test('actual Mantine async resolver baseline and sync wizard validator remain distinct', async () => {
    const values = { ...valid(), proxyUrl: 'socks5://proxy.example.test:99999' }
    const asyncResult = schemaResolver(CreateNodeCommand.RequestBodySchema)(values)
    assert.equal(typeof asyncResult.then, 'function')
    assert.ok((await asyncResult).proxyUrl)
    const form = realForm(values)
    const result = form.validate()
    assert.equal(typeof result.then, 'undefined')
    assert.equal(result.hasErrors, true)
    assert.equal(result.errors.proxyUrl, i18next.t('node-control-addresses.proxy-invalid'))
    assert.equal(form.validateField('proxyUrl').hasError, true)
    assert.equal(form.getInputProps('proxyUrl')['data-path'], 'create-node-form-proxyUrl')
})

test('source SOCKS rules reject malformed credentials, ports, schemes and paths without echoing secrets', () => {
    for (const proxyUrl of ['https://proxy.example.test:1080', 'socks5://proxy.example.test', 'socks5://proxy.example.test:0', 'socks5://proxy.example.test:99999', 'socks5://fixture:synthetic-only@proxy.example.test:1080/path', 'socks5://fixture:%00@proxy.example.test:1080', 'socks5://proxy.example.test:1080?query=1']) {
        const errors = validation.getCreateNodeErrors({ ...valid(), proxyUrl })
        assert.equal(errors.proxyUrl, i18next.t('node-control-addresses.proxy-invalid'))
        assert.equal(JSON.stringify(errors).includes('synthetic-only'), false)
    }
})

test('hostname, IPv6 and optional direct proxy pass actual form validation without mutating input', () => {
    for (const address of ['node.example.test', '[2001:DB8::20]', '2001:db8::20', '192.0.2.20']) {
        for (const proxyUrl of [undefined, null, 'socks5://proxy.example.test:1080', 'socks5://fixture:synthetic-only@[2001:db8::1]:1080']) {
            const values = { ...valid(), proxyUrl, controlAddresses: [{ address, enabled: true }] }
            const before = structuredClone(values)
            assert.deepEqual(realForm(values).validate(), { hasErrors: false, errors: {} })
            assert.deepEqual(values, before)
        }
    }
})

test('step errors retain UI order, nested numeric address order and correct profile routing', () => {
    const errors = { 'configProfile.activeInbounds.0': 'inbound', proxyUrl: 'proxy', port: 'port', controlAddresses: 'parent', 'controlAddresses.10.address': 'ten', 'controlAddresses.2.address': 'two', name: 'name' }
    assert.deepEqual(Object.keys(validation.getCreateNodeStepErrors(errors, 0)), ['name', 'controlAddresses.2.address', 'controlAddresses.10.address', 'controlAddresses', 'port', 'proxyUrl'])
    assert.deepEqual(validation.getCreateNodeStepErrors(errors, 1), { 'configProfile.activeInbounds.0': 'inbound' })
    for (const key of ['configProfile', 'configProfile.activeConfigProfileUuid', 'configProfile.activeInbounds.0']) assert.equal(validation.getCreateNodeErrorStep(key), 1)
    for (const key of ['name', 'controlAddresses', 'controlAddresses.0.address', 'proxyUrl', 'providerUuid', 'tags.0']) assert.equal(validation.getCreateNodeErrorStep(key), 0)
    assert.equal(errors.proxyUrl, 'proxy')
})

test('connection checks ignore unselected profile while final form validation retains its error', () => {
    const form = realForm({ ...valid(), configProfile: { activeConfigProfileUuid: '', activeInbounds: [] } })
    const result = form.validate()
    assert.equal(result.hasErrors, true)
    assert.deepEqual(validation.getCreateNodeStepErrors(result.errors, 0), {})
    assert.ok(validation.getCreateNodeStepErrors(result.errors, 1)['configProfile.activeConfigProfileUuid'])
    form.setFieldValue('proxyUrl', 'https://proxy.example.test:1080')
    const finalErrors = form.validate().errors
    assert.equal(Object.keys(validation.getCreateNodeStepErrors(finalErrors, 0))[0], 'proxyUrl')
    assert.ok(finalErrors['configProfile.activeConfigProfileUuid'])
})

test('required, invalid, duplicate and all-disabled addresses use real address schemas', () => {
    for (const [controlAddresses, expected] of [
        [[], 'controlAddresses'],
        [[{ address: '', enabled: true }], 'controlAddresses.0.address'],
        [[{ address: 'https://node.example.test:2222/path', enabled: true }], 'controlAddresses.0.address'],
        [[{ address: '2001:0db8::20', enabled: true }, { address: '[2001:db8::20]', enabled: true }], 'controlAddresses.1.address']
    ]) assert.ok(realForm({ ...valid(), controlAddresses }).validate().errors[expected])
    assert.equal(realForm({ ...valid(), controlAddresses: [{ address: 'node.example.test', enabled: false }] }).validate().hasErrors, false)
})

test('proxy field errors are translated in RU/EN/FA/ZH with no fallback or raw schema text', async () => {
    const translated = new Set()
    for (const language of ['ru', 'en', 'fa', 'zh']) {
        await i18next.changeLanguage(language)
        const resources = i18next.getResource(language, 'translation', 'node-control-addresses.proxy-invalid')
        assert.equal(typeof resources, 'string')
        const errors = validation.getCreateNodeErrors({ ...valid(), proxyUrl: 'socks5://proxy.example.test:99999' })
        assert.equal(errors.proxyUrl, resources)
        assert.equal(errors.proxyUrl.includes('Expected socks5://'), false)
        translated.add(errors.proxyUrl)
    }
    assert.equal(translated.size, 4)
    await i18next.changeLanguage('en')
})

test('actual DOM events in isolated local Chrome', { skip: process.env.NODE_WIZARD_BROWSER !== '1', timeout: 180000 }, async t => {
    const { launchBrowser } = require('../tests/fixtures/node-wizard/cdp.cjs')
    const url = process.env.NODE_WIZARD_URL ?? 'http://127.0.0.1:4347/'
    const origin = new URL(url)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Browser fixture must use loopback')
    let server
    try { await fetch(url, { signal: AbortSignal.timeout(1500) }) }
    catch {
        server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'tests/fixtures/node-wizard/vite.config.ts', '--port', origin.port || '4347'], { cwd: root, stdio: 'ignore', windowsHide: true })
        t.after(() => server.kill())
        for (let attempt = 0; attempt < 100; attempt++) {
            try { if ((await fetch(url)).ok) break } catch {}
            await new Promise(resolve => setTimeout(resolve, 100))
        }
    }
    const browser = await launchBrowser()
    t.after(() => browser.close())
    await browser.navigate(url)
    const available = await browser.evaluate('nodeWizardFixture.browserCaseNames')
    const names = process.env.NODE_WIZARD_CASE ? available.filter(name => process.env.NODE_WIZARD_CASE.split(',').includes(name)) : available
    assert.ok(names.length, 'No matching browser regression cases')
    for (const name of names) {
        const languages = name === 'invalid-proxy-next' ? ['en', 'ru', 'fa', 'zh'] : ['en']
        for (const language of languages) await t.test(name + ' (' + language + ')', { timeout: 18000 }, async () => {
            const target = new URL(url)
            target.searchParams.set('lang', language)
            if (name === 'compact-addresses') target.searchParams.set('editor', '1')
            await browser.navigate(target.href)
            const result = await browser.evaluate(`nodeWizardFixture.runCase(${JSON.stringify(name)})`)
            assert.equal(typeof result, 'object')
        })
    }
})
